// src/middlewares/admin.middlewares.ts
import { NextFunction, Request, Response } from 'express'
import { ObjectId } from 'mongodb'
import databaseService from '../services/database.services'
import { TokenPayload } from '../models/request/User.request'
import { UserRole } from '../models/schemas/User.schema'
import { ErrorWithStatus } from '../models/Errors'
import HTTP_STATUS from '../constants/httpStatus'
import { ADMIN_MESSAGES } from '../constants/messages'

/**
 * Middleware to check if user has admin role
 */
export const isAdminValidator = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user_id } = req.decode_authorization as TokenPayload

    if (!user_id) {
      return next(
        new ErrorWithStatus({
          message: ADMIN_MESSAGES.ADMIN_PERMISSION_REQUIRED,
          status: HTTP_STATUS.UNAUTHORIZED
        })
      )
    }

    // Get user from database to check role
    const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })

    if (!user) {
      return next(
        new ErrorWithStatus({
          message: 'User not found',
          status: HTTP_STATUS.NOT_FOUND
        })
      )
    }

    if (user.role !== UserRole.Admin) {
      return next(
        new ErrorWithStatus({
          message: ADMIN_MESSAGES.ADMIN_PERMISSION_REQUIRED,
          status: HTTP_STATUS.FORBIDDEN
        })
      )
    }

    next()
  } catch (error) {
    next(
      new ErrorWithStatus({
        message: 'Failed to verify admin permissions',
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR
      })
    )
  }
}

/**
 * Middleware to check if user has admin or teacher role
 */
export const isAdminOrTeacherValidator = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user_id } = req.decode_authorization as TokenPayload

    if (!user_id) {
      return next(
        new ErrorWithStatus({
          message: 'Authentication required',
          status: HTTP_STATUS.UNAUTHORIZED
        })
      )
    }

    // Get user from database to check role
    const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })

    if (!user) {
      return next(
        new ErrorWithStatus({
          message: 'User not found',
          status: HTTP_STATUS.NOT_FOUND
        })
      )
    }

    if (user.role !== UserRole.Admin && user.role !== UserRole.Teacher) {
      return next(
        new ErrorWithStatus({
          message: 'Admin or Teacher permission required',
          status: HTTP_STATUS.FORBIDDEN
        })
      )
    }

    next()
  } catch (error) {
    next(
      new ErrorWithStatus({
        message: 'Failed to verify permissions',
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR
      })
    )
  }
}

/**
 * Middleware to allow admin to access any resource or owner to access their own
 */
export const isAdminOrOwnerValidator = (userIdField: string = 'user_id') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user_id } = req.decode_authorization as TokenPayload
      const targetUserId = req.params[userIdField] || req.body[userIdField]

      if (!user_id) {
        return next(
          new ErrorWithStatus({
            message: 'Authentication required',
            status: HTTP_STATUS.UNAUTHORIZED
          })
        )
      }

      // Get user from database to check role
      const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })

      if (!user) {
        return next(
          new ErrorWithStatus({
            message: 'User not found',
            status: HTTP_STATUS.NOT_FOUND
          })
        )
      }

      // Admin can access any resource
      if (user.role === UserRole.Admin) {
        return next()
      }

      // Owner can access their own resource
      if (targetUserId && user_id === targetUserId) {
        return next()
      }

      return next(
        new ErrorWithStatus({
          message: 'Access denied. Admin permission or resource ownership required',
          status: HTTP_STATUS.FORBIDDEN
        })
      )
    } catch (error) {
      next(
        new ErrorWithStatus({
          message: 'Failed to verify permissions',
          status: HTTP_STATUS.INTERNAL_SERVER_ERROR
        })
      )
    }
  }
}
