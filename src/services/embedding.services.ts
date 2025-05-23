// src/services/embedding.services.ts
import * as ort from 'onnxruntime-node'
import sharp from 'sharp'
import { ObjectId } from 'mongodb'
import databaseService from './database.services'
import fs from 'fs'
import path from 'path'
import faceEmbeddingService from './faceEmbedding.services'

interface TextEmbedding {
  _id?: ObjectId
  user_id: ObjectId
  text: string
  embedding: number[]
  type: 'profile' | 'description' | 'bio'
  created_at: Date
  updated_at: Date
}

interface ImageEmbedding {
  _id?: ObjectId
  user_id: ObjectId
  image_url: string
  embedding: number[]
  image_hash: string
  created_at: Date
  updated_at: Date
}

// Pre-defined semantic word clusters for better text matching
const SEMANTIC_CLUSTERS = {
  gender: {
    female: ['female', 'girl', 'woman', 'lady', 'cô', 'chị', 'em gái', 'nữ'],
    male: ['male', 'boy', 'man', 'guy', 'anh', 'em trai', 'nam']
  },
  emotions: {
    positive: ['smiling', 'smile', 'happy', 'joy', 'laugh', 'cheerful', 'bright', 'cười', 'vui', 'hạnh phúc'],
    negative: ['sad', 'cry', 'angry', 'upset', 'frown', 'buồn', 'khóc', 'giận']
  },
  roles: {
    student: ['student', 'học sinh', 'sinh viên', 'pupil', 'learner'],
    teacher: ['teacher', 'giáo viên', 'thầy', 'cô', 'instructor', 'educator']
  },
  appearance: {
    hair: ['long hair', 'short hair', 'black hair', 'brown hair', 'tóc dài', 'tóc ngắn', 'tóc đen'],
    face: ['round face', 'oval face', 'mặt tròn', 'mặt oval', 'cute', 'pretty', 'handsome', 'xinh', 'đẹp trai']
  }
}

class EmbeddingService {
  private session: ort.InferenceSession | null = null
  private isInitialized = false
  private readonly SIMILARITY_THRESHOLD = 0.5
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
      console.log('ONNX embedding model loaded successfully')
    } catch (error) {
      console.error('Failed to load ONNX model:', error)
      console.log('Using fallback embedding methods')
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
   * Enhanced semantic text embedding
   */
  async generateTextEmbedding(text: string): Promise<number[]> {
    try {
      const normalizedText = text.toLowerCase().trim()
      const words = normalizedText.split(/\W+/).filter((word) => word.length > 0)
      const embedding = new Array(512).fill(0)

      // 1. Semantic cluster matching with higher weights
      let semanticScore = 0
      Object.entries(SEMANTIC_CLUSTERS).forEach(([category, clusters], catIndex) => {
        Object.entries(clusters).forEach(([subCategory, keywords], subIndex) => {
          keywords.forEach((keyword) => {
            if (normalizedText.includes(keyword)) {
              const baseIndex = (catIndex * 50 + subIndex * 10) % 512
              for (let i = 0; i < 10; i++) {
                const pos = (baseIndex + i) % 512
                embedding[pos] += 5.0 // High semantic weight
              }
              semanticScore += 1
            }
          })
        })
      })

      // 2. Word-level embedding with TF-IDF style weighting
      const wordCounts = new Map()
      words.forEach((word) => {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1)
      })

      words.forEach((word, index) => {
        const tf = wordCounts.get(word) / words.length
        const hash = this.hashString(word)

        // Multiple hash functions for better distribution
        for (let hashFunc = 0; hashFunc < 3; hashFunc++) {
          const hashValue = this.hashString(word + hashFunc.toString())
          for (let i = 0; i < 20; i++) {
            const pos = (hashValue + i) % 512
            embedding[pos] += tf * (1 / Math.sqrt(index + 1))
          }
        }
      })

      // 3. Character n-grams for partial matching
      for (let n = 2; n <= 4; n++) {
        const nGrams = this.extractCharGrams(normalizedText, n)
        nGrams.forEach((gram, index) => {
          const hash = this.hashString(gram)
          const pos = (hash + index) % 512
          embedding[pos] += 0.5 / n
        })
      }

      // 4. Positional encoding
      words.forEach((word, index) => {
        const hash = this.hashString(word)
        const posWeight = Math.cos((index * Math.PI) / words.length)
        const pos = hash % 512
        embedding[pos] += posWeight * 0.3
      })

      // 5. Length and structure features
      embedding[0] += Math.log(words.length + 1) / 10
      embedding[1] += Math.log(normalizedText.length + 1) / 100
      embedding[2] += semanticScore / 10

      console.log(`Text embedding generated for: "${text}" - Semantic score: ${semanticScore}`)
      return this.normalizeVector(embedding)
    } catch (error) {
      console.error('Error generating text embedding:', error)
      return this.generateSimpleTextEmbedding(text)
    }
  }

  /**
   * Enhanced image embedding optimized for person detection
   */
  async generateImageEmbedding(imageBuffer: Buffer): Promise<number[]> {
    await this.ensureInitialized()

    try {
      console.log('Starting image embedding generation...')
      const features = []

      // 1. Face-focused features using ONNX (if available)
      if (this.isInitialized && this.session) {
        try {
          console.log('Extracting face features with ONNX...')
          const faceFeatures = await this.extractFaceFeatures(imageBuffer)
          console.log('Face features extracted:', faceFeatures.length, 'features')
          console.log('Sample face features:', faceFeatures.slice(0, 5))
          features.push(...faceFeatures)
        } catch (error: any) {
          console.log('Face feature extraction failed:', error.message)
        }
      }

      // 2. General image features
      console.log('Extracting general image features...')
      const generalFeatures = await this.extractGeneralImageFeatures(imageBuffer)
      console.log('General features extracted:', generalFeatures.length)
      console.log('Sample general features:', generalFeatures.slice(0, 5))
      features.push(...generalFeatures)

      // 3. Color and lighting features
      console.log('Extracting color features...')
      const colorFeatures = await this.extractColorFeatures(imageBuffer)
      console.log('Color features extracted:', colorFeatures.length)
      features.push(...colorFeatures)

      // 4. Texture and edge features
      console.log('Extracting texture features...')
      const textureFeatures = await this.extractTextureFeatures(imageBuffer)
      console.log('Texture features extracted:', textureFeatures.length)
      features.push(...textureFeatures)

      console.log('Total features before normalization:', features.length)
      console.log(
        'Features contain NaN?',
        features.some((f) => isNaN(f))
      )
      console.log(
        'Features contain Infinity?',
        features.some((f) => !isFinite(f))
      )

      // Ensure consistent vector size
      const targetSize = 512
      if (features.length > targetSize) {
        return this.normalizeVector(features.slice(0, targetSize))
      } else {
        // Pad with zeros if needed
        while (features.length < targetSize) {
          features.push(0)
        }
        const result = this.normalizeVector(features)
        console.log('Final embedding sample:', result.slice(0, 10))
        return result
      }
    } catch (error) {
      console.error('Error generating image embedding:', error)
      return this.generateSimpleImageEmbedding(imageBuffer)
    }
  }

  /**
   * Extract face features using ONNX
   */
  private async extractFaceFeatures(imageBuffer: Buffer): Promise<number[]> {
    if (!this.session) throw new Error('ONNX session not available')

    try {
      const { data } = await sharp(imageBuffer)
        .resize(112, 112)
        .removeAlpha()
        .toColorspace('srgb')
        .raw()
        .toBuffer({ resolveWithObject: true })

      // Kiểm tra dữ liệu ảnh
      if (data.length !== 112 * 112 * 3) {
        throw new Error(`Invalid image data length: ${data.length}, expected: ${112 * 112 * 3}`)
      }

      // Convert to CHW format
      const float32Data = new Float32Array(3 * 112 * 112)
      for (let h = 0; h < 112; h++) {
        for (let w = 0; w < 112; w++) {
          for (let c = 0; c < 3; c++) {
            const srcIdx = (h * 112 + w) * 3 + c
            const dstIdx = c * 112 * 112 + h * 112 + w
            const normalizedValue = (data[srcIdx] / 255.0 - 0.5) / 0.5

            // Kiểm tra giá trị hợp lệ
            if (isNaN(normalizedValue) || !isFinite(normalizedValue)) {
              float32Data[dstIdx] = 0
            } else {
              float32Data[dstIdx] = normalizedValue
            }
          }
        }
      }

      const inputTensor = new ort.Tensor('float32', float32Data, [1, 3, 112, 112])
      const results = await this.session.run({ data: inputTensor })
      const outputName = this.session.outputNames[0]

      const output = Array.from(results[outputName].data as Float32Array)
      console.log('ONNX output sample:', output.slice(0, 5))

      // Kiểm tra output có hợp lệ không
      if (output.some((val) => isNaN(val) || !isFinite(val))) {
        console.warn('ONNX output contains invalid values')
        return new Array(128).fill(0)
      }

      return output.slice(0, 128) // Take first 128 features
    } catch (error) {
      console.error('Face feature extraction error:', error)
      throw error
    }
  }

  /**
   * Extract general image features
   */
  private async extractGeneralImageFeatures(imageBuffer: Buffer): Promise<number[]> {
    const features = []

    // Multiple resolution analysis
    const sizes = [64, 128, 256]

    for (const size of sizes) {
      const { data } = await sharp(imageBuffer)
        .resize(size, size)
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true })

      // Local Binary Patterns
      const lbpFeatures = this.extractLBP(data, size)
      features.push(...lbpFeatures.slice(0, 32)) // Limit features per scale

      // Histogram of Oriented Gradients (simplified)
      const hogFeatures = this.extractSimpleHOG(data, size)
      features.push(...hogFeatures.slice(0, 16))
    }

    return features
  }

  /**
   * Extract color features
   */
  private async extractColorFeatures(imageBuffer: Buffer): Promise<number[]> {
    const { data } = await sharp(imageBuffer).resize(64, 64).raw().toBuffer({ resolveWithObject: true })

    const features = []

    // RGB histograms
    const histR = new Array(16).fill(0)
    const histG = new Array(16).fill(0)
    const histB = new Array(16).fill(0)

    for (let i = 0; i < data.length; i += 3) {
      const r = Math.floor(data[i] / 16)
      const g = Math.floor(data[i + 1] / 16)
      const b = Math.floor(data[i + 2] / 16)

      histR[Math.min(r, 15)]++
      histG[Math.min(g, 15)]++
      histB[Math.min(b, 15)]++
    }

    const totalPixels = data.length / 3
    features.push(...histR.map((count) => count / totalPixels))
    features.push(...histG.map((count) => count / totalPixels))
    features.push(...histB.map((count) => count / totalPixels))

    // Average colors
    let avgR = 0,
      avgG = 0,
      avgB = 0
    for (let i = 0; i < data.length; i += 3) {
      avgR += data[i]
      avgG += data[i + 1]
      avgB += data[i + 2]
    }
    features.push(avgR / totalPixels / 255)
    features.push(avgG / totalPixels / 255)
    features.push(avgB / totalPixels / 255)

    return features
  }

  /**
   * Extract texture features
   */
  private async extractTextureFeatures(imageBuffer: Buffer): Promise<number[]> {
    const { data } = await sharp(imageBuffer).resize(64, 64).greyscale().raw().toBuffer({ resolveWithObject: true })

    return this.extractLBP(data, 64)
  }

  /**
   * Extract Local Binary Pattern features
   */
  private extractLBP(data: Buffer, size: number): number[] {
    const features = []
    const histogram = new Array(256).fill(0)

    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x += 2) {
        // Sample every 2 pixels
        const center = data[y * size + x]
        let pattern = 0

        const neighbors = [
          data[(y - 1) * size + (x - 1)],
          data[(y - 1) * size + x],
          data[(y - 1) * size + (x + 1)],
          data[y * size + (x + 1)],
          data[(y + 1) * size + (x + 1)],
          data[(y + 1) * size + x],
          data[(y + 1) * size + (x - 1)],
          data[y * size + (x - 1)]
        ]

        for (let i = 0; i < 8; i++) {
          if (neighbors[i] >= center) {
            pattern |= 1 << i
          }
        }

        histogram[pattern]++
      }
    }

    // Normalize and take most significant patterns
    const totalPatterns = histogram.reduce((sum, count) => sum + count, 0)
    const normalizedHist = histogram.map((count) => count / totalPatterns)

    // Return top 64 most common patterns
    return normalizedHist.slice(0, 64)
  }

  /**
   * Simple HOG features
   */
  private extractSimpleHOG(data: Buffer, size: number): number[] {
    const features: any[] = []

    // Calculate gradients
    for (let y = 1; y < size - 1; y += 4) {
      for (let x = 1; x < size - 1; x += 4) {
        const gx = data[y * size + (x + 1)] - data[y * size + (x - 1)]
        const gy = data[(y + 1) * size + x] - data[(y - 1) * size + x]

        const magnitude = Math.sqrt(gx * gx + gy * gy)
        const angle = Math.atan2(gy, gx) + Math.PI // [0, 2π]

        // Quantize angle into 8 bins
        const bin = Math.floor((angle / (2 * Math.PI)) * 8) % 8
        features[bin] = (features[bin] || 0) + magnitude
      }
    }

    // Normalize
    const total = features.reduce((sum, val) => sum + (val || 0), 0)
    return features.map((val) => (val || 0) / (total || 1))
  }

  /**
   * Fallback simple image embedding
   */
  private async generateSimpleImageEmbedding(imageBuffer: Buffer): Promise<number[]> {
    const { data } = await sharp(imageBuffer).resize(32, 32).greyscale().raw().toBuffer({ resolveWithObject: true })

    const features = []

    // Simple intensity histogram
    const histogram = new Array(32).fill(0)
    for (let i = 0; i < data.length; i++) {
      const bin = Math.floor(data[i] / 8)
      histogram[Math.min(bin, 31)]++
    }

    features.push(...histogram.map((count) => count / data.length))

    // Pad to reach 512 dimensions
    while (features.length < 512) {
      features.push(0)
    }

    return this.normalizeVector(features)
  }

  private extractCharGrams(text: string, n: number): string[] {
    const grams: string[] = []
    const cleanText = text.toLowerCase().replace(/\s+/g, '')

    for (let i = 0; i <= cleanText.length - n; i++) {
      grams.push(cleanText.substr(i, n))
    }

    return grams
  }

  private generateSimpleTextEmbedding(text: string): number[] {
    const words = text
      .toLowerCase()
      .split(/\W+/)
      .filter((word) => word.length > 0)
    const embedding = new Array(512).fill(0)

    words.forEach((word, index) => {
      const hash = this.hashString(word)
      for (let i = 0; i < 50; i++) {
        const pos = (hash + i) % 512
        embedding[pos] += 1 / Math.sqrt(index + 1)
      }
    })

    return this.normalizeVector(embedding)
  }

  private normalizeVector(vector: number[]): number[] {
    const cleanVector = vector.map((val) => {
      if (isNaN(val) || !isFinite(val)) return 0
      return val
    })

    const magnitude = Math.sqrt(cleanVector.reduce((sum, val) => sum + val * val, 0))

    if (magnitude === 0 || isNaN(magnitude) || !isFinite(magnitude)) {
      console.warn('Vector normalization failed, returning zero vector')
      return new Array(cleanVector.length).fill(0)
    }

    return cleanVector.map((val) => val / magnitude)
  }

  private hashString(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash
    }
    return Math.abs(hash)
  }

  async storeTextEmbedding(
    userId: string,
    text: string,
    type: 'profile' | 'description' | 'bio' = 'profile'
  ): Promise<boolean> {
    try {
      const embedding = await this.generateTextEmbedding(text)

      const textEmbeddingDoc: TextEmbedding = {
        user_id: new ObjectId(userId),
        text,
        embedding,
        type,
        created_at: new Date(),
        updated_at: new Date()
      }

      await databaseService.db
        .collection('text_embeddings')
        .replaceOne({ user_id: new ObjectId(userId), type }, textEmbeddingDoc, { upsert: true })

      console.log(`Stored text embedding for user ${userId}: "${text}"`)
      return true
    } catch (error) {
      console.error('Error storing text embedding:', error)
      return false
    }
  }

  async storeImageEmbedding(userId: string, imageBuffer: Buffer, imageUrl: string): Promise<boolean> {
    try {
      const embedding = await this.generateImageEmbedding(imageBuffer)
      const imageHash = this.hashString(imageBuffer.toString('base64')).toString()

      const imageEmbeddingDoc: ImageEmbedding = {
        user_id: new ObjectId(userId),
        image_url: imageUrl,
        embedding,
        image_hash: imageHash,
        created_at: new Date(),
        updated_at: new Date()
      }

      await databaseService.db
        .collection('image_embeddings')
        .replaceOne({ user_id: new ObjectId(userId) }, imageEmbeddingDoc, { upsert: true })

      console.log(`Stored image embedding for user ${userId}`)
      return true
    } catch (error) {
      console.error('Error storing image embedding:', error)
      return false
    }
  }

  async searchUsersByText(searchText: string, userRole: 'student' | 'teacher', limit: number = 10): Promise<any[]> {
    try {
      const searchEmbedding = await this.generateTextEmbedding(searchText)

      // Get all text embeddings
      const textEmbeddings = await databaseService.db.collection('face_embeddings').find().toArray()

      // Calculate similarities with lower threshold
      const similarities = textEmbeddings
        .map((doc) => {
          const similarity = this.calculateSimilarity(searchEmbedding, doc.embedding)
          return {
            user_id: doc.user_id,
            similarity
          }
        })
        .filter((item) => item.similarity > this.SIMILARITY_THRESHOLD)

      console.log(`Found ${similarities} text matches above threshold ${this.SIMILARITY_THRESHOLD}`)

      // Sort by similarity
      similarities.sort((a, b) => b.similarity - a.similarity)
      const topUserIds = similarities.slice(0, limit * 3).map((s) => s.user_id)

      // Get user details
      const users = await databaseService.users
        .find({
          _id: { $in: topUserIds },
          role: userRole as any
        })
        .toArray()

      console.log(`Found ${users.length} users with role ${userRole}`)

      // Get image embeddings for cross-modal search
      const imageEmbeddings = await databaseService.db
        .collection('face_embeddings')
        .find({ user_id: { $in: topUserIds } })
        .toArray()

      // Calculate image similarities for cross-modal matching
      const imageMap = new Map()
      for (const imgEmb of imageEmbeddings) {
        const imgSimilarity = this.calculateSimilarity(searchEmbedding, imgEmb.embedding)
        imageMap.set(imgEmb.user_id.toString(), {
          image_url: imgEmb.image_url,
          similarity: imgSimilarity
        })
      }

      // Combine results
      const results = users
        .map((user) => {
          const textSim = similarities.find((s) => s.user_id.toString() === user._id.toString())
          const imageSim = imageMap.get(user._id.toString())

          return {
            _id: user._id,
            name: user.name,
            username: user.username,
            avatar: user.avatar,
            class: user.class,
            role: user.role,
            text_similarity: textSim?.similarity || 0,
            image_similarity: imageSim?.similarity || 0,
            combined_similarity: (textSim?.similarity || 0) * 0.8 + (imageSim?.similarity || 0) * 0.2,
            image_url: imageSim?.image_url || user.avatar
          }
        })
        .filter((result) => result.text_similarity > 0 || result.image_similarity > 0)

      // Sort by combined similarity
      results.sort((a, b) => b.combined_similarity - a.combined_similarity)

      console.log(`Returning ${Math.min(results.length, limit)} final results`)
      return results.slice(0, limit)
    } catch (error) {
      console.error('Error searching users by text:', error)
      return []
    }
  }
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
  async searchUsersByImage(imageBuffer: Buffer, userRole: 'student' | 'teacher', limit: number = 10): Promise<any[]> {
    try {
      console.log(`Searching users by image for role: ${userRole}`)

      // Sử dụng faceEmbeddingService thay vì generateImageEmbedding
      const searchEmbedding = await faceEmbeddingService.extractFaceEmbedding(imageBuffer)

      if (!searchEmbedding) {
        console.error('Failed to extract face embedding from search image')
        return []
      }

      console.log('Search embedding length:', searchEmbedding.length)

      // Thay đổi collection từ 'image_embeddings' sang 'face_embeddings'
      const faceEmbeddings = await databaseService.db.collection('face_embeddings').find({}).toArray()

      console.log(`Found ${faceEmbeddings.length} face embeddings to search through`)

      // Sử dụng calculateSimilarity từ faceEmbeddingService để đảm bảo tính nhất quán
      const similarities = faceEmbeddings
        .map((doc) => {
          const similarity = this.calculateSimilarity(searchEmbedding, doc.embedding)
          return {
            user_id: doc.user_id,
            similarity,
            face_features: doc.face_features // Thay vì image_url
          }
        })
        .filter((item) => item.similarity > 0.65)

      console.log(`Found ${similarities.length} face matches above threshold ${0.65}`)

      // Sort by similarity
      similarities.sort((a, b) => b.similarity - a.similarity)
      const topUserIds = similarities.slice(0, limit * 2).map((s) => s.user_id)

      // Get user details
      const users = await databaseService.users
        .find({
          _id: { $in: topUserIds },
          role: userRole as any
        })
        .toArray()

      console.log(`Found ${users.length} users with role ${userRole}`)

      // Combine results
      const results = users
        .map((user) => {
          const sim = similarities.find((s) => s.user_id.toString() === user._id.toString())

          return {
            _id: user._id,
            name: user.name,
            username: user.username,
            avatar: user.avatar,
            class: user.class,
            role: user.role,
            similarity: sim?.similarity || 0,
            face_quality: sim?.face_features?.quality_score || null,
            confidence:
              (sim?.similarity as number) >= 0.8 ? 'high' : (sim?.similarity as number) >= 0.6 ? 'medium' : 'low'
          }
        })
        .filter((result) => result.similarity > 0)

      // Sort by similarity
      results.sort((a, b) => b.similarity - a.similarity)

      console.log(`Returning ${Math.min(results.length, limit)} final results`)
      return results.slice(0, limit)
    } catch (error) {
      console.error('Error searching users by image:', error)
      return []
    }
  }

  async generateEmbeddingsForUser(userId: string): Promise<boolean> {
    try {
      const user = await databaseService.users.findOne({ _id: new ObjectId(userId) })
      if (!user) {
        throw new Error('User not found')
      }

      // Enhanced profile text with semantic keywords
      let profileText = `${user.name} ${user.username || ''} ${user.class || ''}`

      // Add semantic descriptors based on user data
      if (user.role === 'student') {
        profileText += ' student learner'
      } else if (user.role === 'teacher') {
        profileText += ' teacher educator instructor'
      }

      // Add common Vietnamese terms
      profileText += ' học sinh sinh viên'

      const success = await this.storeTextEmbedding(userId, profileText.trim(), 'profile')
      console.log(`Generated embeddings for user ${userId}: ${success ? 'SUCCESS' : 'FAILED'}`)

      return success
    } catch (error) {
      console.error('Error generating embeddings for user:', error)
      return false
    }
  }

  async batchGenerateEmbeddings(userRole: 'student' | 'teacher'): Promise<number> {
    try {
      const users = await databaseService.users.find({ role: userRole as any }).toArray()
      let processedCount = 0

      console.log(`Starting batch generation for ${users.length} ${userRole}s`)

      for (const user of users) {
        try {
          const success = await this.generateEmbeddingsForUser(user._id.toString())
          if (success) processedCount++

          // Small delay to avoid overwhelming the system
          await new Promise((resolve) => setTimeout(resolve, 50))
        } catch (error) {
          console.error(`Failed to process user ${user._id}:`, error)
        }
      }

      console.log(`Batch generation completed: ${processedCount}/${users.length} users processed`)
      return processedCount
    } catch (error) {
      console.error('Error batch generating embeddings:', error)
      return 0
    }
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy'
    initialized: boolean
    method: string
    model_path: string
    similarity_threshold: number
  }> {
    await this.ensureInitialized()

    return {
      status: 'healthy', // Always healthy with fallback methods
      initialized: this.isInitialized,
      method: this.isInitialized ? 'onnx_with_fallback' : 'fallback_only',
      model_path: this.MODEL_PATH,
      similarity_threshold: this.SIMILARITY_THRESHOLD
    }
  }
}

const embeddingService = new EmbeddingService()
export default embeddingService
