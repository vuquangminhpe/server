// src/routes/exams.routes.ts (Updated to include new controllers)
import { Router } from 'express'
import {
  generateExamController,
  getExamsController,
  getExamByIdController,
  getExamResultsController,
  getExamStatisticsController,
  updateExamStatusController,
  getStudentViolationsController,
  getClassExamResultsController,
  createMasterExamController,
  getMasterExamsController,
  getMasterExamByIdController,
  getExamsByMasterExamIdController,
  getClassesForMasterExamController,
  getClassExamResultsForMasterExamController,
  getMasterExamsWithStatusController,
  getMasterExamWithExamsController,
  toggleMasterExamStatusController,
  deleteMasterExamController
} from '../controllers/exams.controllers'
import {
  startExamController,
  submitExamController,
  getExamHistoryController,
  getSessionStatisticsController,
  verifyFaceDuringExamController,
  checkCameraAvailabilityController,
  uploadFaceImageMiddleware
} from '../controllers/examSessions.controllers'
import { AccessTokenValidator, verifiedUserValidator } from '../middlewares/users.middlewares'
import { teacherRoleValidator } from '../middlewares/role.middlewares'
import { wrapAsync } from '../utils/handler'
import { generateExamValidator } from '../middlewares/exam.validator'
import {
  startExamValidator,
  submitExamValidator,
  verifyFaceDuringExamValidator,
  checkCameraAvailabilityValidator,
  getSessionStatisticsValidator
} from '../middlewares/examSession.validator'

const examsRouter = Router()

// All routes require authentication and verification
examsRouter.use(AccessTokenValidator, verifiedUserValidator)

// ===== TEACHER ROUTES =====
examsRouter.post('/generate', teacherRoleValidator, generateExamValidator, wrapAsync(generateExamController))
examsRouter.get('/', teacherRoleValidator, wrapAsync(getExamsController))
examsRouter.get('/:exam_id', teacherRoleValidator, wrapAsync(getExamByIdController))
examsRouter.put('/:exam_id/status', teacherRoleValidator, wrapAsync(updateExamStatusController))
examsRouter.get('/:exam_id/results', teacherRoleValidator, wrapAsync(getExamResultsController))
examsRouter.get('/:exam_id/statistics', teacherRoleValidator, wrapAsync(getExamStatisticsController))
examsRouter.get('/:exam_id/class-results', teacherRoleValidator, wrapAsync(getClassExamResultsController))

// Session Statistics (for teachers)
examsRouter.get(
  '/:exam_id/session-statistics',
  teacherRoleValidator,
  getSessionStatisticsValidator,
  wrapAsync(getSessionStatisticsController)
)

// Student violations route
examsRouter.get(
  '/:exam_id/students/:student_id/violations',
  teacherRoleValidator,
  wrapAsync(getStudentViolationsController)
)

// ===== STUDENT ROUTES =====

// Enhanced start exam with camera detection
examsRouter.post('/start', startExamValidator, uploadFaceImageMiddleware, wrapAsync(startExamController))

// Submit exam
examsRouter.post('/submit', submitExamValidator, wrapAsync(submitExamController))

// Get exam history
examsRouter.get('/history', wrapAsync(getExamHistoryController))

// Face verification during exam
examsRouter.post(
  '/verify-face',
  verifyFaceDuringExamValidator,
  uploadFaceImageMiddleware,
  wrapAsync(verifyFaceDuringExamController)
)

// Check camera availability
examsRouter.post('/check-camera', checkCameraAvailabilityValidator, wrapAsync(checkCameraAvailabilityController))

// ===== MASTER EXAM ROUTES =====
examsRouter.post('/idea/master', teacherRoleValidator, wrapAsync(createMasterExamController))
examsRouter.get('/idea/master', teacherRoleValidator, wrapAsync(getMasterExamsController))
examsRouter.get('/idea/master/:master_exam_id', teacherRoleValidator, wrapAsync(getMasterExamByIdController))
examsRouter.get('/idea/master/:master_exam_id/exams', teacherRoleValidator, wrapAsync(getExamsByMasterExamIdController))
examsRouter.get(
  '/idea/master/:master_exam_id/classes',
  teacherRoleValidator,
  wrapAsync(getClassesForMasterExamController)
)
examsRouter.get(
  '/idea/master/:master_exam_id/classes/:className/results',
  teacherRoleValidator,
  wrapAsync(getClassExamResultsForMasterExamController)
)
examsRouter.get('/idea/master-with-status', teacherRoleValidator, wrapAsync(getMasterExamsWithStatusController))
examsRouter.get(
  '/idea/master/:master_exam_id/with-exams',
  teacherRoleValidator,
  wrapAsync(getMasterExamWithExamsController)
)

// Add new routes for master exam management
examsRouter.put(
  '/idea/master/:master_exam_id/toggle-status',
  teacherRoleValidator,
  wrapAsync(toggleMasterExamStatusController)
)
examsRouter.delete('/idea/master/:master_exam_id', teacherRoleValidator, wrapAsync(deleteMasterExamController))

export default examsRouter
