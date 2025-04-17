import { Router } from 'express'
import {
  changePasswordController,
  emailVerifyController,
  followController,
  forgotPasswordController,
  getFollowersController,
  getFollowingController,
  getMeController,
  getProfileByIdController,
  getProfileByUserNameController,
  loginController,
  logoutController,
  oauthController,
  refreshTokenController,
  registerController,
  resendVerifyEmailController,
  resetPasswordController,
  UnController,
  updateMeController,
  getAllUsersController,
  VerifyForgotPasswordController,
  searchUsersByNameController
} from '../controllers/users.controllers'
import {
  AccessTokenValidator,
  changePasswordValidator,
  emailVerifyTokenValidator,
  followValidator,
  forgotPasswordValidator,
  loginValidator,
  RefreshTokenValidator,
  registerValidator,
  resetPasswordValidator,
  updateMeValidator,
  verifiedUserValidator,
  verifyForgotPasswordTokenValidator
} from '../middlewares/users.middlewares'
import { wrapAsync } from '../utils/handler'

const usersRouter = Router()

usersRouter.post('/login', loginValidator, wrapAsync(loginController))
usersRouter.get('/oauth/google', wrapAsync(oauthController))

usersRouter.post('/register', wrapAsync(registerController))
usersRouter.post('/logout', AccessTokenValidator, RefreshTokenValidator, wrapAsync(logoutController))

/**
 * Description: refresh token
 * Path: /refresh-token
 * method: POST
 * Header: {refresh_token: string}
 */
usersRouter.post('/refresh-token', RefreshTokenValidator, wrapAsync(refreshTokenController))

usersRouter.post('/verify-email', emailVerifyTokenValidator, wrapAsync(emailVerifyController))
usersRouter.post('/resend-verify-email', AccessTokenValidator, wrapAsync(resendVerifyEmailController))
usersRouter.post('/forgot-password', forgotPasswordValidator, wrapAsync(forgotPasswordController))
usersRouter.post(
  '/verify-forgot-password',
  verifyForgotPasswordTokenValidator,
  wrapAsync(VerifyForgotPasswordController)
)

/**
 * Description: Get all users
 * Path: /all
 * method: GET
 * Header: {Authorization: Bearer <access_token>}
 */
usersRouter.get('/all', wrapAsync(getAllUsersController))

/**
 * Description: Search users by name
 * Path: /search
 * Method: GET
 * Query: { name: string, page?: number, limit?: number }
 * Header: { Authorization: Bearer <access_token> }
 */
usersRouter.get('/search', wrapAsync(searchUsersByNameController))

usersRouter.post('/reset-password', resetPasswordValidator, wrapAsync(resetPasswordController))

/**
 * Description: Get my profile
 * Path: /me
 * method: GET
 * Header: {Authorization: Bearer <access_token>}
 */
usersRouter.get('/me', AccessTokenValidator, verifiedUserValidator, wrapAsync(getMeController))

/**
 * Description: Update my profile
 * Path: /me
 * method: PATCH
 * Header: {Authorization: Bearer <access_token>}
 * body: User Schema
 */
usersRouter.patch('/me', AccessTokenValidator, verifiedUserValidator, updateMeValidator, wrapAsync(updateMeController))

/**
 * Description: get user profile by username
 * Path: /:username
 * method: GET
 */
usersRouter.get('/:username', wrapAsync(getProfileByUserNameController))

/**
 * Description: get user profile by _id
 * Path: /:username
 * method: GET
 */
usersRouter.get('/profile/:user_id', wrapAsync(getProfileByIdController))

/**
 * Description:get following
 * Path: /following
 * method: get
 * body: {user_id: string}
 */
usersRouter.get('/me/following', AccessTokenValidator, verifiedUserValidator, wrapAsync(getFollowingController))

/**
 * Description:get followers
 * Path: /followers
 * method: get
 * body: {user_id: string}
 */
usersRouter.get('/me/followers', AccessTokenValidator, verifiedUserValidator, wrapAsync(getFollowersController))

/**
 * Description: follow someone
 * Path: /follow
 * method: post
 * body: {user_id: string}
 * Header: {followed_user_id: string}
 */
usersRouter.post('/follow', AccessTokenValidator, verifiedUserValidator, followValidator, wrapAsync(followController))

/**
 * Description:un follow someone
 * Path: /un-follow
 * method: post
 * body: {user_id: string}
 * Header: {followed_user_id: string}
 */
usersRouter.delete('/un-follow', AccessTokenValidator, verifiedUserValidator, followValidator, wrapAsync(UnController))

/**
 * Description: change password
 * Path: /change-password
 * method: post
 * body: {user_id: string ,password: string, confirm_password: string}
 */
usersRouter.post(
  '/change-password',
  AccessTokenValidator,
  verifiedUserValidator,
  changePasswordValidator,
  wrapAsync(changePasswordController)
)

export default usersRouter
