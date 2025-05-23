import { Router } from 'express'
import {
  uploadFaceEmbeddingController,
  verifyFaceForExamController,
  getFaceEmbeddingStatusController,
  deleteFaceEmbeddingController,
  batchVerifyFacesController,
  faceServiceHealthController,
  uploadFaceImageMiddleware
} from '../controllers/faceVerification.controllers'
import { AccessTokenValidator, verifiedUserValidator } from '../middlewares/users.middlewares'
import { teacherRoleValidator } from '../middlewares/role.middlewares'
import { wrapAsync } from '../utils/handler'

const faceVerificationRouter = Router()

// All routes require authentication
faceVerificationRouter.use(AccessTokenValidator, verifiedUserValidator)

/**
 * Upload face image for profile
 * POST /face/profile
 * Body: form-data with face_image file
 */
faceVerificationRouter.post('/profile', uploadFaceImageMiddleware, wrapAsync(uploadFaceEmbeddingController))

/**
 * Verify face for exam start
 * POST /face/verify
 * Body: form-data with face_image file
 */
faceVerificationRouter.post('/verify', uploadFaceImageMiddleware, wrapAsync(verifyFaceForExamController))

/**
 * Get face embedding status
 * GET /face/status
 */
faceVerificationRouter.get('/status', wrapAsync(getFaceEmbeddingStatusController))

/**
 * Delete face profile
 * DELETE /face/profile
 */
faceVerificationRouter.delete('/profile', wrapAsync(deleteFaceEmbeddingController))

/**
 * Batch verify faces for exam (Teacher only)
 * GET /face/batch-verify/:exam_id
 */
faceVerificationRouter.get('/batch-verify/:exam_id', teacherRoleValidator, wrapAsync(batchVerifyFacesController))

/**
 * Face service health check
 * GET /face/health
 */
faceVerificationRouter.get('/health', wrapAsync(faceServiceHealthController))

export default faceVerificationRouter
