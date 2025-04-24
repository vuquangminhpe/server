import { ObjectId } from 'mongodb'
import databaseService from './database.services'
import Question from '../models/schemas/Question.schema'

class QuestionService {
  async createQuestion({
    content,
    answers,
    correct_index,
    teacher_id,
    master_exam_id,
    questionLink
  }: {
    content: string
    answers: string[]
    correct_index: number
    teacher_id: string
    master_exam_id: string
    questionLink?: string
  }) {
    const question = new Question({
      content,
      answers,
      correct_index,
      teacher_id: new ObjectId(teacher_id),
      master_exam_id: new ObjectId(master_exam_id),
      questionLink
    })

    await databaseService.questions.insertOne(question)
    return question
  }

  async getQuestionsByTeacher(teacher_id: string, master_exam_id?: string) {
    const matchCondition: any = {
      teacher_id: new ObjectId(teacher_id)
    }

    if (master_exam_id && master_exam_id.trim() !== '') {
      matchCondition.master_exam_id = new ObjectId(master_exam_id)
    }

    const questions = await databaseService.questions
      .aggregate([
        {
          $match: matchCondition
        },
        {
          $sort: {
            created_at: -1
          }
        },
        {
          $lookup: {
            from: 'master_exams',
            localField: 'master_exam_id',
            foreignField: '_id',
            as: 'master_exam'
          }
        },
        {
          $unwind: {
            path: '$master_exam',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $project: {
            _id: 1,
            content: 1,
            answers: 1,
            correct_index: 1,
            teacher_id: 1,
            created_at: 1,
            updated_at: 1,
            master_exam_id: 1,
            questionLink: 1,
            exam_name: '$master_exam.name',
            exam_period: '$master_exam.exam_period',
            exam_id: '$master_exam._id'
          }
        }
      ])
      .toArray()

    return questions
  }

  async getQuestionById(question_id: string) {
    const question = await databaseService.questions.findOne({
      _id: new ObjectId(question_id)
    })

    return question
  }

  async updateQuestion(question_id: string, data: Partial<Question>) {
    const result = await databaseService.questions.findOneAndUpdate(
      { _id: new ObjectId(question_id) },
      {
        $set: {
          ...data,
          updated_at: new Date()
        }
      },
      { returnDocument: 'after' }
    )

    return result
  }

  async deleteQuestion(question_id: string) {
    const result = await databaseService.questions.deleteOne({
      _id: new ObjectId(question_id)
    })

    return result.deletedCount > 0
  }

  async getRandomQuestions(teacher_id: string, count: number, master_exam_id: string) {
    // Get random questions for a specific teacher
    const questions = await databaseService.questions
      .aggregate([
        { $match: { teacher_id: new ObjectId(teacher_id), master_exam_id: new ObjectId(master_exam_id) } },
        { $sample: { size: count } }
      ])
      .toArray()

    return questions
  }
  async DeleteAllQuestions(teacher_id: string) {
    // Delete all questions for a specific teacher
    const result = await databaseService.questions.deleteMany({
      teacher_id: new ObjectId(teacher_id)
    })

    return result.deletedCount > 0
  }
}

const questionService = new QuestionService()
export default questionService
