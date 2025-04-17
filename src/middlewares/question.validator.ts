import { checkSchema } from 'express-validator'
import { validate } from '../utils/validation'

export const createQuestionValidator = validate(
  checkSchema(
    {
      content: {
        notEmpty: {
          errorMessage: 'Question content is required'
        },
        isString: {
          errorMessage: 'Question content must be a string'
        },
        trim: true
      },
      answers: {
        notEmpty: {
          errorMessage: 'Answers are required'
        },
        isArray: {
          errorMessage: 'Answers must be an array'
        },
        custom: {
          options: (value) => {
            if (!Array.isArray(value) || value.length < 2) {
              throw new Error('At least 2 answers are required')
            }
            return true
          }
        }
      },
      'answers.*': {
        isString: {
          errorMessage: 'Each answer must be a string'
        },
        trim: true
      },
      correct_index: {
        notEmpty: {
          errorMessage: 'Correct answer index is required'
        },
        isInt: {
          errorMessage: 'Correct answer index must be an integer'
        },
        custom: {
          options: (value, { req }) => {
            const { answers } = req.body
            if (value < 0 || value >= answers.length) {
              throw new Error(`Correct answer index must be between 0 and ${answers.length - 1}`)
            }
            return true
          }
        }
      }
    },
    ['body']
  )
)
