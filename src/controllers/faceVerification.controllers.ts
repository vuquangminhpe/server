import { Request, Response } from 'express'
import { TokenPayload } from '../models/request/User.request'
import { getFaceEmbeddingService, faceRecognitionConfig } from '../config/faceRecognition.config'
import databaseService from '../services/database.services'
import HTTP_STATUS from '../constants/httpStatus'
import multer from 'multer'
import { ObjectId } from 'mongodb'

// Get the appropriate face embedding service based on configuration
const faceEmbeddingService = getFaceEmbeddingService()

// Configure multer for face image upload
const storage = multer.memoryStorage()
const upload = multer({
  storage,
  limits: {
    fileSize: faceRecognitionConfig.max_file_size
  },
  fileFilter: (req, file, cb) => {
    if (faceRecognitionConfig.allowed_formats.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`Only ${faceRecognitionConfig.allowed_formats.join(', ')} files are allowed`))
    }
  }
})

export const uploadFaceImageMiddleware = upload.single('face_image')

/**
 * Upload and store face embedding for user profile
 */
export const uploadFaceEmbeddingController = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.decode_authorization as TokenPayload

    if (!req.file) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: 'Face image is required'
      })
    }

    const success = await faceEmbeddingService.storeFaceEmbedding(user_id, req.file.buffer)

    if (!success) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: 'Failed to process face image. Please ensure your face is clearly visible and try again.'
      })
    }

    res.json({
      message: 'Face embedding stored successfully',
      result: {
        success: true
      }
    })
  } catch (error: any) {
    console.error('Error uploading face embedding:', error)
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: error.message || 'Failed to process face image'
    })
  }
}

/**
 * Verify face for exam start
 */
export const verifyFaceForExamController = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.decode_authorization as TokenPayload

    if (!req.file) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: 'Face image is required for verification'
      })
    }

    const verificationResult = await faceEmbeddingService.verifyFace(user_id, req.file.buffer)

    if (!verificationResult.isMatch) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Face verification failed. Please ensure you are the registered student.',
        result: {
          verified: false,
          similarity: verificationResult.similarity,
          confidence: verificationResult.confidence,
          threshold_required: 0.6
        }
      })
    }

    res.json({
      message: 'Face verification successful',
      result: {
        verified: true,
        similarity: verificationResult.similarity,
        confidence: verificationResult.confidence
      }
    })
  } catch (error: any) {
    console.error('Error verifying face:', error)

    if (error.message.includes('No stored face embedding')) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: 'No face profile found. Please upload your face image in your profile first.'
      })
    }

    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Face verification failed due to technical error'
    })
  }
}

/**
 * Get face embedding status for user
 */
export const getFaceEmbeddingStatusController = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.decode_authorization as TokenPayload

    const hasEmbedding = await databaseService.db
      .collection('face_embeddings')
      .findOne({ user_id: new ObjectId(user_id) })

    res.json({
      message: 'Face embedding status retrieved',
      result: {
        has_face_profile: !!hasEmbedding,
        created_at: hasEmbedding?.created_at || null,
        updated_at: hasEmbedding?.updated_at || null
      }
    })
  } catch (error) {
    console.error('Error getting face embedding status:', error)
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to get face embedding status'
    })
  }
}

/**
 * Delete face embedding
 */
export const deleteFaceEmbeddingController = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.decode_authorization as TokenPayload

    const success = await faceEmbeddingService.deleteFaceEmbedding(user_id)

    if (!success) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        message: 'No face profile found to delete'
      })
    }

    res.json({
      message: 'Face profile deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting face embedding:', error)
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to delete face profile'
    })
  }
}

/**
 * Batch verify faces (for admin/teacher)
 */
export const batchVerifyFacesController = async (req: Request, res: Response) => {
  try {
    const { exam_id } = req.params
    const { user_id } = req.decode_authorization as TokenPayload

    // Verify teacher owns this exam
    const exam = await databaseService.exams.findOne({ _id: new ObjectId(exam_id) })

    if (!exam) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        message: 'Exam not found'
      })
    }

    if (exam.teacher_id.toString() !== user_id) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Not authorized to access this exam'
      })
    }

    // Get all active sessions for this exam
    const sessions = await databaseService.examSessions
      .find({
        exam_id: new ObjectId(exam_id),
        completed: false
      })
      .toArray()

    const verificationResults = []

    for (const session of sessions) {
      // Get latest face verification for this session
      const faceVerification = await databaseService.db
        .collection('face_verifications')
        .findOne({ session_id: session._id }, { sort: { timestamp: -1 } })

      const student = await databaseService.users.findOne({ _id: session.student_id })

      verificationResults.push({
        session_id: session._id.toString(),
        student_id: session.student_id.toString(),
        student_name: student?.name || 'Unknown',
        student_username: student?.username || 'Unknown',
        face_verified: faceVerification?.verified || false,
        verification_confidence: faceVerification?.confidence || 'unknown',
        last_verification: faceVerification?.timestamp || null
      })
    }

    res.json({
      message: 'Batch face verification results retrieved',
      result: {
        exam_id,
        total_sessions: sessions.length,
        verifications: verificationResults
      }
    })
  } catch (error) {
    console.error('Error in batch face verification:', error)
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to retrieve face verification results'
    })
  }
}

/**
 * Health check for face recognition service
 */
export const faceServiceHealthController = async (req: Request, res: Response) => {
  try {
    const health = await faceEmbeddingService.healthCheck()

    res.json({
      message: 'Face service health check',
      result: health
    })
  } catch (error) {
    console.error('Error in face service health check:', error)
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Face service health check failed',
      result: {
        status: 'unhealthy',
        initialized: false,
        modelsLoaded: false
      }
    })
  }
}
