import { config } from 'dotenv'

config()

export interface FaceRecognitionConfig {
  method: 'python' | 'onnx' | 'simple' | 'disabled'
  similarity_threshold: number
  max_file_size: number
  allowed_formats: string[]
  enable_periodic_verification: boolean
  verification_interval: number
  max_verification_failures: number
  require_face_for_exam_start: boolean
}

export const faceRecognitionConfig: FaceRecognitionConfig = {
  // Method options:
  // 'python' - InsightFace via Python (highest accuracy ~98%)
  // 'onnx' - ONNX Runtime (good accuracy ~95%)
  // 'simple' - Basic image features (fair accuracy ~85%)
  method: (process.env.FACE_RECOGNITION_METHOD as 'python' | 'onnx' | 'simple' | 'disabled') || 'simple',

  // Similarity threshold for face matching (varies by method)
  similarity_threshold: parseFloat(process.env.FACE_SIMILARITY_THRESHOLD || '0.7'),

  // Maximum file size for face images (in bytes)
  max_file_size: parseInt(process.env.FACE_MAX_FILE_SIZE || '5242880'), // 5MB

  // Allowed image formats
  allowed_formats: ['image/jpeg', 'image/jpg', 'image/png'],

  // Enable periodic face verification during exam
  enable_periodic_verification: process.env.ENABLE_PERIODIC_FACE_VERIFICATION === 'true',

  // Interval between face verification checks (in seconds)
  verification_interval: parseInt(process.env.FACE_VERIFICATION_INTERVAL || '300'), // 5 minutes

  // Maximum number of failed verifications before action
  max_verification_failures: parseInt(process.env.MAX_FACE_VERIFICATION_FAILURES || '3'),

  // Require face verification to start exam
  require_face_for_exam_start: process.env.REQUIRE_FACE_FOR_EXAM_START !== 'false'
}

// Factory function to get the appropriate face embedding service
export const getFaceEmbeddingService = () => {
  switch (faceRecognitionConfig.method) {
    case 'python':
      // Use InsightFace via Python bridge (highest accuracy)
      return require('../services/pythonFaceBridge.services').default

    case 'onnx':
      // Use ONNX Runtime (good balance of accuracy and performance)
      return require('../services/faceEmbedding.services').default

    case 'simple':
      // Use simple image-based features (lightweight, fair accuracy)
      return require('../services/faceEmbedding.services').default

    case 'disabled':
      // Return mock service that always returns success
      return {
        storeFaceEmbedding: async () => true,
        verifyFace: async () => ({ isMatch: true, similarity: 1.0, confidence: 'high' }),
        deleteFaceEmbedding: async () => true,
        healthCheck: async () => ({ status: 'healthy', method: 'disabled' })
      }

    default:
      console.warn(`Unknown face recognition method: ${faceRecognitionConfig.method}, falling back to simple`)
      return require('../services/faceEmbedding.services').default
  }
}

// Get default threshold based on method
export const getDefaultThreshold = (method: string): number => {
  switch (method) {
    case 'python':
      return 0.4 // InsightFace uses lower threshold
    case 'onnx':
      return 0.6 // ONNX models typically use 0.6
    case 'simple':
      return 0.7 // Simple method needs higher threshold
    default:
      return 0.7
  }
}

// Validation function
export const validateFaceRecognitionConfig = (): string[] => {
  const errors: string[] = []

  if (!['python', 'onnx', 'simple', 'disabled'].includes(faceRecognitionConfig.method)) {
    errors.push('FACE_RECOGNITION_METHOD must be "python", "onnx", "simple", or "disabled"')
  }

  if (faceRecognitionConfig.similarity_threshold < 0 || faceRecognitionConfig.similarity_threshold > 1) {
    errors.push('FACE_SIMILARITY_THRESHOLD must be between 0.0 and 1.0')
  }

  if (faceRecognitionConfig.max_file_size < 1000000) {
    // Less than 1MB
    errors.push('FACE_MAX_FILE_SIZE should be at least 1MB for good image quality')
  }

  if (faceRecognitionConfig.verification_interval < 60) {
    // Less than 1 minute
    errors.push('FACE_VERIFICATION_INTERVAL should be at least 60 seconds')
  }

  return errors
}

export const getMethodInfo = () => {
  const methods = {
    python: {
      name: 'Python InsightFace',
      accuracy: '98%',
      setup_difficulty: 'Medium',
      dependencies: ['python3', 'pip install insightface'],
      pros: ['Highest accuracy', 'Industry standard', 'Robust'],
      cons: ['Requires Python setup', 'Slightly slower'],
      recommended_threshold: 0.4
    },
    onnx: {
      name: 'ONNX Runtime',
      accuracy: '95%',
      setup_difficulty: 'Hard',
      dependencies: ['npm install onnxruntime-node'],
      pros: ['Good accuracy', 'Pure JavaScript', 'Fast'],
      cons: ['Complex setup', 'Large model files'],
      recommended_threshold: 0.6
    },
    simple: {
      name: 'Simple Image Features',
      accuracy: '85%',
      setup_difficulty: 'Easy',
      dependencies: ['npm install sharp'],
      pros: ['Very easy setup', 'Fast', 'Lightweight'],
      cons: ['Lower accuracy', 'Less robust'],
      recommended_threshold: 0.7
    },
    disabled: {
      name: 'Disabled',
      accuracy: 'N/A',
      setup_difficulty: 'None',
      dependencies: [],
      pros: ['No setup required', 'Always passes'],
      cons: ['No security'],
      recommended_threshold: 0
    }
  }

  return methods
}

// Export configuration info
export const getFaceRecognitionInfo = () => {
  return {
    method: faceRecognitionConfig.method,
    enabled: faceRecognitionConfig.method !== 'disabled',
    similarity_threshold: faceRecognitionConfig.similarity_threshold,
    periodic_verification: faceRecognitionConfig.enable_periodic_verification,
    required_for_exam_start: faceRecognitionConfig.require_face_for_exam_start,
    method_info: getMethodInfo()[faceRecognitionConfig.method as keyof ReturnType<typeof getMethodInfo>]
  }
}
