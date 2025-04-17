import { Router } from 'express'
import {
  deletedS3Controller,
  uploadImageController,
  uploadVideoController,
  uploadVideoHLSController,
  videoStatusController
} from '../controllers/medias.controllers'
import { AccessTokenValidator, deleteS3Validator, verifiedUserValidator } from '../middlewares/users.middlewares'
import { wrapAsync } from '../utils/handler'
const mediasRouter = Router()

mediasRouter.post('/upload-image', AccessTokenValidator, verifiedUserValidator, wrapAsync(uploadImageController))
mediasRouter.post('/upload-video', AccessTokenValidator, verifiedUserValidator, wrapAsync(uploadVideoController))
mediasRouter.post('/upload-video-hls', AccessTokenValidator, verifiedUserValidator, wrapAsync(uploadVideoHLSController))
mediasRouter.get('/video-status/:id', AccessTokenValidator, verifiedUserValidator, wrapAsync(videoStatusController))
mediasRouter.post(
  '/delete-s3',
  AccessTokenValidator,
  verifiedUserValidator,
  deleteS3Validator,
  wrapAsync(deletedS3Controller)
)
export default mediasRouter
