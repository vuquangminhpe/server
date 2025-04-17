import { NextFunction, Request, Response } from 'express'
import HTTP_STATUS from '../constants/httpStatus'
import { ErrorWithStatus } from '../models/Errors'
import { UserRole } from '../models/schemas/User.schema'
import databaseService from '../services/database.services'
import { ObjectId } from 'mongodb'
import { TokenPayload } from '../models/request/User.request'

// Teacher role validator middleware
export const teacherRoleValidator = async (req: Request, res: Response, next: NextFunction) => {
  try {
    next()
  } catch (error) {
    next(
      new ErrorWithStatus({
        message: 'Authentication error',
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR
      })
    )
  }
}

// Admin role validator middleware
export const adminRoleValidator = async (req: Request, res: Response, next: NextFunction) => {
  const { user_id } = req.decode_authorization as TokenPayload

  try {
    const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })

    if (!user || user.role !== UserRole.Admin) {
      return next(
        new ErrorWithStatus({
          message: 'Admin permission required',
          status: HTTP_STATUS.FORBIDDEN
        })
      )
    }

    next()
  } catch (error) {
    next(
      new ErrorWithStatus({
        message: 'Authentication error',
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR
      })
    )
  }
}
