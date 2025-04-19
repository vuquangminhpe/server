import { Request, Response } from 'express'
import HTTP_STATUS from '../constants/httpStatus'
import questionService from '../services/questions.services'
import { TokenPayload } from '../models/request/User.request'

export const createQuestionController = async (req: Request, res: Response) => {
  const { content, answers, correct_index, master_exam_id } = req.body
  const { user_id } = req.decode_authorization as TokenPayload as TokenPayload

  try {
    const question = await questionService.createQuestion({
      content,
      answers,
      correct_index,
      teacher_id: user_id,
      master_exam_id
    })

    res.json({
      message: 'Question created successfully',
      result: question
    })
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to create question',
      error: error
    })
  }
}

export const getQuestionsController = async (req: Request, res: Response) => {
  const { user_id } = req.decode_authorization as TokenPayload
  const { master_exam_id } = req.body
  console.log('getQuestionsController', user_id, master_exam_id)

  try {
    const questions = await questionService.getQuestionsByTeacher(user_id, master_exam_id?.toString())

    res.json({
      message: 'Questions retrieved successfully',
      result: questions
    })
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to retrieve questions',
      error: error
    })
  }
}

export const updateQuestionController = async (req: Request, res: Response) => {
  const { id } = req.params
  const { content, answers, correct_index } = req.body
  const { user_id } = req.decode_authorization as TokenPayload

  try {
    // Verify ownership of the question
    const question = await questionService.getQuestionById(id)

    if (!question) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        message: 'Question not found'
      })
    }

    if (question.teacher_id.toString() !== user_id) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Not authorized to update this question'
      })
    }

    const updatedQuestion = await questionService.updateQuestion(id, {
      content,
      answers,
      correct_index
    })

    res.json({
      message: 'Question updated successfully',
      result: updatedQuestion
    })
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to update question',
      error: error
    })
  }
}

export const deleteQuestionController = async (req: Request, res: Response) => {
  const { id } = req.params
  const { user_id } = req.decode_authorization as TokenPayload

  try {
    // Verify ownership of the question
    const question = await questionService.getQuestionById(id)

    if (!question) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        message: 'Question not found'
      })
    }

    if (question.teacher_id.toString() !== user_id) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Not authorized to delete this question'
      })
    }

    const result = await questionService.deleteQuestion(id)

    if (!result) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        message: 'Question not found'
      })
    }

    res.json({
      message: 'Question deleted successfully'
    })
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to delete question',
      error: error
    })
  }
}
export const DeleteAllQuestionWithTeacher = async (req: Request, res: Response) => {
  const { user_id } = req.decode_authorization as TokenPayload

  try {
    const result = await questionService.DeleteAllQuestions(user_id)

    res.json({
      message: 'All questions deleted successfully',
      result: result
    })
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to delete all questions',
      error: error
    })
  }
}
