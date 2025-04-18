import { ObjectId } from 'mongodb'

interface ExamType {
  _id?: ObjectId
  title: string
  exam_code: string
  teacher_id: ObjectId
  question_ids: ObjectId[]
  duration: number
  start_time?: Date
  created_at?: Date
  active?: boolean
  master_exam_id?: ObjectId
}

export default class Exam {
  _id?: ObjectId
  title: string
  exam_code: string
  teacher_id: ObjectId
  question_ids: ObjectId[]
  duration: number
  start_time?: Date
  created_at: Date
  active: boolean
  master_exam_id?: ObjectId

  constructor({
    _id,
    title,
    exam_code,
    teacher_id,
    question_ids,
    duration,
    start_time,
    created_at,
    active,
    master_exam_id
  }: ExamType) {
    const date = new Date()
    this._id = _id
    this.title = title
    this.exam_code = exam_code
    this.teacher_id = teacher_id
    this.question_ids = question_ids
    this.duration = duration
    this.start_time = start_time
    this.created_at = created_at || date
    this.active = active !== undefined ? active : true
    this.master_exam_id = master_exam_id
  }
}
