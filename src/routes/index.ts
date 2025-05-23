import { Router } from 'express'
import questionsRouter from './questions.routes'
import examsRouter from './exams.routes'
import faceVerificationRouter from './faceVerification.routes'
import searchRouter from './search.routes'

const apiRouter = Router()

apiRouter.use('/questions', questionsRouter)
apiRouter.use('/exams', examsRouter)
apiRouter.use('/face', faceVerificationRouter)
apiRouter.use('/search', searchRouter)
export default apiRouter
