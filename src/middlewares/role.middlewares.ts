// src/middlewares/role.middlewares.ts
import { NextFunction, Request, Response } from 'express'
import { ObjectId } from 'mongodb'
import databaseService from '../services/database.services'
import { TokenPayload } from '../models/request/User.request'
import { UserRole } from '../models/schemas/User.schema'
import { ErrorWithStatus } from '../models/Errors'
import HTTP_STATUS from '../constants/httpStatus'

/**
 * Middleware to check if user has teacher role
 */
export const teacherRoleValidator = async (req: Request, res: Response, next: NextFunction) => {
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

    if (user.role !== UserRole.Teacher) {
      return next(
        new ErrorWithStatus({
          message: 'Teacher permission required',
          status: HTTP_STATUS.FORBIDDEN
        })
      )
    }

    next()
  } catch (error) {
    next(
      new ErrorWithStatus({
        message: 'Failed to verify teacher permissions',
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR
      })
    )
  }
}

/**
 * Middleware to check if user has student role
 */
export const studentRoleValidator = async (req: Request, res: Response, next: NextFunction) => {
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

    if (user.role !== UserRole.Student) {
      return next(
        new ErrorWithStatus({
          message: 'Student permission required',
          status: HTTP_STATUS.FORBIDDEN
        })
      )
    }

    next()
  } catch (error) {
    next(
      new ErrorWithStatus({
        message: 'Failed to verify student permissions',
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR
      })
    )
  }
}

/**
 * Middleware to check if user has admin role
 */
export const adminRoleValidator = async (req: Request, res: Response, next: NextFunction) => {
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

    if (user.role !== UserRole.Admin) {
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
        message: 'Failed to verify admin permissions',
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR
      })
    )
  }
}

/**
 * Middleware to check if user has teacher or admin role
 */
export const teacherOrAdminRoleValidator = async (req: Request, res: Response, next: NextFunction) => {
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

    if (user.role !== UserRole.Teacher && user.role !== UserRole.Admin) {
      return next(
        new ErrorWithStatus({
          message: 'Teacher or Admin permission required',
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
 * Dynamic role validator - checks if user has any of the specified roles
 */
export const hasRoleValidator = (allowedRoles: UserRole[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
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

      if (!allowedRoles.includes(user.role)) {
        return next(
          new ErrorWithStatus({
            message: `Insufficient permissions. Required roles: ${allowedRoles.join(', ')}`,
            status: HTTP_STATUS.FORBIDDEN
          })
        )
      }

      next()
    } catch (error) {
      next(
        new ErrorWithStatus({
          message: 'Failed to verify role permissions',
          status: HTTP_STATUS.INTERNAL_SERVER_ERROR
        })
      )
    }
  }
}

/**
 * Optional role validator - allows access but attaches role info
 */
export const optionalRoleValidator = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user_id } = req.decode_authorization as TokenPayload

    if (!user_id) {
      // If no auth, continue without role info
      return next()
    }

    // Get user from database to get role
    const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })

    if (user) {
      // Attach role info to request for use in controllers
      ;(req as any).user_role = user.role
    }

    next()
  } catch (error) {
    // Don't fail the request, just continue without role info
    next()
  }
}
