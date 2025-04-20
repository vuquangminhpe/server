import { Request, Response } from 'express'
import HTTP_STATUS from '../constants/httpStatus'
import { TokenPayload } from '../models/request/User.request'
import examSessionService from '../services/examSessions.services'

export const startExamController = async (req: Request, res: Response) => {
  const { exam_code } = req.body
  const { user_id } = req.decode_authorization as TokenPayload

  const result = await examSessionService.startExamSession({
    exam_code,
    student_id: user_id
  })

  res.json({
    message: 'Exam started successfully',
    result
  })
}

export const submitExamController = async (req: Request, res: Response) => {
  const { session_id, answers } = req.body

  try {
    const session = await examSessionService.submitExamSession({
      session_id,
      answers
    })

    res.json({
      message: 'Exam submitted successfully',
      result: session
    })
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to submit exam',
      error: error
    })
  }
}

export const getExamHistoryController = async (req: Request, res: Response) => {
  const { user_id } = req.decode_authorization as TokenPayload

  try {
    const history = await examSessionService.getStudentExamHistory(user_id)

    res.json({
      message: 'Exam history retrieved successfully',
      result: history
    })
  } catch (error) {
    console.log('sessionsWithExams')
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to retrieve exam history',
      error: error
    })
  }
}
