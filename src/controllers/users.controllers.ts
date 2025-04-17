import { NextFunction, Request, Response } from 'express'
import usersService from '../services/users.services'
import { ParamsDictionary } from 'express-serve-static-core'
import {
  ChangePasswordReqBody,
  FollowReqBody,
  ForgotPasswordReqBody,
  LoginReqBody,
  LogoutReqBody,
  RefreshTokenReqBody,
  RegisterReqBody,
  ResetPasswordReqBody,
  TokenPayload,
  UpdateMeReqBody,
  UserProfileReqBody,
  VerifyEmailReqBody,
  VerifyForgotPasswordReqBody
} from '../models/request/User.request'
import { USERS_MESSAGES } from '../constants/messages'
import { ObjectId } from 'bson'
import User from '../models/schemas/User.schema'
import databaseService from '../services/database.services'
import HTTP_STATUS from '../constants/httpStatus'
import { WithId } from 'mongodb'
import { UserVerifyStatus } from '../constants/enums'
import { pick } from 'lodash'
import { hashPassword, verifyPassword } from '../utils/crypto'
import { config } from 'dotenv'
import { envConfig } from '../constants/config'
config()
export const loginController = async (req: Request<ParamsDictionary, any, LoginReqBody>, res: Response) => {
  const user = req.user as User
  const user_id = user._id as ObjectId
  // const adminUser = {
  //   _id: new ObjectId('12321231231256789abcdef0'),
  //   name: 'System Administrator',
  //   email: 'admin@yourdomain.com',
  //   username: 'sysadmin',
  //   password: hashPassword('Admin@123'),
  //   bio: 'System Administrator with full access rights',
  //   date_of_birth: new Date('1990-01-01'),
  //   verify: 1,
  //   role: 'admin',
  //   typeAccount: 2,
  //   count_type_account: 0,
  //   email_verify_token: '',
  //   forgot_password_token: '',
  //   twitter_circle: [],
  //   is_online: false,
  //   last_active: new Date(),
  //   created_at: new Date('2025-01-01'),
  //   updated_at: new Date(),
  //   avatar: '',
  //   cover_photo: '',
  //   location: '',
  //   website: ''
  // }

  // await databaseService.users.insertOne(adminUser as any)
  const result = await usersService.login({ user_id: user_id.toString(), verify: UserVerifyStatus.Verified })
  res.status(200).json({
    message: USERS_MESSAGES.LOGIN_SUCCESS,
    result: {
      access_token: result,
      user
    }
  })
}
export const oauthController = async (req: Request<ParamsDictionary, any, LoginReqBody>, res: Response) => {
  const { code } = req.query
  const result = await usersService.oauth(code as string)
  const urlRedirect = `${envConfig.client_redirect}?access_token=${result.access_token}&new_user=${result.newUser}&verify=${result.verify}`
  res.redirect(urlRedirect)
  res.status(200).json({
    message: result.newUser ? USERS_MESSAGES.REGISTER_SUCCESS : USERS_MESSAGES.LOGIN_SUCCESS,
    result: {
      access_token: result.access_token
    }
  })
}
export const registerController = async (
  req: Request<ParamsDictionary, any, RegisterReqBody>,
  res: Response,
  next: NextFunction
) => {
  await usersService.register(req.body)

  res.json({
    message: USERS_MESSAGES.REGISTER_SUCCESS
  })
}

export const searchUsersByNameController = async (req: Request, res: Response) => {
  try {
    const name = req.query.name as string
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 10

    if (!name) {
      res.status(400).json({
        message: 'Name query parameter is required'
      })
      return
    }

    const result = await usersService.searchUsersByName(name, page, limit)
    res.json({
      message: 'Searched users successfully',
      result: {
        users: result.users,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages
      }
    })
  } catch (error) {
    console.error('Error searching users:', error)
    res.status(500).json({
      message: 'Failed to search users',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export const getAllUsersController = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 10

    res.json({
      message: 'Fetched users successfully'
    })
  } catch (error) {
    console.error('Error fetching users:', error)
    res.status(500).json({
      message: 'Failed to fetch users',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export const logoutController = async (req: Request<ParamsDictionary, any, LogoutReqBody>, res: Response) => {
  const { refresh_token } = req.body

  const result = await usersService.logout(refresh_token as string)

  res.json(result)
}
export const refreshTokenController = async (
  req: Request<ParamsDictionary, any, RefreshTokenReqBody>,
  res: Response
) => {
  const { user_id, verify } = req.decoded_refresh_token as TokenPayload
  const { refresh_token } = req.body
  const result = await usersService.refreshToken(user_id, verify, refresh_token)
  res.json({
    message: USERS_MESSAGES.REFRESH_TOKEN_SUCCESS,
    result: result
  })
}
export const emailVerifyController = async (req: Request<ParamsDictionary, any, VerifyEmailReqBody>, res: Response) => {
  const { user_id } = req.decoded_email_verify_token as TokenPayload
  console.log('user_id', user_id)

  const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })
  if (!user) {
    res.status(HTTP_STATUS.NOT_FOUND).json({
      message: USERS_MESSAGES.USER_NOT_FOUND
    })
  }

  if ((user as WithId<User>).email_verify_token === '') {
    res.status(HTTP_STATUS.OK).json({
      message: USERS_MESSAGES.EMAIL_ALREADY_VERIFIED_BEFORE
    })
  }

  const result = await usersService.verifyEmail(user_id)
  res.json({
    message: USERS_MESSAGES.EMAIL_VERIFY_SUCCESS,
    result
  })
}
export const resendVerifyEmailController = async (req: Request, res: Response) => {
  const { user_id } = req.decode_authorization as TokenPayload
  const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })
  if (!user) {
    res.status(HTTP_STATUS.NOT_FOUND).json({
      message: USERS_MESSAGES.USER_NOT_FOUND
    })
  }
  if (user?.verify === UserVerifyStatus.Verified) {
    res.json({
      message: USERS_MESSAGES.EMAIL_ALREADY_VERIFIED_BEFORE
    })
  }
  const result = await usersService.resendVerifyEmail(user_id)
  res.json(result)
}

export const forgotPasswordController = async (
  req: Request<ParamsDictionary, any, ForgotPasswordReqBody>,
  res: Response
) => {
  const { _id, verify } = req.user as User
  const user = await databaseService.users.findOne({ _id: new ObjectId(_id) })

  if (!user) {
    res.status(HTTP_STATUS.NOT_FOUND).json({
      message: USERS_MESSAGES.USER_NOT_FOUND
    })
  }

  const result = await usersService.forgotPassword({
    user_id: new ObjectId(_id).toString(),
    verify: verify as UserVerifyStatus
  })
  res.json(result)
}
export const VerifyForgotPasswordController = async (
  req: Request<ParamsDictionary, any, VerifyForgotPasswordReqBody>,
  res: Response
) => {
  res.json({
    message: USERS_MESSAGES.VERIFY_FORGOT_PASSWORD_SUCCESS
  })
}

export const resetPasswordController = async (
  req: Request<ParamsDictionary, any, ResetPasswordReqBody>,
  res: Response
) => {
  const { user_id } = req.decode_forgot_password_token as TokenPayload
  const { password } = req.body
  const result = await usersService.resetPassword(new ObjectId(user_id).toString(), password)
  res.json({ message: USERS_MESSAGES.RESET_PASSWORD_SUCCESS, result })
}

export const getMeController = async (req: Request<ParamsDictionary, any, ResetPasswordReqBody>, res: Response) => {
  const { user_id } = req.decode_authorization as TokenPayload
  const user = await usersService.getMe(user_id)
  res.json({
    message: USERS_MESSAGES.GET_ME_SUCCESS,
    result: user
  })
}

export const updateMeController = async (req: Request<ParamsDictionary, any, UpdateMeReqBody>, res: Response) => {
  const { user_id } = req.decode_authorization as TokenPayload
  const body = pick(req.body, [
    'name',
    'date_of_birth',
    'bio',
    'location',
    'website',
    'username',
    'avatar',
    'cover_photo'
  ])
  const user = await usersService.updateMe(user_id, body)
  res.json({
    message: USERS_MESSAGES.UPDATE_PROFILE_SUCCESS,
    result: user
  })
}

export const getProfileByUserNameController = async (
  req: Request<ParamsDictionary, any, UserProfileReqBody>,
  res: Response
) => {
  const { username } = req.params

  const result = await usersService.getProfileByUserName(username)
  res.json(result)
}
export const getProfileByIdController = async (
  req: Request<ParamsDictionary, any, UserProfileReqBody>,
  res: Response
) => {
  const { user_id } = req.params
  console.log('user_id', user_id)

  const result = await usersService.getProfileByUserId(user_id)
  res.json(result)
}
export const followController = async (req: Request<ParamsDictionary, any, FollowReqBody>, res: Response) => {
  res.json('result')
}

export const UnController = async (req: Request<ParamsDictionary, any, FollowReqBody>, res: Response) => {
  res.json('')
}
export const getFollowingController = async (req: Request<ParamsDictionary, any, any>, res: Response) => {
  res.json({
    message: USERS_MESSAGES.GET_FOLLOWING_SUCCESSFULLY
  })
}
export const getFollowersController = async (req: Request<ParamsDictionary, any, any>, res: Response) => {
  res.json({
    message: USERS_MESSAGES.GET_FOLLOWERS_SUCCESSFULLY
  })
}
export const changePasswordController = async (
  req: Request<ParamsDictionary, any, ChangePasswordReqBody>,
  res: Response
) => {
  const { user_id } = req.decode_authorization as TokenPayload

  const { old_password, new_password } = req.body
  const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })

  const { password } = user as User
  const isVerifyPasswords = verifyPassword(old_password, password)
  if (isVerifyPasswords) {
    res.json({ message: USERS_MESSAGES.OLD_PASSWORD_IS_WRONG })
  }
  const result = await usersService.changePassword(user_id, new_password)
  res.json(result)
}

export const generateTextGeminiController = async (req: Request<ParamsDictionary, any, any>, res: Response) => {
  const { count } = req.body

  const result = await usersService.chatWithGemini(count)

  res.json({
    data: result
  })
}
