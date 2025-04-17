import { Router } from 'express'
import { AccessTokenValidator } from '../middlewares/users.middlewares'
import { wrapAsync } from '../utils/handler'
import { generateTextGeminiController } from '../controllers/users.controllers'

const geminiRoutes = Router()

/**
 * Description: generate tweet with gemini (text)
 * Path: /generate/text
 * Method: POST
 * header: {Authorization:Bearer <access_token> }
 * body: message
 */
geminiRoutes.post('/generate/text', AccessTokenValidator, wrapAsync(generateTextGeminiController))
export default geminiRoutes
