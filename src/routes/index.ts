import { Router } from 'express'
import questionsRouter from './questions.routes'
import examsRouter from './exams.routes'
import faceVerificationRouter from './faceVerification.routes'

const apiRouter = Router()

apiRouter.use('/questions', questionsRouter)
apiRouter.use('/exams', examsRouter)
apiRouter.use('/face', faceVerificationRouter)
export default apiRouter
