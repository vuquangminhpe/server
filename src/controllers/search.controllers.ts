import { Request, Response } from 'express'
import HTTP_STATUS from '../constants/httpStatus'
import { TokenPayload } from '../models/request/User.request'
import embeddingService from '../services/embedding.services'
import { UserRole } from '../models/schemas/User.schema'
import databaseService from '../services/database.services'
import { ObjectId } from 'mongodb'
import multer from 'multer'

// Configure multer for image upload
const storage = multer.memoryStorage()
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed'))
    }
  }
})

export const uploadSearchImageMiddleware = upload.single('search_image')

/**
 * Search students by text (for teachers)
 */
export const searchStudentsByTextController = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.decode_authorization as TokenPayload
    const { search_text, limit = 10 } = req.body

    // Verify user is teacher
    const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })
    if (!user || user.role !== UserRole.Teacher) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Only teachers can search students'
      })
    }

    if (!search_text || typeof search_text !== 'string' || search_text.trim().length === 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: 'Search text is required'
      })
    }

    const results = await embeddingService.searchUsersByText(
      search_text.trim(),
      'student',
      Math.min(parseInt(limit) || 10, 50)
    )

    res.json({
      message: 'Students search completed successfully',
      result: {
        search_text,
        total_results: results.length,
        students: results
      }
    })
  } catch (error) {
    console.error('Error searching students by text:', error)
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to search students',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

/**
 * Search students by image (for teachers)
 */
export const searchStudentsByImageController = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.decode_authorization as TokenPayload
    const { limit = 10 } = req.body

    // Verify user is teacher
    const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })
    if (!user || user.role !== UserRole.Teacher) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Only teachers can search students'
      })
    }

    if (!req.file) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: 'Search image is required'
      })
    }

    const results = await embeddingService.searchUsersByImage(
      req.file.buffer,
      'student',
      Math.min(parseInt(limit) || 10, 50)
    )

    res.json({
      message: 'Image-based students search completed successfully',
      result: {
        total_results: results.length,
        students: results
      }
    })
  } catch (error) {
    console.error('Error searching students by image:', error)
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to search students by image',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

/**
 * Search teachers by text (for admins)
 */
export const searchTeachersByTextController = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.decode_authorization as TokenPayload
    const { search_text, limit = 10 } = req.body

    // Verify user is admin
    const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })
    if (!user || user.role !== UserRole.Admin) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Only admins can search teachers'
      })
    }

    if (!search_text || typeof search_text !== 'string' || search_text.trim().length === 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: 'Search text is required'
      })
    }

    const results = await embeddingService.searchUsersByText(
      search_text.trim(),
      'teacher',
      Math.min(parseInt(limit) || 10, 50)
    )

    res.json({
      message: 'Teachers search completed successfully',
      result: {
        search_text,
        total_results: results.length,
        teachers: results
      }
    })
  } catch (error) {
    console.error('Error searching teachers by text:', error)
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to search teachers',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

/**
 * Search teachers by image (for admins)
 */
export const searchTeachersByImageController = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.decode_authorization as TokenPayload
    const { limit = 10 } = req.body

    // Verify user is admin
    const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })
    if (!user || user.role !== UserRole.Admin) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Only admins can search teachers'
      })
    }

    if (!req.file) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: 'Search image is required'
      })
    }

    const results = await embeddingService.searchUsersByImage(
      req.file.buffer,
      'teacher',
      Math.min(parseInt(limit) || 10, 50)
    )

    res.json({
      message: 'Image-based teachers search completed successfully',
      result: {
        total_results: results.length,
        teachers: results
      }
    })
  } catch (error) {
    console.error('Error searching teachers by image:', error)
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to search teachers by image',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

/**
 * Generate embeddings for a specific user (admin only)
 */
export const generateUserEmbeddingsController = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.decode_authorization as TokenPayload
    const { target_user_id } = req.body

    // Verify user is admin
    const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })
    if (!user || user.role !== UserRole.Admin) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Only admins can generate embeddings'
      })
    }

    if (!target_user_id) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: 'Target user ID is required'
      })
    }

    const success = await embeddingService.generateEmbeddingsForUser(target_user_id)

    if (!success) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        message: 'Failed to generate embeddings for user'
      })
    }

    res.json({
      message: 'User embeddings generated successfully',
      result: {
        user_id: target_user_id,
        success: true
      }
    })
  } catch (error) {
    console.error('Error generating user embeddings:', error)
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to generate user embeddings',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

/**
 * Batch generate embeddings for all users of a role (admin only)
 */
export const batchGenerateEmbeddingsController = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.decode_authorization as TokenPayload
    const { user_role } = req.body

    // Verify user is admin
    const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })
    if (!user || user.role !== UserRole.Admin) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Only admins can batch generate embeddings'
      })
    }

    if (!user_role || !['student', 'teacher'].includes(user_role)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: 'Valid user role (student or teacher) is required'
      })
    }

    // Start batch processing in background
    setTimeout(async () => {
      try {
        const processedCount = await embeddingService.batchGenerateEmbeddings(user_role)
        console.log(`Batch embedding generation completed: ${processedCount} users processed`)
      } catch (error) {
        console.error('Error in batch embedding generation:', error)
      }
    }, 1000)

    res.json({
      message: 'Batch embedding generation started',
      result: {
        user_role,
        status: 'processing'
      }
    })
  } catch (error) {
    console.error('Error starting batch embedding generation:', error)
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to start batch embedding generation',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

/**
 * Store image embedding for user profile
 */
export const storeUserImageEmbeddingController = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.decode_authorization as TokenPayload

    if (!req.file) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: 'Profile image is required'
      })
    }

    // For now, we'll use the user's avatar URL or generate a placeholder
    const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })
    const imageUrl = user?.avatar || `profile_${user_id}`

    const success = await embeddingService.storeImageEmbedding(user_id, req.file.buffer, imageUrl)

    if (!success) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        message: 'Failed to store image embedding'
      })
    }

    res.json({
      message: 'Image embedding stored successfully',
      result: {
        user_id,
        image_url: imageUrl,
        success: true
      }
    })
  } catch (error) {
    console.error('Error storing image embedding:', error)
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to store image embedding',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

/**
 * Store text embedding for user profile
 */
export const storeUserTextEmbeddingController = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.decode_authorization as TokenPayload
    const { text, type = 'profile' } = req.body

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: 'Text is required'
      })
    }

    if (!['profile', 'description', 'bio'].includes(type)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: 'Invalid text type. Must be: profile, description, or bio'
      })
    }

    const success = await embeddingService.storeTextEmbedding(user_id, text.trim(), type)

    if (!success) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        message: 'Failed to store text embedding'
      })
    }

    res.json({
      message: 'Text embedding stored successfully',
      result: {
        user_id,
        text: text.trim(),
        type,
        success: true
      }
    })
  } catch (error) {
    console.error('Error storing text embedding:', error)
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to store text embedding',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}
