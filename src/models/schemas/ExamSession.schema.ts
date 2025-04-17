import { ObjectId } from 'mongodb'

interface Answer {
  question_id: ObjectId
  selected_index: number
}

interface ExamSessionType {
  _id?: ObjectId
  exam_id: ObjectId
  student_id: ObjectId
  start_time?: Date
  end_time?: Date
  answers?: Answer[]
  score?: number
  violations?: number
  completed?: boolean
  created_at?: Date
  updated_at?: Date
}

export default class ExamSession {
  _id?: ObjectId
  exam_id: ObjectId
  student_id: ObjectId
  start_time: Date
  end_time: Date | null
  answers: Answer[]
  score: number
  violations: number
  completed: boolean
  created_at: Date
  updated_at: Date

  constructor({
    _id,
    exam_id,
    student_id,
    start_time,
    end_time,
    answers,
    score,
    violations,
    completed,
    created_at,
    updated_at
  }: ExamSessionType) {
    const date = new Date()
    this._id = _id
    this.exam_id = exam_id
    this.student_id = student_id
    this.start_time = start_time || date
    this.end_time = end_time || null
    this.answers = answers || []
    this.score = score || 0
    this.violations = violations || 0
    this.completed = completed || false
    this.created_at = created_at || date
    this.updated_at = updated_at || date
  }
}
