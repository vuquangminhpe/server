import { NextFunction, Request, Response } from 'express'
import { checkSchema } from 'express-validator'
import HTTP_STATUS from '../constants/httpStatus'
import { ADMIN_MESSAGES } from '../constants/messages'
import { ErrorWithStatus } from '../models/Errors'
import databaseService from '../services/database.services'
import { ObjectId } from 'mongodb'
import { validate } from '../utils/validation'
import { TokenPayload } from '../models/request/User.request'

export const isAdminValidator = async (req: Request, res: Response, next: NextFunction) => {
  const { user_id } = req.decode_authorization as TokenPayload

  const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })

  if (!user || user.role !== 'admin') {
    return next(
      new ErrorWithStatus({
        message: ADMIN_MESSAGES.ADMIN_PERMISSION_REQUIRED,
        status: HTTP_STATUS.FORBIDDEN
      })
    )
  }

  next()
}

export const dateRangeValidator = validate(
  checkSchema(
    {
      from_date: {
        optional: true,
        isISO8601: {
          errorMessage: ADMIN_MESSAGES.INVALID_DATE_FORMAT
        }
      },
      to_date: {
        optional: true,
        isISO8601: {
          errorMessage: ADMIN_MESSAGES.INVALID_DATE_FORMAT
        },
        custom: {
          options: (value, { req }) => {
            if (req?.query?.from_date && value) {
              const fromDate = new Date(req.query.from_date as string)
              const toDate = new Date(value)

              if (fromDate > toDate) {
                throw new Error(ADMIN_MESSAGES.TO_DATE_MUST_BE_AFTER_FROM_DATE)
              }
            }
            return true
          }
        }
      }
    },
    ['query']
  )
)
export const banUserValidator = validate(
  checkSchema({
    user_id: {
      notEmpty: {
        errorMessage: ADMIN_MESSAGES.USER_ID_REQUIRED
      }
    },
    reason: {
      isEmpty: {
        errorMessage: ADMIN_MESSAGES.REASON_REQUIRED
      },
      isString: {
        errorMessage: ADMIN_MESSAGES.INVALID_REASON
      }
    }
  })
)
