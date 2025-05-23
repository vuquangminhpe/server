import { Request, Response } from 'express'
import HTTP_STATUS from '../constants/httpStatus'
import { TokenPayload } from '../models/request/User.request'
import examSessionService from '../services/examSessions.services'
import multer from 'multer'
import { ObjectId } from 'mongodb'
import databaseService from '../services/database.services'

// Configure multer for face image upload
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
      cb(new Error('Only JPEG, PNG, and WebP images are allowed for face verification'))
    }
  }
})

export const uploadFaceImageMiddleware = upload.single('face_image')

/**
 * Enhanced start exam controller with camera detection
 */
export const startExamController = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.decode_authorization as TokenPayload
    const { exam_code, has_camera = false, require_face_verification = true, device_info } = req.body

    if (!exam_code) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: 'Exam code is required'
      })
    }

    // Validate device_info if provided
    let parsedDeviceInfo
    if (device_info) {
      try {
        parsedDeviceInfo = typeof device_info === 'string' ? JSON.parse(device_info) : device_info
      } catch (error) {
        console.warn('Invalid device_info format:', error)
        parsedDeviceInfo = {
          user_agent: req.headers['user-agent'] || 'Unknown',
          device_type: 'unknown'
        }
      }
    } else {
      parsedDeviceInfo = {
        user_agent: req.headers['user-agent'] || 'Unknown',
        device_type: 'unknown'
      }
    }

    // Check if face verification is required and possible
    const shouldRequireFaceVerification = require_face_verification && has_camera

    let faceImageBuffer: Buffer | undefined
    if (shouldRequireFaceVerification && req.file) {
      faceImageBuffer = req.file.buffer
    }

    const result = await examSessionService.startExamSession({
      exam_code,
      student_id: user_id,
      face_image_buffer: faceImageBuffer,
      require_face_verification: shouldRequireFaceVerification,
      has_camera,
      device_info: parsedDeviceInfo
    })

    res.json({
      message: 'Exam session started successfully',
      result: {
        session_id: result.session._id?.toString(),
        exam_title: result.exam.title,
        exam_duration: result.exam.duration,
        remaining_time: result.remaining_time,
        total_questions: result.exam.questions.length,
        questions: result.exam.questions,
        face_verification_status: {
          required: result.camera_required,
          verified: result.face_verified,
          similarity: result.face_verification_similarity,
          has_camera: result.has_camera
        },
        device_info: parsedDeviceInfo
      }
    })
  } catch (error) {
    console.error('Error starting exam session:', error)

    // Handle specific error types
    if (error instanceof Error) {
      // Check if it's a validation error
      if (
        error.message.includes('Không tìm thấy bài kiểm tra') ||
        error.message.includes('đã làm bài kiểm tra') ||
        error.message.includes('Chưa đến giờ thi') ||
        error.message.includes('hiện đã có người khác')
      ) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          message: error.message
        })
      }

      // Check if it's a face verification error
      if (error.message.includes('Xác thực khuôn mặt') || error.message.includes('Chưa có dữ liệu khuôn mặt')) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          message: error.message,
          error_type: 'FACE_VERIFICATION_FAILED'
        })
      }
    }

    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to start exam session',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

/**
 * Submit exam controller (unchanged)
 */
export const submitExamController = async (req: Request, res: Response) => {
  try {
    const { session_id, answers } = req.body
    const { user_id } = req.decode_authorization as TokenPayload

    if (!session_id || !answers) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: 'Session ID and answers are required'
      })
    }

    // Verify session belongs to user
    const session = await databaseService.examSessions.findOne({
      _id: new ObjectId(session_id),
      student_id: new ObjectId(user_id)
    })

    if (!session) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Session not found or not authorized'
      })
    }

    const result = await examSessionService.submitExamSession({
      session_id,
      answers
    })

    res.json({
      message: 'Exam submitted successfully',
      result: {
        session_id: result?._id?.toString(),
        score: result?.score,
        violations: result?.violations,
        completed: result?.completed,
        end_time: result?.end_time
      }
    })
  } catch (error) {
    console.error('Error submitting exam:', error)
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to submit exam',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

/**
 * Get exam history controller (enhanced)
 */
export const getExamHistoryController = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.decode_authorization as TokenPayload

    const history = await examSessionService.getStudentExamHistory(user_id)

    res.json({
      message: 'Exam history retrieved successfully',
      result: {
        total_exams: history.length,
        exams: history.map((session) => ({
          session_id: session._id?.toString(),
          exam_title: session.exam_title,
          score: session.score,
          violations: session.violations,
          completed: session.completed,
          start_time: session.start_time,
          end_time: session.end_time,
          duration: session.duration,
          face_verification: {
            verified: session.face_verified,
            confidence: session.face_verification_confidence
          },
          device_info: {
            had_camera: session.had_camera,
            device_type: session.device_type
          }
        }))
      }
    })
  } catch (error) {
    console.error('Error getting exam history:', error)
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to get exam history',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

/**
 * Get session statistics controller (for teachers/admins)
 */
export const getSessionStatisticsController = async (req: Request, res: Response) => {
  try {
    const { exam_id } = req.params
    const { user_id } = req.decode_authorization as TokenPayload

    // Verify user has permission to view this exam's statistics
    const exam = await databaseService.exams.findOne({ _id: new ObjectId(exam_id) })
    if (!exam) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        message: 'Exam not found'
      })
    }

    // Check if user is the teacher who created this exam
    const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })
    if (exam.teacher_id.toString() !== user_id && user?.role !== 'admin') {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Not authorized to view this exam statistics'
      })
    }

    const statistics = await examSessionService.getSessionStatistics(exam_id)

    if (!statistics) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        message: 'Failed to retrieve session statistics'
      })
    }

    res.json({
      message: 'Session statistics retrieved successfully',
      result: {
        exam_id,
        exam_title: exam.title,
        statistics
      }
    })
  } catch (error) {
    console.error('Error getting session statistics:', error)
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to get session statistics',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

/**
 * Verify face during exam controller
 */
export const verifyFaceDuringExamController = async (req: Request, res: Response) => {
  try {
    const { session_id, has_camera = true } = req.body
    const { user_id } = req.decode_authorization as TokenPayload

    if (!session_id) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: 'Session ID is required'
      })
    }

    // Verify session belongs to user
    const session = await databaseService.examSessions.findOne({
      _id: new ObjectId(session_id),
      student_id: new ObjectId(user_id)
    })

    if (!session) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Session not found or not authorized'
      })
    }

    // If no camera, return success
    if (!has_camera) {
      return res.json({
        message: 'Face verification skipped - no camera detected',
        result: {
          verified: true,
          similarity: 1.0,
          confidence: 'high',
          action_required: null,
          has_camera: false
        }
      })
    }

    if (!req.file) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: 'Face image is required when camera is available'
      })
    }

    const verificationResult = await examSessionService.verifyFaceDuringExam(
      session_id,
      user_id,
      req.file.buffer,
      has_camera
    )

    res.json({
      message: 'Face verification completed',
      result: {
        ...verificationResult,
        has_camera
      }
    })
  } catch (error) {
    console.error('Error verifying face during exam:', error)
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to verify face',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

/**
 * Check camera availability controller
 */
export const checkCameraAvailabilityController = async (req: Request, res: Response) => {
  try {
    const { user_agent, screen_resolution, device_type } = req.body

    // Simple heuristic to determine if device likely has camera
    // This is client-side information, but can be used as fallback
    let likelyHasCamera = true

    if (device_type === 'desktop') {
      // Desktop might not have camera
      likelyHasCamera = false
    } else if (device_type === 'mobile' || device_type === 'tablet') {
      // Mobile and tablet devices usually have cameras
      likelyHasCamera = true
    } else if (user_agent) {
      // Check user agent for common patterns
      const ua = user_agent.toLowerCase()
      if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider')) {
        likelyHasCamera = false
      }
    }

    res.json({
      message: 'Camera availability check completed',
      result: {
        likely_has_camera: likelyHasCamera,
        device_type: device_type || 'unknown',
        user_agent: user_agent || 'unknown',
        screen_resolution: screen_resolution || 'unknown',
        note: 'This is a server-side estimation. Client-side camera detection is more accurate.'
      }
    })
  } catch (error) {
    console.error('Error checking camera availability:', error)
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to check camera availability',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}
