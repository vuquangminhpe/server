import { checkSchema } from 'express-validator'
import { validate } from '../utils/validation'

export const startExamValidator = validate(
  checkSchema(
    {
      exam_code: {
        notEmpty: {
          errorMessage: 'Exam code is required'
        },
        isString: {
          errorMessage: 'Exam code must be a string'
        },
        trim: true
      }
    },
    ['body']
  )
)

export const submitExamValidator = validate(
  checkSchema(
    {
      session_id: {
        notEmpty: {
          errorMessage: 'Session ID is required'
        },
        isString: {
          errorMessage: 'Session ID must be a string'
        },
        trim: true
      },
      answers: {
        notEmpty: {
          errorMessage: 'Answers are required'
        },
        isArray: {
          errorMessage: 'Answers must be an array'
        }
      },
      'answers.*.question_id': {
        notEmpty: {
          errorMessage: 'Question ID is required for each answer'
        },
        isString: {
          errorMessage: 'Question ID must be a string'
        },
        trim: true
      },
      'answers.*.selected_index': {
        notEmpty: {
          errorMessage: 'Selected index is required for each answer'
        },
        isInt: {
          options: { min: 0 },
          errorMessage: 'Selected index must be a non-negative integer'
        }
      }
    },
    ['body']
  )
)
