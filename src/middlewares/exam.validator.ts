import { checkSchema } from 'express-validator'
import { validate } from '../utils/validation'

export const generateExamValidator = validate(
  checkSchema(
    {
      title: {
        notEmpty: {
          errorMessage: 'Exam title is required'
        },
        isString: {
          errorMessage: 'Exam title must be a string'
        },
        trim: true
      },
      quantity: {
        notEmpty: {
          errorMessage: 'Quantity is required'
        },
        isInt: {
          options: { min: 1, max: 100 },
          errorMessage: 'Quantity must be an integer between 1 and 100'
        }
      },
      question_count: {
        notEmpty: {
          errorMessage: 'Question count is required'
        },
        isInt: {
          options: { min: 1 },
          errorMessage: 'Question count must be a positive integer'
        }
      },
      duration: {
        notEmpty: {
          errorMessage: 'Duration is required'
        },
        isInt: {
          options: { min: 1 },
          errorMessage: 'Duration must be a positive integer'
        }
      },
      start_time: {
        optional: true,
        isISO8601: {
          errorMessage: 'Start time must be a valid ISO8601 date'
        }
      }
    },
    ['body']
  )
)

export const updateExamStatusValidator = validate(
  checkSchema(
    {
      active: {
        optional: true,
        isBoolean: {
          errorMessage: 'Active status must be a boolean'
        }
      },
      start_time: {
        optional: true,
        isISO8601: {
          errorMessage: 'Start time must be a valid ISO8601 date'
        }
      },
      duration: {
        optional: true,
        isInt: {
          options: { min: 1 },
          errorMessage: 'Duration must be a positive integer'
        }
      }
    },
    ['body']
  )
)
