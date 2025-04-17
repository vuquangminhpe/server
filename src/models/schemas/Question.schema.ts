import { ObjectId } from 'mongodb'

interface QuestionType {
  _id?: ObjectId
  content: string
  answers: string[]
  correct_index: number
  teacher_id: ObjectId
  created_at?: Date
  updated_at?: Date
}

export default class Question {
  _id?: ObjectId
  content: string
  answers: string[]
  correct_index: number
  teacher_id: ObjectId
  created_at: Date
  updated_at: Date

  constructor({ _id, content, answers, correct_index, teacher_id, created_at, updated_at }: QuestionType) {
    const date = new Date()
    this._id = _id
    this.content = content
    this.answers = answers
    this.correct_index = correct_index
    this.teacher_id = teacher_id
    this.created_at = created_at || date
    this.updated_at = updated_at || date
  }
}
