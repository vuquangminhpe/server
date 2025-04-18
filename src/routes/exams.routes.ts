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
  getClassExamResultsForMasterExamController
} from '../controllers/exams.controllers'
import {
  startExamController,
  submitExamController,
  getExamHistoryController
} from '../controllers/examSessions.controllers'
import { AccessTokenValidator, verifiedUserValidator } from '../middlewares/users.middlewares'
import { teacherRoleValidator } from '../middlewares/role.middlewares'
import { wrapAsync } from '../utils/handler'
import { generateExamValidator } from '../middlewares/exam.validator'
import { startExamValidator, submitExamValidator } from '../middlewares/examSession.validator'

const examsRouter = Router()

// All routes require authentication and verification
examsRouter.use(AccessTokenValidator, verifiedUserValidator)

// Teacher routes
examsRouter.post('/generate', teacherRoleValidator, generateExamValidator, wrapAsync(generateExamController))
examsRouter.get('/', teacherRoleValidator, wrapAsync(getExamsController))
examsRouter.get('/:exam_id', teacherRoleValidator, wrapAsync(getExamByIdController))
examsRouter.put('/:exam_id/status', teacherRoleValidator, wrapAsync(updateExamStatusController))
examsRouter.get('/:exam_id/results', teacherRoleValidator, wrapAsync(getExamResultsController))
examsRouter.get('/:exam_id/statistics', teacherRoleValidator, wrapAsync(getExamStatisticsController))

// Student routes
examsRouter.post('/start', startExamValidator, wrapAsync(startExamController))
examsRouter.post('/submit', submitExamValidator, wrapAsync(submitExamController))
examsRouter.get('/history', wrapAsync(getExamHistoryController))
examsRouter.get('/:exam_id/class-results', teacherRoleValidator, wrapAsync(getClassExamResultsController))

// Student violations route
examsRouter.get(
  '/:exam_id/students/:student_id/violations',
  teacherRoleValidator,
  wrapAsync(getStudentViolationsController)
)

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
export default examsRouter
