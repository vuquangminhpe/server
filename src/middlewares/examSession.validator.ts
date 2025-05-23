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
        trim: true,
        isLength: {
          options: { min: 1, max: 50 },
          errorMessage: 'Exam code must be between 1 and 50 characters'
        }
      },
      has_camera: {
        optional: true,
        isBoolean: {
          errorMessage: 'has_camera must be a boolean'
        },
        toBoolean: true
      },
      require_face_verification: {
        optional: true,
        isBoolean: {
          errorMessage: 'require_face_verification must be a boolean'
        },
        toBoolean: true
      },
      device_info: {
        optional: true,
        custom: {
          options: (value) => {
            if (value === undefined || value === null) {
              return true
            }

            // If it's a string, try to parse it as JSON
            if (typeof value === 'string') {
              try {
                const parsed = JSON.parse(value)
                return typeof parsed === 'object' && parsed !== null
              } catch (error) {
                throw new Error('device_info must be valid JSON')
              }
            }

            // If it's already an object, validate its structure
            if (typeof value === 'object' && value !== null) {
              return true
            }

            throw new Error('device_info must be an object or valid JSON string')
          }
        }
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
        trim: true,
        isMongoId: {
          errorMessage: 'Session ID must be a valid MongoDB ObjectId'
        }
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
            if (!Array.isArray(value)) {
              throw new Error('Answers must be an array')
            }

            if (value.length === 0) {
              throw new Error('At least one answer is required')
            }

            // Validate each answer object
            for (const answer of value) {
              if (!answer.question_id || !answer.hasOwnProperty('selected_index')) {
                throw new Error('Each answer must have question_id and selected_index')
              }

              if (typeof answer.question_id !== 'string') {
                throw new Error('question_id must be a string')
              }

              if (!answer.question_id.match(/^[0-9a-fA-F]{24}$/)) {
                throw new Error('question_id must be a valid MongoDB ObjectId')
              }

              if (
                typeof answer.selected_index !== 'number' ||
                answer.selected_index < 0 ||
                !Number.isInteger(answer.selected_index)
              ) {
                throw new Error('selected_index must be a non-negative integer')
              }
            }

            return true
          }
        }
      }
    },
    ['body']
  )
)

export const verifyFaceDuringExamValidator = validate(
  checkSchema(
    {
      session_id: {
        notEmpty: {
          errorMessage: 'Session ID is required'
        },
        isString: {
          errorMessage: 'Session ID must be a string'
        },
        trim: true,
        isMongoId: {
          errorMessage: 'Session ID must be a valid MongoDB ObjectId'
        }
      },
      has_camera: {
        optional: true,
        isBoolean: {
          errorMessage: 'has_camera must be a boolean'
        },
        toBoolean: true
      }
    },
    ['body']
  )
)

export const checkCameraAvailabilityValidator = validate(
  checkSchema(
    {
      user_agent: {
        optional: true,
        isString: {
          errorMessage: 'user_agent must be a string'
        },
        trim: true,
        isLength: {
          options: { max: 500 },
          errorMessage: 'user_agent must be less than 500 characters'
        }
      },
      screen_resolution: {
        optional: true,
        isString: {
          errorMessage: 'screen_resolution must be a string'
        },
        trim: true,
        matches: {
          options: /^\d+x\d+$/,
          errorMessage: 'screen_resolution must be in format "WIDTHxHEIGHT" (e.g., "1920x1080")'
        }
      },
      device_type: {
        optional: true,
        isIn: {
          options: [['desktop', 'mobile', 'tablet', 'unknown']],
          errorMessage: 'device_type must be one of: desktop, mobile, tablet, unknown'
        }
      }
    },
    ['body']
  )
)

export const getSessionStatisticsValidator = validate(
  checkSchema(
    {
      exam_id: {
        in: ['params'],
        notEmpty: {
          errorMessage: 'Exam ID is required'
        },
        isString: {
          errorMessage: 'Exam ID must be a string'
        },
        isMongoId: {
          errorMessage: 'Exam ID must be a valid MongoDB ObjectId'
        }
      }
    },
    ['params']
  )
)
