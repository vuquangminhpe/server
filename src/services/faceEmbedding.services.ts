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
  face_features: {
    landmarks: number[]
    quality_score: number
    brightness: number
    contrast: number
  }
  created_at: Date
  updated_at: Date
}

class FaceEmbeddingService {
  private session: ort.InferenceSession | null = null
  private isInitialized = false
  private readonly SIMILARITY_THRESHOLD = 0.65
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
    try {
      if (!fs.existsSync(this.MODEL_PATH)) {
        console.log('ONNX model not found, downloading...')
        await this.downloadModel()
      }

      this.session = await ort.InferenceSession.create(this.MODEL_PATH)
      this.isInitialized = true
      console.log('✅ ONNX face recognition model loaded successfully')
    } catch (error) {
      console.error('❌ Failed to load ONNX model:', error)
      console.log('Falling back to advanced face recognition method')
    }
  }

  private async downloadModel() {
    const modelUrl =
      'https://github.com/onnx/models/raw/main/validated/vision/body_analysis/arcface/model/arcfaceresnet100-11-int8.onnx'

    try {
      const https = require('https')
      const fs = require('fs')

      const modelsDir = path.dirname(this.MODEL_PATH)
      if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true })
      }

      return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(this.MODEL_PATH)
        https
          .get(modelUrl, (response: any) => {
            if (
              response.headers['content-type'] &&
              !response.headers['content-type'].includes('application/octet-stream')
            ) {
              console.error('❌ Invalid content type:', response.headers['content-type'])
              file.close()
              fs.unlink(this.MODEL_PATH, () => {})
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
            fs.unlink(this.MODEL_PATH, () => {})
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
   * Enhanced face detection and preprocessing
   */
  private async detectAndAlignFace(imageBuffer: Buffer): Promise<{
    alignedFace: Buffer
    quality: number
    landmarks: number[]
  }> {
    try {
      // Basic face detection using image analysis
      const image = sharp(imageBuffer)
      const { data, info } = await image
        .resize(256, 256, { fit: 'cover' })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true })

      // Simple face region detection using variance analysis
      const faceRegion = this.detectFaceRegion(data, info.width, info.height)

      // Extract and align face
      const alignedFace = await sharp(imageBuffer)
        .extract({
          left: Math.max(0, faceRegion.x - 20),
          top: Math.max(0, faceRegion.y - 20),
          width: Math.min(info.width, faceRegion.width + 40),
          height: Math.min(info.height, faceRegion.height + 40)
        })
        .resize(224, 224)
        .toBuffer()

      // Calculate quality metrics
      const quality = this.calculateImageQuality(data, info.width, info.height)

      // Generate simple landmarks (approximation)
      const landmarks = this.generateLandmarks(faceRegion, info.width, info.height)

      return { alignedFace, quality, landmarks }
    } catch (error) {
      console.error('Face detection failed, using full image:', error)

      // Fallback: use center crop
      const alignedFace = await sharp(imageBuffer).resize(224, 224, { fit: 'cover' }).toBuffer()

      return {
        alignedFace,
        quality: 0.5,
        landmarks: new Array(10).fill(0)
      }
    }
  }

  /**
   * Simple face region detection using variance
   */
  private detectFaceRegion(
    data: Buffer,
    width: number,
    height: number
  ): {
    x: number
    y: number
    width: number
    height: number
  } {
    // Find region with highest variance (likely face)
    const blockSize = 32
    let maxVariance = 0
    let bestRegion = { x: 0, y: 0, width: width, height: height }

    for (let y = 0; y < height - blockSize; y += 16) {
      for (let x = 0; x < width - blockSize; x += 16) {
        const variance = this.calculateVariance(data, x, y, blockSize, width)
        if (variance > maxVariance) {
          maxVariance = variance
          bestRegion = {
            x: Math.max(0, x - blockSize),
            y: Math.max(0, y - blockSize),
            width: Math.min(width - x, blockSize * 3),
            height: Math.min(height - y, blockSize * 3)
          }
        }
      }
    }

    return bestRegion
  }

  private calculateVariance(data: Buffer, startX: number, startY: number, size: number, width: number): number {
    let sum = 0
    let sumSquares = 0
    let count = 0

    for (let y = startY; y < startY + size; y++) {
      for (let x = startX; x < startX + size; x++) {
        const idx = y * width + x
        if (idx < data.length) {
          const pixel = data[idx]
          sum += pixel
          sumSquares += pixel * pixel
          count++
        }
      }
    }

    if (count === 0) return 0
    const mean = sum / count
    return sumSquares / count - mean * mean
  }

  private calculateImageQuality(data: Buffer, width: number, height: number): number {
    // Calculate brightness, contrast, sharpness
    let brightness = 0
    let contrast = 0
    let sharpness = 0
    const totalPixels = width * height

    // Brightness
    for (let i = 0; i < data.length; i++) {
      brightness += data[i]
    }
    brightness /= totalPixels

    // Contrast (standard deviation)
    for (let i = 0; i < data.length; i++) {
      contrast += Math.pow(data[i] - brightness, 2)
    }
    contrast = Math.sqrt(contrast / totalPixels)

    // Simple sharpness (edge detection)
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x
        const sobel = Math.abs(
          -data[idx - width - 1] -
            2 * data[idx - width] -
            data[idx - width + 1] +
            data[idx + width - 1] +
            2 * data[idx + width] +
            data[idx + width + 1]
        )
        sharpness += sobel
      }
    }
    sharpness /= totalPixels

    // Normalize quality score (0-1)
    const qualityScore = Math.min(1, (brightness / 128 + contrast / 64 + sharpness / 32) / 3)
    return qualityScore
  }

  private generateLandmarks(faceRegion: any, width: number, height: number): number[] {
    // Simple landmark approximation
    const cx = faceRegion.x + faceRegion.width / 2
    const cy = faceRegion.y + faceRegion.height / 2
    const w = faceRegion.width
    const h = faceRegion.height

    return [
      cx - w * 0.3,
      cy - h * 0.2, // Left eye
      cx + w * 0.3,
      cy - h * 0.2, // Right eye
      cx,
      cy, // Nose tip
      cx - w * 0.2,
      cy + h * 0.2, // Left mouth
      cx + w * 0.2,
      cy + h * 0.2 // Right mouth
    ]
  }

  /**
   * Enhanced preprocessing for ONNX model
   */
  private async preprocessForONNX(imageBuffer: Buffer): Promise<Float32Array> {
    try {
      // First detect and align face
      const { alignedFace } = await this.detectAndAlignFace(imageBuffer)

      const { data, info } = await sharp(alignedFace)
        .resize(112, 112)
        .removeAlpha()
        .toColorspace('srgb')
        .raw()
        .toBuffer({ resolveWithObject: true })

      if (data.length !== 112 * 112 * 3) {
        throw new Error(`Invalid data length: ${data.length}`)
      }

      // Convert to CHW format with proper normalization
      const float32Data = new Float32Array(3 * 112 * 112)

      for (let h = 0; h < 112; h++) {
        for (let w = 0; w < 112; w++) {
          for (let c = 0; c < 3; c++) {
            const srcIdx = (h * 112 + w) * 3 + c
            const dstIdx = c * 112 * 112 + h * 112 + w

            // Normalize to [-1, 1] range (ArcFace standard)
            float32Data[dstIdx] = (data[srcIdx] / 255.0 - 0.5) / 0.5
          }
        }
      }

      return float32Data
    } catch (error) {
      console.error('Error in preprocessing:', error)
      throw error
    }
  }

  /**
   * Extract face embedding using enhanced ONNX
   */
  async extractFaceEmbedding(imageBuffer: Buffer): Promise<number[] | null> {
    await this.ensureInitialized()

    if (!this.isInitialized || !this.session) {
      console.log('ONNX model not available, using advanced fallback')
      return this.extractAdvancedFaceEmbedding(imageBuffer)
    }

    try {
      const inputData = await this.preprocessForONNX(imageBuffer)
      const inputTensor = new ort.Tensor('float32', inputData, [1, 3, 112, 112])

      const results = await this.session.run({ data: inputTensor })
      const outputName = this.session.outputNames[0]
      const outputTensor = results[outputName]
      const embedding = Array.from(outputTensor.data as Float32Array)

      // L2 normalization for better similarity calculation
      return this.l2Normalize(embedding)
    } catch (error) {
      console.error('ONNX extraction failed:', error)
      return this.extractAdvancedFaceEmbedding(imageBuffer)
    }
  }

  /**
   * Advanced fallback face embedding
   */
  private async extractAdvancedFaceEmbedding(imageBuffer: Buffer): Promise<number[] | null> {
    try {
      const { alignedFace, quality, landmarks } = await this.detectAndAlignFace(imageBuffer)

      const { data } = await sharp(alignedFace).resize(128, 128).greyscale().raw().toBuffer({ resolveWithObject: true })

      const features = []

      // 1. Multi-scale Local Binary Patterns
      for (const radius of [1, 2, 3]) {
        const lbp = this.extractLBP(data, 128, 128, radius)
        features.push(...lbp)
      }

      // 2. Gabor filter responses
      const gaborFeatures = this.extractGaborFeatures(data, 128, 128)
      features.push(...gaborFeatures)

      // 3. Histogram of Oriented Gradients
      const hogFeatures = this.extractHOGFeatures(data, 128, 128)
      features.push(...hogFeatures)

      // 4. Facial landmarks features
      features.push(...landmarks.map((l) => l / 128)) // Normalize

      // 5. Quality metrics
      features.push(quality)

      return this.l2Normalize(features)
    } catch (error) {
      console.error('Error in advanced face embedding:', error)
      return null
    }
  }

  /**
   * Multi-scale Local Binary Pattern
   */
  private extractLBP(data: Buffer, width: number, height: number, radius: number): number[] {
    const features = []
    const histogram = new Array(256).fill(0)

    for (let y = radius; y < height - radius; y += 2) {
      for (let x = radius; x < width - radius; x += 2) {
        const center = data[y * width + x]
        let pattern = 0

        // 8-neighbor LBP
        const angles = [0, 45, 90, 135, 180, 225, 270, 315]
        for (let i = 0; i < 8; i++) {
          const angle = (angles[i] * Math.PI) / 180
          const nx = Math.round(x + radius * Math.cos(angle))
          const ny = Math.round(y + radius * Math.sin(angle))

          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const neighbor = data[ny * width + nx]
            if (neighbor >= center) {
              pattern |= 1 << i
            }
          }
        }

        histogram[pattern]++
      }
    }

    // Normalize histogram
    const total = histogram.reduce((sum, val) => sum + val, 0)
    return histogram.map((count) => count / (total || 1))
  }

  /**
   * Gabor filter features
   */
  private extractGaborFeatures(data: Buffer, width: number, height: number): number[] {
    const features = []

    // Multiple orientations and scales
    const orientations = [0, 30, 60, 90, 120, 150]
    const scales = [2, 4, 8]

    for (const orientation of orientations) {
      for (const scale of scales) {
        let response = 0
        const theta = (orientation * Math.PI) / 180

        for (let y = scale; y < height - scale; y += 4) {
          for (let x = scale; x < width - scale; x += 4) {
            // Simplified Gabor kernel
            const kernel =
              Math.exp(-((x - width / 2) ** 2 + (y - height / 2) ** 2) / (2 * scale ** 2)) *
              Math.cos((2 * Math.PI * (x * Math.cos(theta) + y * Math.sin(theta))) / scale)

            response += data[y * width + x] * kernel
          }
        }

        features.push(response / (width * height))
      }
    }

    return features
  }

  /**
   * Histogram of Oriented Gradients
   */
  private extractHOGFeatures(data: Buffer, width: number, height: number): number[] {
    const features = []
    const cellSize = 8
    const blockSize = 2

    // Calculate gradients
    const gradients = []
    const orientations = []

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const gx = data[y * width + (x + 1)] - data[y * width + (x - 1)]
        const gy = data[(y + 1) * width + x] - data[(y - 1) * width + x]

        const magnitude = Math.sqrt(gx * gx + gy * gy)
        const orientation = ((Math.atan2(gy, gx) * 180) / Math.PI + 180) % 180

        gradients.push(magnitude)
        orientations.push(orientation)
      }
    }

    // Build HOG features
    for (let by = 0; by < Math.floor(height / cellSize) - blockSize + 1; by++) {
      for (let bx = 0; bx < Math.floor(width / cellSize) - blockSize + 1; bx++) {
        const blockFeatures = []

        for (let cy = by; cy < by + blockSize; cy++) {
          for (let cx = bx; cx < bx + blockSize; cx++) {
            const histogram = new Array(9).fill(0)

            for (let y = cy * cellSize; y < (cy + 1) * cellSize; y++) {
              for (let x = cx * cellSize; x < (cx + 1) * cellSize; x++) {
                const idx = y * (width - 2) + x
                if (idx < gradients.length) {
                  const bin = Math.floor(orientations[idx] / 20)
                  histogram[Math.min(bin, 8)] += gradients[idx]
                }
              }
            }

            blockFeatures.push(...histogram)
          }
        }

        // L2 normalize block
        const norm = Math.sqrt(blockFeatures.reduce((sum, val) => sum + val * val, 0))
        features.push(...blockFeatures.map((val) => val / (norm || 1)))
      }
    }

    return features
  }

  /**
   * L2 normalization
   */
  private l2Normalize(vector: number[]): number[] {
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0))
    if (norm === 0) return vector
    return vector.map((val) => val / norm)
  }

  /**
   * Enhanced cosine similarity with quality weighting
   */
  private calculateSimilarity(embedding1: number[], embedding2: number[], quality1 = 1, quality2 = 1): number {
    if (embedding1.length !== embedding2.length) return 0

    let dotProduct = 0
    let norm1 = 0
    let norm2 = 0

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i]
      norm1 += embedding1[i] * embedding1[i]
      norm2 += embedding2[i] * embedding2[i]
    }

    if (norm1 === 0 || norm2 === 0) return 0

    const cosineSim = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2))

    // Weight by image quality
    const qualityWeight = Math.sqrt(quality1 * quality2)

    return cosineSim * qualityWeight
  }

  /**
   * Store face embedding with quality metrics
   */
  async storeFaceEmbedding(userId: string, imageBuffer: Buffer): Promise<boolean> {
    try {
      const { alignedFace, quality, landmarks } = await this.detectAndAlignFace(imageBuffer)
      const embedding = await this.extractFaceEmbedding(alignedFace)

      if (!embedding) {
        throw new Error('Failed to extract face embedding')
      }

      // Calculate additional quality metrics
      const stats = await sharp(alignedFace).stats()
      const brightness = stats.channels[0].mean / 255
      const contrast = stats.channels[0].stdev / 255

      const faceEmbeddingDoc: FaceEmbedding = {
        user_id: new ObjectId(userId),
        embedding,
        face_features: {
          landmarks,
          quality_score: quality,
          brightness,
          contrast
        },
        created_at: new Date(),
        updated_at: new Date()
      }

      await databaseService.db
        .collection('face_embeddings')
        .replaceOne({ user_id: new ObjectId(userId) }, faceEmbeddingDoc, { upsert: true })

      console.log(`✅ Face embedding stored for user ${userId} with quality ${quality.toFixed(3)}`)
      return true
    } catch (error) {
      console.error('Error storing face embedding:', error)
      return false
    }
  }

  /**
   * Enhanced face verification
   */
  async verifyFace(
    userId: string,
    imageBuffer: Buffer
  ): Promise<{
    isMatch: boolean
    similarity: number
    confidence: 'high' | 'medium' | 'low'
    quality_score: number
  }> {
    try {
      // Extract new embedding
      const { alignedFace, quality } = await this.detectAndAlignFace(imageBuffer)
      const newEmbedding = await this.extractFaceEmbedding(alignedFace)

      if (!newEmbedding) {
        throw new Error('Failed to extract face embedding from new image')
      }

      // Get stored embedding
      const storedEmbeddingDoc = await databaseService.db
        .collection('face_embeddings')
        .findOne({ user_id: new ObjectId(userId) })

      if (!storedEmbeddingDoc) {
        throw new Error('No stored face embedding found for this user')
      }

      // Calculate similarity with quality weighting
      const similarity = this.calculateSimilarity(
        storedEmbeddingDoc.embedding,
        newEmbedding,
        storedEmbeddingDoc.face_features.quality_score,
        quality
      )

      // Determine confidence based on quality and similarity
      let confidence: 'high' | 'medium' | 'low'
      const avgQuality = (storedEmbeddingDoc.face_features.quality_score + quality) / 2

      if (similarity >= 0.8 && avgQuality >= 0.7) {
        confidence = 'high'
      } else if (similarity >= 0.6 && avgQuality >= 0.5) {
        confidence = 'medium'
      } else {
        confidence = 'low'
      }

      const isMatch = similarity >= this.SIMILARITY_THRESHOLD

      console.log(
        `Face verification: similarity=${similarity.toFixed(3)}, quality=${quality.toFixed(3)}, match=${isMatch}`
      )

      return {
        isMatch,
        similarity,
        confidence,
        quality_score: quality
      }
    } catch (error) {
      console.error('Face verification failed:', error)
      return {
        isMatch: false,
        similarity: 0,
        confidence: 'low',
        quality_score: 0
      }
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
   * Health check with detailed info
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy'
    initialized: boolean
    method: string
    threshold: number
    model_path: string
  }> {
    await this.ensureInitialized()

    return {
      status: 'healthy', // Always healthy with fallback
      initialized: this.isInitialized,
      method: this.isInitialized ? 'onnx_enhanced' : 'advanced_fallback',
      threshold: this.SIMILARITY_THRESHOLD,
      model_path: this.MODEL_PATH
    }
  }
}

const faceEmbeddingService = new FaceEmbeddingService()
export default faceEmbeddingService
