import * as ort from 'onnxruntime-node'
import sharp from 'sharp'
import { ObjectId } from 'mongodb'
import databaseService from './database.services'
import fs from 'fs'
import path from 'path'

interface FaceEmbedding {
  _id?: ObjectId
  user_id: ObjectId
  embedding: number[]
  created_at: Date
  updated_at: Date
}

class FaceEmbeddingService {
  private session: ort.InferenceSession | null = null
  private isInitialized = false
  private readonly SIMILARITY_THRESHOLD = 0.92
  private readonly MODEL_PATH = path.join(process.cwd(), 'src', 'models', 'arcfaceresnet100-11-int8.onnx')
  private initPromise: Promise<void> | null = null
  constructor() {
    this.initPromise = this.initializeModel()
  }
  async ensureInitialized() {
    if (this.initPromise) {
      await this.initPromise
    }
    return this.isInitialized
  }

  private async initializeModel() {
    console.log(this.MODEL_PATH)

    try {
      // Check if model exists
      if (!fs.existsSync(this.MODEL_PATH)) {
        console.log('ONNX model not found, downloading...')
        await this.downloadModel()
      }

      // Load the ONNX model
      this.session = await ort.InferenceSession.create(this.MODEL_PATH)
      this.isInitialized = true
      console.log('ONNX face recognition model loaded successfully')
    } catch (error) {
      console.error('Failed to load ONNX model:', error)
      // Fallback to simple method
      console.log('Falling back to simple face recognition method')
    }
  }

  private async downloadModel() {
    // Download pre-trained ArcFace model (small, accurate)
    // Đổi thành URL raw từ GitHub
    const modelUrl =
      'https://github.com/onnx/models/raw/main/validated/vision/body_analysis/arcface/model/arcfaceresnet100-11-int8.onnx'

    try {
      const https = require('https')
      const fs = require('fs')

      // Create models directory
      const modelsDir = path.dirname(this.MODEL_PATH)
      if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true })
      }

      return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(this.MODEL_PATH)
        https
          .get(modelUrl, (response: any) => {
            // Kiểm tra xem response có phải là file binary không
            if (
              response.headers['content-type'] &&
              !response.headers['content-type'].includes('application/octet-stream')
            ) {
              console.error('❌ Received non-binary response:', response.headers['content-type'])
              file.close()
              fs.unlink(this.MODEL_PATH, () => {}) // Delete partial file
              reject(new Error('Invalid content type'))
              return
            }

            response.pipe(file)
            file.on('finish', () => {
              file.close()
              console.log('✅ ONNX model downloaded successfully')
              resolve(true)
            })
          })
          .on('error', (err: any) => {
            fs.unlink(this.MODEL_PATH, () => {}) // Delete partial file
            console.error('❌ Error downloading model:', err.message)
            reject(err)
          })
      })
    } catch (error) {
      console.error('Failed to download ONNX model:', error)
      throw error
    }
  }

  /**
   * Preprocess image for ONNX model
   */
  private async preprocessImage(imageBuffer: Buffer): Promise<Float32Array> {
    try {
      // Resize to 112x112 (ArcFace input size) và chỉ định rõ là 3 kênh màu RGB
      const { data, info } = await sharp(imageBuffer)
        .resize(112, 112)
        .removeAlpha()
        .toColorspace('srgb')
        .raw()
        .toBuffer({ resolveWithObject: true })

      if (data.length !== 112 * 112 * 3) {
        console.warn(`Unexpected data length: ${data.length}, expected: ${112 * 112 * 3}`)
      }

      // Chuyển đổi từ định dạng HWC sang CHW
      const float32Data = new Float32Array(3 * 112 * 112)

      for (let h = 0; h < 112; h++) {
        for (let w = 0; w < 112; w++) {
          for (let c = 0; c < 3; c++) {
            // Vị trí trong mảng gốc (HWC format)
            const srcIdx = (h * 112 + w) * 3 + c
            // Vị trí trong mảng đích (CHW format)
            const dstIdx = c * 112 * 112 + h * 112 + w

            // Chuẩn hóa giá trị sang [-1, 1]
            float32Data[dstIdx] = (data[srcIdx] / 255.0 - 0.5) / 0.5
          }
        }
      }

      return float32Data
    } catch (error) {
      console.error('Error preprocessing image:', error)
      throw error
    }
  }

  /**
   * Extract face embedding using ONNX
   */
  async extractFaceEmbedding(imageBuffer: Buffer): Promise<number[] | null> {
    await this.ensureInitialized()
    if (!this.isInitialized || !this.session) {
      console.log('ONNX model not initialized, falling back to simple method')
      return this.extractSimpleFaceEmbedding(imageBuffer)
    }

    try {
      // Preprocess image
      const inputData = await this.preprocessImage(imageBuffer)

      const inputTensor = new ort.Tensor('float32', inputData, [1, 3, 112, 112])

      const results = await this.session.run({ data: inputTensor })

      const outputName = this.session.outputNames[0]

      const outputTensor = results[outputName]
      const embedding = Array.from(outputTensor.data as Float32Array)

      const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))
      const normalizedEmbedding = embedding.map((val) => val / norm)

      return normalizedEmbedding
    } catch (error) {
      console.error('Error extracting ONNX face embedding:', error)
      return this.extractSimpleFaceEmbedding(imageBuffer)
    }
  }

  /**
   * Fallback simple face embedding (without ML models)
   */
  private async extractSimpleFaceEmbedding(imageBuffer: Buffer): Promise<number[] | null> {
    try {
      const { data } = await sharp(imageBuffer).resize(64, 64).grayscale().raw().toBuffer({ resolveWithObject: true })

      const features = []

      const histogram = new Array(64).fill(0)
      for (let i = 0; i < data.length; i++) {
        const bin = Math.floor(data[i] / 4)
        histogram[Math.min(bin, 63)]++
      }

      for (let y = 1; y < 63; y++) {
        for (let x = 1; x < 63; x += 8) {
          const center = data[y * 64 + x]
          let pattern = 0

          // Check 8 neighbors
          const neighbors = [
            data[(y - 1) * 64 + (x - 1)],
            data[(y - 1) * 64 + x],
            data[(y - 1) * 64 + (x + 1)],
            data[y * 64 + (x + 1)],
            data[(y + 1) * 64 + (x + 1)],
            data[(y + 1) * 64 + x],
            data[(y + 1) * 64 + (x - 1)],
            data[y * 64 + (x - 1)]
          ]

          for (let i = 0; i < 8; i++) {
            if (neighbors[i] >= center) {
              pattern |= 1 << i
            }
          }

          features.push(pattern / 255.0)
        }
      }

      const totalPixels = data.length
      for (const count of histogram) {
        features.push(count / totalPixels)
      }

      return features
    } catch (error) {
      console.error('Error extracting simple face embedding:', error)
      return null
    }
  }

  /**
   * Calculate cosine similarity
   */
  private calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      return 0
    }

    let dotProduct = 0
    let norm1 = 0
    let norm2 = 0

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i]
      norm1 += embedding1[i] * embedding1[i]
      norm2 += embedding2[i] * embedding2[i]
    }

    if (norm1 === 0 || norm2 === 0) {
      return 0
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2))
  }

  /**
   * Store face embedding
   */
  async storeFaceEmbedding(userId: string, imageBuffer: Buffer): Promise<boolean> {
    try {
      const embedding = await this.extractFaceEmbedding(imageBuffer)

      if (!embedding) {
        throw new Error('Failed to extract face embedding')
      }

      const faceEmbeddingDoc: FaceEmbedding = {
        user_id: new ObjectId(userId),
        embedding,
        created_at: new Date(),
        updated_at: new Date()
      }

      await databaseService.db
        .collection('face_embeddings')
        .replaceOne({ user_id: new ObjectId(userId) }, faceEmbeddingDoc, { upsert: true })

      return true
    } catch (error) {
      console.error('Error storing face embedding:', error)
      return false
    }
  }

  /**
   * Verify face
   * 
   * : Promise<{
    isMatch: boolean
    similarity: number
    confidence: 'high' | 'medium' | 'low'
   */
  async verifyFace(
    userId: string,
    imageBuffer: Buffer
  ): Promise<{
    isMatch: boolean
    similarity: number
    confidence: 'high' | 'medium' | 'low'
  }> {
    try {
      // Log để kiểm tra xem đang sử dụng phương thức nào
      console.log('Using face recognition method:', this.isInitialized ? 'ONNX model' : 'Simple fallback')

      // Trích xuất embedding từ ảnh mới
      const newEmbedding = await this.extractFaceEmbedding(imageBuffer)
      if (!newEmbedding) {
        throw new Error('Failed to extract face embedding from new image')
      }

      // Lấy embedding đã lưu
      const storedEmbeddingDoc = await databaseService.db
        .collection('face_embeddings')
        .findOne({ user_id: new ObjectId(userId) })

      if (!storedEmbeddingDoc) {
        throw new Error('No stored face embedding found for this user')
      }

      // Log độ dài của các embedding để kiểm tra
      console.log('Stored embedding length:', storedEmbeddingDoc.embedding.length)
      console.log('New embedding length:', newEmbedding.length)

      // Tính độ tương đồng
      const similarity = this.calculateSimilarity(storedEmbeddingDoc.embedding, newEmbedding)

      return {
        isMatch: similarity >= this.SIMILARITY_THRESHOLD,
        similarity,
        confidence: similarity >= 0.8 ? 'high' : similarity >= 0.6 ? 'medium' : 'low'
      }
    } catch (error) {
      console.error('Face verification failed:', error)
      return { isMatch: false, similarity: 0, confidence: 'low' }
    }
  }

  /**
   * Delete face embedding
   */
  async deleteFaceEmbedding(userId: string): Promise<boolean> {
    try {
      const result = await databaseService.db.collection('face_embeddings').deleteOne({ user_id: new ObjectId(userId) })

      return result.deletedCount > 0
    } catch (error) {
      console.error('Error deleting face embedding:', error)
      return false
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy'
    initialized: boolean
    method: string
  }> {
    return {
      status: this.isInitialized ? 'healthy' : 'unhealthy',
      initialized: this.isInitialized,
      method: this.isInitialized ? 'onnx' : 'simple_fallback'
    }
  }
}

const faceEmbeddingService = new FaceEmbeddingService()
export default faceEmbeddingService
