import { Request, Response } from 'express'
import { ADMIN_MESSAGES } from '../constants/messages'
import { UserStatsQuery, ContentStatsQuery } from '../models/request/Admin.request'
import adminService from '../services/admin.services'
import HTTP_STATUS from '../constants/httpStatus'
import { ObjectId } from 'mongodb'
import databaseService from '../services/database.services'
import { UserRole } from '../models/schemas/User.schema'
import examService from '../services/exams.services'

// Existing controllers
export const getUserStatisticsController = async (req: Request<any, any, any, UserStatsQuery>, res: Response) => {
  const result = await adminService.getUserStatistics(req.query)

  res.json({
    message: ADMIN_MESSAGES.GET_USER_STATS_SUCCESS,
    result
  })
}

export const getContentStatisticsController = async (req: Request<any, any, any, ContentStatsQuery>, res: Response) => {
  const result = await adminService.getContentStatistics(req.query)

  res.json({
    message: ADMIN_MESSAGES.GET_TWEET_STATS_SUCCESS,
    result
  })
}

// Get all teachers
export const getAllTeachersController = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 10
    const search = (req.query.search as string) || ''

    const result = await adminService.getAllTeachers(page, limit, search)

    res.json({
      message: 'Teachers retrieved successfully',
      result
    })
  } catch (error) {
    console.error('Error retrieving teachers:', error)
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to retrieve teachers',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

// Get all students
export const getAllStudentsController = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 10
    const search = (req.query.search as string) || ''

    const result = await adminService.getAllStudents(page, limit, search)

    res.json({
      message: 'Students retrieved successfully',
      result
    })
  } catch (error) {
    console.error('Error retrieving students:', error)
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to retrieve students',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

// Get all master exams
export const getAllMasterExamsController = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 10
    const search = (req.query.search as string) || ''

    const result = await adminService.getAllMasterExams(page, limit, search)

    res.json({
      message: 'Master exams retrieved successfully',
      result
    })
  } catch (error) {
    console.error('Error retrieving master exams:', error)
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to retrieve master exams',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

// Delete a user (teacher or student)
export const deleteUserController = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params

    // Check if user exists
    const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        message: 'User not found'
      })
    }

    // Delete the user
    const result = await adminService.deleteUser(user_id)

    res.json({
      message: 'User deleted successfully',
      result
    })
  } catch (error) {
    console.error('Error deleting user:', error)
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to delete user',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

// Delete a master exam
export const deleteMasterExamController = async (req: Request, res: Response) => {
  try {
    const { master_exam_id } = req.params
    const { user_id } = req.decode_authorization as { user_id: string }

    // Use the existing exam service method but as admin
    const result = await examService.deleteMasterExam(master_exam_id, user_id)

    res.json({
      message: 'Master exam deleted successfully',
      result
    })
  } catch (error: any) {
    // Determine the appropriate status code based on the error
    let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR
    let message = 'Failed to delete master exam'

    if (error.message.includes('Not authorized')) {
      statusCode = HTTP_STATUS.FORBIDDEN
      message = error.message
    } else if (error.message.includes('not found')) {
      statusCode = HTTP_STATUS.NOT_FOUND
      message = error.message
    } else if (error.message.startsWith('Cannot delete:')) {
      statusCode = HTTP_STATUS.BAD_REQUEST
      message = error.message
    }

    res.status(statusCode).json({
      message,
      error: error.message
    })
  }
}

// Change user role (promote to teacher or demote to student)
export const changeUserRoleController = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params
    const { role } = req.body

    // Validate role
    if (!Object.values(UserRole).includes(role as UserRole)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: 'Invalid role'
      })
    }

    // Check if user exists
    const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        message: 'User not found'
      })
    }

    // Prevent changing admin role
    if (user.role === UserRole.Admin) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Cannot change role of admin users'
      })
    }

    // Update user role
    const result = await adminService.changeUserRole(user_id, role as UserRole)

    res.json({
      message: 'User role updated successfully',
      result
    })
  } catch (error) {
    console.error('Error changing user role:', error)
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to change user role',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}
