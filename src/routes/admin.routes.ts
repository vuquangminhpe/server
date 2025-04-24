import { Router } from 'express'
import {
  getUserStatisticsController,
  getContentStatisticsController,
  getAllTeachersController,
  getAllStudentsController,
  getAllMasterExamsController,
  deleteUserController,
  deleteMasterExamController,
  changeUserRoleController
} from '../controllers/admin.controllers'
import { AccessTokenValidator, verifiedUserValidator } from '../middlewares/users.middlewares'
import { isAdminValidator } from '../middlewares/admin.middlewares'
import { wrapAsync } from '../utils/handler'

const adminRouter = Router()

// Apply middleware for all admin routes
adminRouter.use(AccessTokenValidator, verifiedUserValidator, isAdminValidator)

// User management
adminRouter.get('/statistics/users', wrapAsync(getUserStatisticsController))
adminRouter.get('/statistics/content', wrapAsync(getContentStatisticsController))

// User management
adminRouter.get('/teachers', wrapAsync(getAllTeachersController))
adminRouter.get('/students', wrapAsync(getAllStudentsController))
adminRouter.delete('/users/:user_id', wrapAsync(deleteUserController))
adminRouter.put('/users/:user_id/role', wrapAsync(changeUserRoleController))

// Exam management
adminRouter.get('/master-exams', wrapAsync(getAllMasterExamsController))
adminRouter.delete('/master-exams/:master_exam_id', wrapAsync(deleteMasterExamController))

export default adminRouter
