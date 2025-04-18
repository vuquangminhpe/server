import { JwtPayload } from 'jsonwebtoken'
import { TokenType, UserVerifyStatus } from '../../constants/enums'

export interface UpdateMeReqBody {
  name?: string
  date_of_birth?: string
  bio?: string
  location?: string
  website?: string
  username?: string
  avatar?: string
  cover_photo?: string
}

export interface FollowReqBody {
  followed_user_id: string
}
export interface ChangePasswordReqBody {
  old_password: string
  new_password: string
  confirm_new_password: string
}
export interface LoginReqBody {
  email: string
  password: string
}
export interface VerifyEmailReqBody {
  email_verify_token: string
}
export interface RegisterReqBody {
  email: string
  name: string
  password: string
  confirm_password: string
  date_of_birth: string
  class: string
}
export interface LogoutReqBody {
  refresh_token: string
}
export interface RefreshTokenReqBody {
  refresh_token: string
}
export interface TokenPayload extends JwtPayload {
  user_id: string
  token_type: TokenType
  verify: UserVerifyStatus
}

export interface UserReq {
  email: string
}
export interface ForgotPasswordReqBody {
  email: string
}

export interface VerifyForgotPasswordReqBody {
  forgot_password_token: string
}

export interface ResetPasswordReqBody {
  password: string
  confirm_password: string
  forgot_password_token: string
}

export interface UserProfileReqBody {
  username: string
}
