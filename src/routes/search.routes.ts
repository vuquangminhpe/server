import { Router } from 'express'
import {
  searchStudentsByTextController,
  searchStudentsByImageController,
  searchTeachersByTextController,
  searchTeachersByImageController,
  generateUserEmbeddingsController,
  batchGenerateEmbeddingsController,
  storeUserImageEmbeddingController,
  storeUserTextEmbeddingController,
  uploadSearchImageMiddleware
} from '../controllers/search.controllers'
import { AccessTokenValidator, verifiedUserValidator } from '../middlewares/users.middlewares'
import { teacherRoleValidator } from '../middlewares/role.middlewares'
import { isAdminValidator } from '../middlewares/admin.middlewares'
import { wrapAsync } from '../utils/handler'

const searchRouter = Router()

// All routes require authentication and verification
searchRouter.use(AccessTokenValidator, verifiedUserValidator)

/**
 * ===== STUDENT SEARCH (For Teachers) =====
 */

/**
 * Search students by text
 * POST /search/students/text
 * Body: { search_text: string, limit?: number }
 * Access: Teachers only
 */
searchRouter.post('/students/text', teacherRoleValidator, wrapAsync(searchStudentsByTextController))

/**
 * Search students by image
 * POST /search/students/image
 * Body: form-data with search_image file, limit?: number
 * Access: Teachers only
 */
searchRouter.post(
  '/students/image',
  teacherRoleValidator,
  uploadSearchImageMiddleware,
  wrapAsync(searchStudentsByImageController)
)

/**
 * ===== TEACHER SEARCH (For Admins) =====
 */

/**
 * Search teachers by text
 * POST /search/teachers/text
 * Body: { search_text: string, limit?: number }
 * Access: Admins only
 */
searchRouter.post('/teachers/text', isAdminValidator, wrapAsync(searchTeachersByTextController))

/**
 * Search teachers by image
 * POST /search/teachers/image
 * Body: form-data with search_image file, limit?: number
 * Access: Admins only
 */
searchRouter.post(
  '/teachers/image',
  isAdminValidator,
  uploadSearchImageMiddleware,
  wrapAsync(searchTeachersByImageController)
)

/**
 * ===== EMBEDDING MANAGEMENT =====
 */

/**
 * Store text embedding for current user
 * POST /search/embeddings/text
 * Body: { text: string, type?: 'profile' | 'description' | 'bio' }
 * Access: All authenticated users
 */
searchRouter.post('/embeddings/text', wrapAsync(storeUserTextEmbeddingController))

/**
 * Store image embedding for current user
 * POST /search/embeddings/image
 * Body: form-data with profile image
 * Access: All authenticated users
 */
searchRouter.post('/embeddings/image', uploadSearchImageMiddleware, wrapAsync(storeUserImageEmbeddingController))

/**
 * Generate embeddings for specific user
 * POST /search/embeddings/generate
 * Body: { target_user_id: string }
 * Access: Admins only
 */
searchRouter.post('/embeddings/generate', isAdminValidator, wrapAsync(generateUserEmbeddingsController))

/**
 * Batch generate embeddings for all users of a role
 * POST /search/embeddings/batch
 * Body: { user_role: 'student' | 'teacher' }
 * Access: Admins only
 */
searchRouter.post('/embeddings/batch', isAdminValidator, wrapAsync(batchGenerateEmbeddingsController))

export default searchRouter
