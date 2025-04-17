import { Router } from 'express'
import questionsRouter from './questions.routes'
import examsRouter from './exams.routes'

const apiRouter = Router()

apiRouter.use('/questions', questionsRouter)
apiRouter.use('/exams', examsRouter)

export default apiRouter
