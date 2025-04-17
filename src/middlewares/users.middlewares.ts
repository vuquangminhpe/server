import { checkSchema, ParamSchema } from 'express-validator'
import { validate } from '../utils/validation'
import usersService from '../services/users.services'
import { TWEET_MESSAGE, USERS_MESSAGES } from '../constants/messages'
import databaseService from '../services/database.services'
import { hashPassword } from '../utils/crypto'
import { verifyToken } from '../utils/jwt'
import { ErrorWithStatus } from '../models/Errors'
import HTTP_STATUS from '../constants/httpStatus'
import { JsonWebTokenError } from 'jsonwebtoken'
import _, { capitalize } from 'lodash'
import { NextFunction, Request, RequestHandler } from 'express'
import { ObjectId } from 'mongodb'
import { TokenPayload } from '../models/request/User.request'
import { AccountStatus, UserVerifyStatus } from '../constants/enums'
import { REGEX_USERNAME } from '../constants/regex'
import { ParsedQs } from 'qs'
import { ParamsDictionary } from 'express-serve-static-core'
import { Response as ExpressResponse } from 'express-serve-static-core'
import { verifyAccessToken } from '../utils/common'
import { envConfig } from '../constants/config'
import valkeyService from '../services/valkey.services'

type ExpressMiddleware = RequestHandler<ParamsDictionary, any, any, ParsedQs, Record<string, any>>
const passwordSchema: ParamSchema = {
  notEmpty: {
    errorMessage: USERS_MESSAGES.PASSWORD_IS_REQUIRED
  },
  isString: {
    errorMessage: USERS_MESSAGES.PASSWORD_MUST_BE_A_STRING
  },
  isLength: {
    options: {
      min: 6,
      max: 50
    },
    errorMessage: USERS_MESSAGES.PASSWORD_LENGTH_MUST_BE_FROM_6_TO_50
  }
}
const confirmPasswordSchema: ParamSchema = {
  notEmpty: {
    errorMessage: USERS_MESSAGES.CONFIRM_PASSWORD_IS_REQUIRED
  },
  isString: {
    errorMessage: USERS_MESSAGES.CONFIRM_PASSWORD_MUST_BE_A_STRING
  },
  isLength: {
    options: {
      min: 6,
      max: 50
    },
    errorMessage: USERS_MESSAGES.CONFIRM_PASSWORD_LENGTH_MUST_BE_FROM_6_TO_50
  },
  isStrongPassword: {
    options: {
      minLength: 6
    },
    errorMessage: USERS_MESSAGES.CONFIRM_PASSWORD_MUST_BE_STRONG
  },
  custom: {
    options: (value, { req }) => {
      if (value !== req.body.password) {
        throw new Error(USERS_MESSAGES.CONFIRM_PASSWORD_MUST_BE_THE_SAME_AS_PASSWORD)
      }
      return true
    }
  }
}
const forgotPasswordTokenSchema: ParamSchema = {
  trim: true,
  custom: {
    options: async (value: string, { req }) => {
      if (!value) {
        throw new ErrorWithStatus({
          message: USERS_MESSAGES.FORGOT_PASSWORD_TOKEN_IS_REQUIRED,
          status: HTTP_STATUS.UNAUTHORIZED
        })
      }
      try {
        const decode_forgot_password_token = await verifyToken({
          token: value,
          secretOnPublicKey: envConfig.secretOnPublicKey_Forgot as string
        })
        const { user_id } = decode_forgot_password_token
        const user = await databaseService.users.findOne({
          _id: new ObjectId(user_id)
        })

        if (user === null) {
          throw new ErrorWithStatus({
            message: USERS_MESSAGES.USER_NOT_FOUND,
            status: HTTP_STATUS.UNAUTHORIZED
          })
        }

        if (user.forgot_password_token !== value) {
          throw new ErrorWithStatus({
            message: USERS_MESSAGES.FORGOT_PASSWORD_TOKEN_INVALID,
            status: HTTP_STATUS.UNAUTHORIZED
          })
        }
        ;(req as Request).decode_forgot_password_token = decode_forgot_password_token
      } catch (error) {
        if (error instanceof JsonWebTokenError) {
          throw new ErrorWithStatus({
            message: _.capitalize(error.message),
            status: HTTP_STATUS.UNAUTHORIZED
          })
        }
        throw error
      }
      return true
    }
  }
}
const nameSchema: ParamSchema = {
  notEmpty: {
    errorMessage: USERS_MESSAGES.NAME_IS_REQUIRED
  },
  isString: {
    errorMessage: USERS_MESSAGES.NAME_MUST_BE_A_STRING
  },
  isLength: {
    options: {
      min: 1,
      max: 100
    },
    errorMessage: USERS_MESSAGES.NAME_LENGTH_MUST_BE_FROM_1_TO_100
  },
  trim: true
}
const DateOfBirthSchema: ParamSchema = {
  isISO8601: {
    options: {
      strict: true,
      strictSeparator: true
    },
    errorMessage: USERS_MESSAGES.DATE_OF_BIRTH_MUST_BE_ISO8601
  }
}
export const loginValidator = validate(
  checkSchema(
    {
      username: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.EMAIL_IS_REQUIRED
        },
        trim: true,
        custom: {
          options: async (value, { req }) => {
            const user = await databaseService.users.findOne({
              username: value,
              password: hashPassword(req.body.password)
            })

            if (user === null) {
              throw new Error(USERS_MESSAGES.USER_NOT_FOUND)
            }
            req.user = user
            return true
          }
        }
      },
      password: passwordSchema
    },
    ['body']
  )
)
export const registerValidator = validate(
  checkSchema(
    {
      name: nameSchema,
      email: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.EMAIL_IS_REQUIRED
        },
        trim: true,
        custom: {
          options: async (email: string) => {
            const isExitEmail = await usersService.checkUsersExists(email)

            if (isExitEmail) {
              throw new Error(USERS_MESSAGES.EMAIL_ALREADY_EXISTS)
            }
            return true
          }
        }
      },
      password: passwordSchema,
      confirm_password: confirmPasswordSchema,
      date_of_birth: DateOfBirthSchema
    },
    ['body']
  )
)

export const AccessTokenValidator = validate(
  checkSchema(
    {
      Authorization: {
        notEmpty: {
          errorMessage: new ErrorWithStatus({
            message: USERS_MESSAGES.ACCESS_TOKEN_IS_REQUIRED,
            status: HTTP_STATUS.UNAUTHORIZED
          })
        },
        custom: {
          options: async (value: string, { req }) => {
            const access_token = value.split(' ')[1]

            return await verifyAccessToken(access_token, req as Request)
          }
        }
      }
    },
    ['headers']
  )
)

export const RefreshTokenValidator = validate(
  checkSchema(
    {
      refresh_token: {
        notEmpty: {
          errorMessage: new ErrorWithStatus({
            message: USERS_MESSAGES.REFRESH_TOKEN_IS_REQUIRED,
            status: HTTP_STATUS.UNAUTHORIZED
          })
        },
        trim: true,
        custom: {
          options: async (value: string, { req }) => {
            try {
              const decoded_refresh_token = await verifyToken({
                token: value,
                secretOnPublicKey: envConfig.secretOnPublicKey_Refresh as string
              })

              const user_id = await valkeyService.getUserIdFromToken(value)

              if (!user_id) {
                throw new ErrorWithStatus({
                  message: USERS_MESSAGES.USED_REFRESH_TOKEN_OR_NOT_EXITS,
                  status: HTTP_STATUS.UNAUTHORIZED
                })
              }

              if (user_id !== decoded_refresh_token.user_id) {
                throw new ErrorWithStatus({
                  message: USERS_MESSAGES.INVALID_REFRESH_TOKEN,
                  status: HTTP_STATUS.UNAUTHORIZED
                })
              }

              ;(req as Request).decoded_refresh_token = decoded_refresh_token
            } catch (error) {
              if (error instanceof JsonWebTokenError) {
                throw new ErrorWithStatus({
                  message: _.capitalize(error.message),
                  status: HTTP_STATUS.UNAUTHORIZED
                })
              }
              throw error
            }
            return true
          }
        }
      }
    },
    ['body']
  )
)

export const emailVerifyTokenValidator = validate(
  checkSchema(
    {
      email_verify_token: {
        trim: true,
        custom: {
          options: async (value: string, { req }) => {
            if (!value) {
              throw new ErrorWithStatus({
                message: USERS_MESSAGES.EMAIL_IS_REQUIRED,
                status: HTTP_STATUS.UNAUTHORIZED
              })
            }
            try {
              const decoded_email_verify_token = await verifyToken({
                token: value,
                secretOnPublicKey: envConfig.secretOnPublicKey_Email as string
              })

              ;(req as Request).decoded_email_verify_token = decoded_email_verify_token
            } catch (error) {
              throw new ErrorWithStatus({
                message: capitalize((error as JsonWebTokenError).message),
                status: HTTP_STATUS.UNAUTHORIZED
              })
            }

            return true
          }
        }
      }
    },
    ['body']
  )
)

export const forgotPasswordValidator = validate(
  checkSchema(
    {
      email: {
        trim: true,
        custom: {
          options: async (value: string, { req }) => {
            const user = await databaseService.users.findOne({ email: value })
            if (!user) {
              throw new ErrorWithStatus({
                message: USERS_MESSAGES.EMAIL_IS_REQUIRED,
                status: HTTP_STATUS.UNAUTHORIZED
              })
            }
            req.user = user

            return true
          }
        }
      }
    },
    ['body']
  )
)

export const verifyForgotPasswordTokenValidator = validate(
  checkSchema(
    {
      forgot_password_token: forgotPasswordTokenSchema
    },
    ['body']
  )
)

export const resetPasswordValidator = validate(
  checkSchema(
    {
      password: passwordSchema,
      confirm_password: confirmPasswordSchema,
      forgot_password_token: forgotPasswordTokenSchema
    },
    ['body']
  )
)

export const verifiedUserValidator: RequestHandler = (req: Request, res, next: NextFunction) => {
  const { verify } = (req.decode_authorization as TokenPayload) || {}
  if (verify !== UserVerifyStatus.Verified) {
    return next(
      new ErrorWithStatus({
        message: USERS_MESSAGES.USER_NOT_VERIFIED,
        status: HTTP_STATUS.FORBIDDEN
      })
    )
  }
  next()
}

export const updateMeValidator = validate(
  checkSchema(
    {
      name: {
        ...nameSchema,
        optional: true,
        notEmpty: undefined
      },
      date_of_birth: { ...DateOfBirthSchema, optional: true },
      bio: {
        optional: true,

        isString: {
          errorMessage: USERS_MESSAGES.BIO_MUST_BE_A_STRING
        },
        trim: true,
        isLength: {
          options: {
            min: 1,
            max: 200
          },
          errorMessage: USERS_MESSAGES.BIO_LENGTH_MUST_BE_FROM_1_TO_200
        }
      },
      location: {
        optional: true,

        isString: {
          errorMessage: USERS_MESSAGES.LOCATION_MUST_BE_A_STRING
        },
        trim: true,
        isLength: {
          options: {
            min: 1,
            max: 200
          },
          errorMessage: USERS_MESSAGES.LOCATION_LENGTH_MUST_BE_FROM_5_TO_200
        }
      },
      Website: {
        optional: true,

        isString: {
          errorMessage: USERS_MESSAGES.WEBSITE_MUST_BE_A_STRING
        },
        trim: true,
        isLength: {
          options: {
            min: 1,
            max: 200
          },
          errorMessage: USERS_MESSAGES.WEBSITE_LENGTH_MUST_BE_FROM_5_TO_200
        }
      },
      username: {
        optional: true,

        isString: {
          errorMessage: USERS_MESSAGES.USERNAME_MUST_BE_A_STRING
        },
        trim: true,
        custom: {
          options: async (value: string, { req }) => {
            if (!REGEX_USERNAME.test(value)) {
              throw Error(USERS_MESSAGES.USERNAME_INVALID)
            }
            const user = await databaseService.users.findOne({ username: value })
            if (user) {
              throw Error(USERS_MESSAGES.USERNAME_EXISTED)
            }
          }
        },
        isLength: {
          options: {
            min: 1,
            max: 200
          },
          errorMessage: USERS_MESSAGES.USERNAME_LENGTH_MUST_BE_FROM_5_TO_50
        }
      },
      avatar: {
        optional: true,

        isString: {
          errorMessage: USERS_MESSAGES.AVATAR_MUST_BE_A_STRING
        },
        trim: true,
        isLength: {
          options: {
            min: 1,
            max: 200
          },

          errorMessage: USERS_MESSAGES.AVATAR_LENGTH_MUST_BE_FROM_1_TO_400
        }
      },
      cover_photo: {
        optional: true,

        isString: {
          errorMessage: USERS_MESSAGES.COVER_PHOTO_MUST_BE_A_STRING
        },
        trim: true,
        isLength: {
          options: {
            min: 1,
            max: 200
          },
          errorMessage: USERS_MESSAGES.COVER_PHOTO_LENGTH_MUST_BE_FROM_1_TO_200
        }
      }
    },
    ['body']
  )
)

export const followValidator = validate(
  checkSchema({
    followed_user_id: {
      custom: {
        options: async (value, { req }) => {
          if (!ObjectId.isValid(value)) {
            throw new ErrorWithStatus({
              message: USERS_MESSAGES.INVALID_FOLLOWED_USER_ID,
              status: HTTP_STATUS.NOT_FOUND
            })
          }
          const followed_user = await databaseService.users.findOne({
            _id: new ObjectId(value as string)
          })

          if (followed_user === null) {
            throw new ErrorWithStatus({
              message: USERS_MESSAGES.USER_NOT_FOUND,
              status: HTTP_STATUS.NOT_FOUND
            })
          }
        }
      }
    }
  })
)

export const changePasswordValidator = validate(
  checkSchema({
    old_password: passwordSchema,
    new_password: passwordSchema,
    confirm_new_password: {
      notEmpty: {
        errorMessage: USERS_MESSAGES.CONFIRM_PASSWORD_IS_REQUIRED
      },
      isString: {
        errorMessage: USERS_MESSAGES.CONFIRM_PASSWORD_MUST_BE_A_STRING
      },
      isLength: {
        options: {
          min: 6,
          max: 50
        },
        errorMessage: USERS_MESSAGES.CONFIRM_PASSWORD_LENGTH_MUST_BE_FROM_6_TO_50
      },
      isStrongPassword: {
        options: {
          minLength: 6
        },
        errorMessage: USERS_MESSAGES.CONFIRM_PASSWORD_MUST_BE_STRONG
      },
      custom: {
        options: (value, { req }) => {
          if (value !== req.body.new_password) {
            throw new Error(USERS_MESSAGES.CONFIRM_PASSWORD_MUST_BE_THE_SAME_AS_PASSWORD)
          }
          return true
        }
      }
    }
  })
)

export const getConversationsValidator = validate(
  checkSchema(
    {
      receive_id: {
        custom: {
          options: async (value) => {
            const user = await databaseService.users.findOne({
              _id: new ObjectId(value as string)
            })

            if (user) {
              throw new ErrorWithStatus({
                message: USERS_MESSAGES.USER_NOT_FOUND,
                status: HTTP_STATUS.NOT_FOUND
              })
            }
          }
        }
      }
    },
    ['params']
  )
)

export const deleteS3Validator = validate(
  checkSchema(
    {
      url: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.S3_LINK_IS_REQUIRED
        },
        isString: {
          errorMessage: USERS_MESSAGES.S3_LINK_MUST_BE_A_STRING
        }
      },
      link: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.LINK_IS_REQUIRED
        },
        isString: {
          errorMessage: USERS_MESSAGES.LINK_MUST_BE_A_STRING
        }
      }
    },
    ['body']
  )
)

export const premiumUserValidator = validate(
  checkSchema(
    {
      user_id: {}
    },
    ['headers']
  )
)
