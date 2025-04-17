import { ObjectId } from 'mongodb'
import databaseService from './database.services'
import Question from '../models/schemas/Question.schema'

class QuestionService {
  async createQuestion({
    content,
    answers,
    correct_index,
    teacher_id
  }: {
    content: string
    answers: string[]
    correct_index: number
    teacher_id: string
  }) {
    const question = new Question({
      content,
      answers,
      correct_index,
      teacher_id: new ObjectId(teacher_id)
    })

    await databaseService.questions.insertOne(question)
    return question
  }

  async getQuestionsByTeacher(teacher_id: string) {
    const questions = await databaseService.questions
      .find({ teacher_id: new ObjectId(teacher_id) })
      .sort({ created_at: -1 })
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

  async getRandomQuestions(teacher_id: string, count: number) {
    // Get random questions for a specific teacher
    const questions = await databaseService.questions
      .aggregate([{ $match: { teacher_id: new ObjectId(teacher_id) } }, { $sample: { size: count } }])
      .toArray()

    return questions
  }
}

const questionService = new QuestionService()
export default questionService
