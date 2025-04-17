import { Router } from 'express'
import {
  createQuestionController,
  getQuestionsController,
  updateQuestionController,
  deleteQuestionController
} from '../controllers/questions.controllers'
import { AccessTokenValidator, verifiedUserValidator } from '../middlewares/users.middlewares'
import { teacherRoleValidator } from '../middlewares/role.middlewares'
import { wrapAsync } from '../utils/handler'
import { createQuestionValidator } from '../middlewares/question.validator'

const questionsRouter = Router()

// All routes require authentication and verification
questionsRouter.use(AccessTokenValidator, verifiedUserValidator)

// All routes require teacher role
questionsRouter.use(teacherRoleValidator)

// Routes
questionsRouter.post('/', createQuestionValidator, wrapAsync(createQuestionController))
questionsRouter.get('/', wrapAsync(getQuestionsController))
questionsRouter.put('/:id', createQuestionValidator, wrapAsync(updateQuestionController))
questionsRouter.delete('/:id', wrapAsync(deleteQuestionController))

export default questionsRouter
