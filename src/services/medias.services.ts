import { Request } from 'express'
import {
  getFiles,
  getNameFromFullname,
  handleUploadImage,
  handleUploadVideo,
  handleUploadVideoHLS
} from '../utils/file'
import sharp from 'sharp'
import { UPLOAD_IMAGES_DIR, UPLOAD_VIDEO_DIR, UPLOAD_VIDEO_HLS_DIR } from '../constants/dir'
import path from 'path'
import fs from 'fs'
import fsPromise from 'fs/promises'
import { EncodingStatus, MediaType } from '../constants/enums'
import { Media } from '../models/Other'
import { encodeHLSWithMultipleVideoStreams } from '../utils/video'
import databaseService from './database.services'
import VideoStatus from '../models/schemas/VideoStatus.schema'
import { uploadFileS3 } from '../utils/s3'
import { CompleteMultipartUploadCommandOutput } from '@aws-sdk/client-s3'
let mime: any
;(async () => {
  const mimeModule = await import('mime')
  mime = mimeModule
})()
class Queue {
  items: string[]
  encoding: boolean
  constructor() {
    this.items = []
    this.encoding = false
  }
  async enqueue(item: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.items.push(item)
      const idName = item.replace(/\\/g, '\\\\').split('\\').pop() as string
      databaseService.videoStatus
        .insertOne(
          new VideoStatus({
            name: idName,
            status: EncodingStatus.Pending
          })
        )
        .then(() => {
          this.processEncode(resolve, reject)
        })
        .catch(reject)
    })
  }

  async processEncode(onComplete?: (m3u8Url: string) => void, onError?: (error: any) => void) {
    if (this.encoding) return
    if (this.items.length > 0) {
      this.encoding = true
      const videoPath = this.items[0]
      const idName = videoPath.replace(/\\/g, '\\\\').split('\\').pop() as string

      await databaseService.videoStatus.updateOne(
        { name: idName },
        {
          $set: {
            status: EncodingStatus.Processing
          },
          $currentDate: {
            update_at: true
          }
        }
      )

      try {
        await encodeHLSWithMultipleVideoStreams(videoPath)
        this.items.shift()

        const files = getFiles(path.resolve(UPLOAD_VIDEO_HLS_DIR, idName))
        let m3u8Url = ''

        await Promise.all(
          files.map(async (filepath) => {
            const fileName = 'videos-hls/' + filepath.replace(path.resolve(UPLOAD_VIDEO_HLS_DIR), '')
            const s3Upload = await uploadFileS3({
              filePath: filepath,
              filename: fileName,
              contentType: mime.default.getType(filepath) as string
            })

            if (filepath.endsWith('/master.m3u8')) {
              m3u8Url = (s3Upload as CompleteMultipartUploadCommandOutput).Location as string
            }
            return s3Upload
          })
        )

        fs.unlinkSync(videoPath)
        await databaseService.videoStatus.updateOne(
          { name: idName },
          {
            $set: {
              status: EncodingStatus.Success
            },
            $currentDate: {
              update_at: true
            }
          }
        )

        console.log(`Encode video ${videoPath} success`)

        if (onComplete && m3u8Url) onComplete(m3u8Url)
      } catch (error) {
        await databaseService.videoStatus
          .updateOne(
            { name: idName },
            {
              $set: {
                status: EncodingStatus.Failed
              },
              $currentDate: {
                update_at: true
              }
            }
          )
          .catch((err) => {
            console.log('Update video status error', err)
          })
        console.error(`Encode video ${videoPath} error`, error)
        if (onError) onError(error)
      }

      this.encoding = false
      this.processEncode()
    } else {
      console.log('Encode video queue is empty')
    }
  }
}

const queue = new Queue()
class MediaService {
  async uploadImage(req: Request) {
    const files = await handleUploadImage(req)
    const result = await Promise.all(
      files.map(async (file) => {
        const newName = getNameFromFullname(file.newFilename)
        const newFullFileName = `${newName}.jpg`
        const newPath = path.resolve(UPLOAD_IMAGES_DIR, newFullFileName)
        await sharp(file.filepath).jpeg().toFile(newPath)
        const s3Result = await uploadFileS3({
          filename: 'Images/' + newFullFileName,
          filePath: newPath,
          contentType: mime.default.getType(newFullFileName) as string
        })
        await Promise.all([fsPromise.unlink(file.filepath), fsPromise.unlink(newPath)])
        return {
          url: (s3Result as CompleteMultipartUploadCommandOutput).Location,
          type: MediaType.Image
        }
      })
    )
    return result
  }
  async uploadVideo(req: Request) {
    const files = await handleUploadVideo(req)
    const result = await Promise.all(
      files.map(async (file) => {
        const s3Result = await uploadFileS3({
          filename: 'Videos/' + file.newFilename,
          contentType: file.mimetype as string,
          filePath: file.filepath
        })
        const newPath = path.resolve(UPLOAD_VIDEO_DIR, `${file.newFilename}.mp4`)
        await fs.promises.copyFile(file.filepath, newPath)
        await Promise.all([fsPromise.unlink(file.filepath), fsPromise.unlink(newPath)])
        return {
          url: (s3Result as CompleteMultipartUploadCommandOutput).Location,
          type: MediaType.Video
        }
        // return {
        //   url: isProduction
        //     ? `${envConfig.host}/static/video-stream/${file.newFilename}.mp4`
        //     : `http://localhost:${envConfig.port}/static/video-stream/${file.newFilename}.mp4`,
        //   type: MediaType.Video
        // }
      })
    )
    return result
  }
  async uploadVideoHLS(req: Request) {
    const files = await handleUploadVideoHLS(req)

    const result: Media[] = await Promise.all(
      files.map(async (file) => {
        const m3u8Url = await queue.enqueue(file.filepath)

        return {
          url: m3u8Url,
          type: MediaType.HLS
        }
      })
    )

    return result
  }

  async getVideoStatus(idStatus: string) {
    const result = await databaseService.videoStatus.findOne({ name: idStatus })
    return result
  }
}

const mediaService = new MediaService()
export default mediaService
