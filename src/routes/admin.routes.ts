import { Router } from 'express'

import { AccessTokenValidator, verifiedUserValidator } from '../middlewares/users.middlewares'
import { isAdminValidator } from '../middlewares/admin.middlewares'

const adminRouter = Router()

adminRouter.use(AccessTokenValidator, verifiedUserValidator, isAdminValidator)

export default adminRouter
