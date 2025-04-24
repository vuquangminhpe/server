import { Request, Response } from 'express'
import HTTP_STATUS from '../constants/httpStatus'
import { TokenPayload } from '../models/request/User.request'
import examService from '../services/exams.services'
import { UserRole } from '../models/schemas/User.schema'
import databaseService from '~/services/database.services'
import { ObjectId } from 'mongodb'

export const generateExamController = async (req: Request, res: Response) => {
  const { title, quantity, question_count, duration, start_time, master_exam_id } = req.body
  const { user_id } = req.decode_authorization as TokenPayload

  try {
    // Parse start_time if it's provided
    const parsedStartTime = start_time ? new Date(start_time) : null

    const qrCodes = await examService.bulkGenerateExams({
      title,
      teacher_id: user_id,
      quantity,
      question_count,
      duration,
      start_time: parsedStartTime,
      master_exam_id
    })

    res.json({
      message: 'Exams generated successfully',
      result: qrCodes
    })
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to generate exams',
      error: error
    })
  }
}

export const getExamsController = async (req: Request, res: Response) => {
  const { user_id } = req.decode_authorization as TokenPayload

  try {
    const exams = await examService.getExamsByTeacher(user_id)

    res.json({
      message: 'Exams retrieved successfully',
      result: exams
    })
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to retrieve exams',
      error: error
    })
  }
}

// New controller to get a specific exam by ID
export const getExamByIdController = async (req: Request, res: Response) => {
  const { exam_id } = req.params
  const { user_id } = req.decode_authorization as TokenPayload

  try {
    const exam = await examService.getExamById(exam_id)

    if (!exam) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        message: 'Exam not found'
      })
    }

    // Check if the exam belongs to this teacher
    if (exam.teacher_id.toString() !== user_id) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Not authorized to view this exam'
      })
    }

    res.json({
      message: 'Exam retrieved successfully',
      result: exam
    })
  } catch (error) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      message: 'Failed to retrieve exam',
      error: error
    })
  }
}

// New controller to update exam status (enable/disable)
export const updateExamStatusController = async (req: Request, res: Response) => {
  const { exam_id } = req.params
  const { active, start_time, duration } = req.body
  const { user_id } = req.decode_authorization as TokenPayload

  try {
    // Verify the exam belongs to the current teacher
    const exam = await examService.getExamById(exam_id)

    if (!exam) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        message: 'Exam not found'
      })
    }

    if (exam.teacher_id.toString() !== user_id) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Not authorized to update this exam'
      })
    }

    // Parse start_time if provided
    const parsedStartTime = start_time !== undefined ? (start_time ? new Date(start_time) : null) : undefined

    // Update the exam
    const updatedExam = await examService.updateExamStatus(exam_id, {
      active: active !== undefined ? active : undefined,
      start_time: parsedStartTime,
      duration: duration !== undefined ? duration : undefined
    })

    res.json({
      message: 'Exam status updated successfully',
      result: updatedExam
    })
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to update exam status',
      error: error
    })
  }
}

// Controller to get exam results
export const getExamResultsController = async (req: Request, res: Response) => {
  const { exam_id } = req.params
  const { user_id } = req.decode_authorization as TokenPayload

  try {
    // Verify the exam belongs to the current teacher
    const exam = await examService.getExamById(exam_id)

    if (!exam) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        message: 'Exam not found'
      })
    }

    if (exam.teacher_id.toString() !== user_id) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Not authorized to view results for this exam'
      })
    }

    const results = await examService.getExamResults(exam_id)

    res.json({
      message: 'Exam results retrieved successfully',
      result: results
    })
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to retrieve exam results',
      error: error
    })
  }
}

// Controller to get exam statistics
export const getExamStatisticsController = async (req: Request, res: Response) => {
  const { exam_id } = req.params
  const { user_id } = req.decode_authorization as TokenPayload

  try {
    // Verify the exam belongs to the current teacher
    const exam = await examService.getExamById(exam_id)

    if (!exam) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        message: 'Exam not found'
      })
    }

    if (exam.teacher_id.toString() !== user_id) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Not authorized to view statistics for this exam'
      })
    }

    const statistics = await examService.getExamStatistics(exam_id)

    res.json({
      message: 'Exam statistics retrieved successfully',
      result: statistics
    })
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to retrieve exam statistics',
      error: error
    })
  }
}
export const getClassExamResultsController = async (req: Request, res: Response) => {
  const { exam_id } = req.params
  const { search_term, violation_types, page, limit } = req.query
  const { user_id } = req.decode_authorization as TokenPayload
  try {
    const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })

    // Verify the exam belongs to the current teacher
    const exam = await examService.getExamById(exam_id)

    if (!exam) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        message: 'Exam not found'
      })
    }

    if (exam.teacher_id.toString() !== user_id && user?.role !== UserRole.Teacher) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Not authorized to view results for this exam'
      })
    }

    // Parse filters
    const filters: any = {}

    if (search_term) {
      filters.searchTerm = search_term as string
    }

    if (violation_types) {
      filters.violationTypes = (violation_types as string).split(',')
    }

    if (page) {
      filters.page = parseInt(page as string)
    }

    if (limit) {
      filters.limit = parseInt(limit as string)
    }

    const results = await examService.getClassExamResults(exam_id, filters)

    res.json({
      message: 'Class exam results retrieved successfully',
      result: results
    })
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to retrieve class exam results',
      error: error
    })
  }
}

export const createMasterExamController = async (req: Request, res: Response) => {
  const { name, description, exam_period, start_time, end_time } = req.body
  const { user_id } = req.decode_authorization as TokenPayload

  try {
    const result = await examService.createMasterExam({
      name,
      description,
      exam_period,
      start_time: start_time ? new Date(start_time) : undefined,
      end_time: end_time ? new Date(end_time) : undefined,
      teacher_id: user_id
    })

    res.json({
      message: 'Master exam created successfully',
      result
    })
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to create master exam',
      error: error
    })
  }
}

// Controller to get master exams
export const getMasterExamsController = async (req: Request, res: Response) => {
  const { user_id } = req.decode_authorization as TokenPayload

  try {
    const masterExams = await examService.getMasterExams(user_id)

    res.json({
      message: 'Master exams retrieved successfully',
      result: masterExams
    })
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to retrieve master exams',
      error: error
    })
  }
}

// Controller to get a specific master exam
export const getMasterExamByIdController = async (req: Request, res: Response) => {
  const { master_exam_id } = req.params
  const { user_id } = req.decode_authorization as TokenPayload

  try {
    const masterExam = await examService.getMasterExamById(master_exam_id)
    const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })

    if (!masterExam) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        message: 'Master exam not found'
      })
    }

    // Verify ownership
    if (masterExam.teacher_id.toString() !== user_id && user?.role !== UserRole.Teacher) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Not authorized to view this master exam'
      })
    }

    res.json({
      message: 'Master exam retrieved successfully',
      result: masterExam
    })
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to retrieve master exam',
      error: error
    })
  }
}

// Controller to get exams by master exam ID
export const getExamsByMasterExamIdController = async (req: Request, res: Response) => {
  const { master_exam_id } = req.params
  const { user_id } = req.decode_authorization as TokenPayload

  try {
    // Verify the master exam exists and belongs to this teacher
    const masterExam = await examService.getMasterExamById(master_exam_id)
    const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })

    if (!masterExam) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        message: 'Master exam not found'
      })
    }

    if (masterExam.teacher_id.toString() !== user_id && user?.role !== UserRole.Teacher) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Not authorized to view exams for this master exam'
      })
    }

    const exams = await examService.getExamsByMasterExamId(master_exam_id)

    res.json({
      message: 'Exams retrieved successfully',
      result: exams
    })
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to retrieve exams',
      error: error
    })
  }
}

// Controller to get classes for a master exam
export const getClassesForMasterExamController = async (req: Request, res: Response) => {
  const { master_exam_id } = req.params
  const { user_id } = req.decode_authorization as TokenPayload

  try {
    // Verify the master exam exists and belongs to this teacher
    const masterExam = await examService.getMasterExamById(master_exam_id)
    const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })

    if (!masterExam) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        message: 'Master exam not found'
      })
    }

    if (masterExam.teacher_id.toString() !== user_id && user?.role !== UserRole.Teacher) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Not authorized to view classes for this master exam'
      })
    }

    const classes = await examService.getClassesForMasterExam(master_exam_id)

    res.json({
      message: 'Classes retrieved successfully',
      result: classes
    })
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to retrieve classes',
      error: error
    })
  }
}

export const getClassExamResultsForMasterExamController = async (req: Request, res: Response) => {
  const { master_exam_id, className } = req.params
  const { search_term, violation_types, page, limit } = req.query
  const { user_id } = req.decode_authorization as TokenPayload

  try {
    // Verify the master exam exists and belongs to this teacher
    const masterExam = await examService.getMasterExamById(master_exam_id)
    const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })

    if (!masterExam) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        message: 'Master exam not found'
      })
    }

    if (masterExam.teacher_id.toString() !== user_id && user?.role !== UserRole.Teacher) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Not authorized to view results for this master exam'
      })
    }

    // Parse filters
    const filters: any = {}

    if (search_term) {
      filters.searchTerm = search_term as string
    }

    if (violation_types) {
      if (Array.isArray(violation_types)) {
        filters.violationTypes = violation_types
      } else {
        filters.violationTypes = (violation_types as string).split(',')
      }
    }

    if (page) {
      filters.page = parseInt(page as string)
    }

    if (limit) {
      filters.limit = parseInt(limit as string)
    }

    // Add class filter
    const decodedClassName = decodeURIComponent(className)

    const results = await examService.getClassExamResultsForMasterExam(master_exam_id, decodedClassName, filters)

    res.json({
      message: 'Class exam results for master exam retrieved successfully',
      result: results
    })
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to retrieve class exam results for master exam',
      error: error
    })
  }
}
export const getStudentViolationsController = async (req: Request, res: Response) => {
  const { exam_id, student_id } = req.params
  const { user_id } = req.decode_authorization as TokenPayload

  try {
    // First try to find as a regular exam
    const exam = await examService.getExamById(exam_id)
    const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })

    if (exam) {
      // This is a regular exam
      // Check if the user has permission
      if (exam.teacher_id.toString() !== user_id && user?.role !== UserRole.Teacher) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          message: 'Not authorized to view violations for this exam'
        })
      }

      // Get violations for a regular exam
      const violations = await examService.getStudentViolations(exam_id, student_id)

      return res.json({
        message: 'Student violations retrieved successfully',
        result: violations
      })
    }

    // If not a regular exam, check if it's a master exam
    const masterExam = await examService.getMasterExamById(exam_id)

    if (!masterExam) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        message: 'Exam or Master exam not found'
      })
    }

    // Check permissions for master exam
    if (masterExam.teacher_id.toString() !== user_id && user?.role !== UserRole.Teacher) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Not authorized to view violations for this master exam'
      })
    }

    // Get violations for all exams in this master exam
    const violations = await examService.getStudentViolationsForMasterExam(exam_id, student_id)

    return res.json({
      message: 'Student violations retrieved successfully',
      result: violations
    })
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to retrieve student violations',
      error: error
    })
  }
}
export const getMasterExamsWithStatusController = async (req: Request, res: Response) => {
  const { user_id } = req.decode_authorization as TokenPayload

  try {
    const masterExams = await examService.getMasterExamsWithStatus(user_id)

    res.json({
      message: 'Master exams retrieved successfully',
      result: masterExams
    })
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to retrieve master exams',
      error: error
    })
  }
}

// Toggle master exam status
export const toggleMasterExamStatusController = async (req: Request, res: Response) => {
  const { master_exam_id } = req.params
  const { active } = req.body
  const { user_id } = req.decode_authorization as TokenPayload

  try {
    // Verify the master exam exists and belongs to this teacher
    const masterExam = await examService.getMasterExamById(master_exam_id)
    const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })

    if (!masterExam) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        message: 'Master exam not found'
      })
    }

    if (masterExam.teacher_id.toString() !== user_id && user?.role !== UserRole.Teacher) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Not authorized to update this master exam'
      })
    }

    const result = await examService.toggleMasterExamStatus(master_exam_id, active)

    res.json({
      message: `Master exam ${active ? 'activated' : 'deactivated'} successfully`,
      result
    })
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to update master exam status',
      error: error
    })
  }
}

// Delete master exam with restrictions
export const deleteMasterExamController = async (req: Request, res: Response) => {
  const { master_exam_id } = req.params
  const { user_id } = req.decode_authorization as TokenPayload

  try {
    const result = await examService.deleteMasterExam(master_exam_id, user_id)

    res.json({
      message: 'Master exam deleted successfully',
      result
    })
  } catch (error: any) {
    // Determine the appropriate status code based on the error
    let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR
    let message = 'Failed to delete master exam'

    if (error.message.includes('Not authorized')) {
      statusCode = HTTP_STATUS.FORBIDDEN
      message = error.message
    } else if (error.message.includes('not found')) {
      statusCode = HTTP_STATUS.NOT_FOUND
      message = error.message
    } else if (error.message.startsWith('Cannot delete:')) {
      statusCode = HTTP_STATUS.BAD_REQUEST
      message = error.message
    }

    res.status(statusCode).json({
      message,
      error: error.message
    })
  }
}

// Get detailed master exam with all exams
export const getMasterExamWithExamsController = async (req: Request, res: Response) => {
  const { master_exam_id } = req.params
  const { user_id } = req.decode_authorization as TokenPayload

  try {
    // Verify the user has permission
    const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })
    const masterExam = await examService.getMasterExamById(master_exam_id)

    if (!masterExam) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        message: 'Master exam not found'
      })
    }

    if (masterExam.teacher_id.toString() !== user_id && user?.role !== UserRole.Teacher) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Not authorized to view this master exam'
      })
    }

    const result = await examService.getMasterExamWithExams(master_exam_id)

    res.json({
      message: 'Master exam retrieved successfully',
      result
    })
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to retrieve master exam',
      error: error
    })
  }
}
