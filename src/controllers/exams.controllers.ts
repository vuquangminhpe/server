import { Request, Response } from 'express'
import HTTP_STATUS from '../constants/httpStatus'
import { TokenPayload } from '../models/request/User.request'
import examService from '../services/exams.services'

export const generateExamController = async (req: Request, res: Response) => {
  const { title, quantity, question_count, duration, start_time } = req.body
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
      start_time: parsedStartTime
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
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
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
