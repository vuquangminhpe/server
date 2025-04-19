import { ObjectId } from 'mongodb'

interface MasterExamType {
  _id?: ObjectId
  name: string
  description?: string
  exam_period?: string
  start_time?: Date
  active: boolean
  end_time?: Date
  teacher_id: ObjectId
  created_at?: Date
  updated_at?: Date
}

export default class MasterExam {
  _id?: ObjectId
  name: string
  description?: string
  exam_period?: string
  start_time?: Date
  end_time?: Date
  teacher_id: ObjectId
  active: boolean
  created_at: Date
  updated_at: Date

  constructor({
    _id,
    name,
    description,
    exam_period,
    start_time,
    end_time,
    teacher_id,
    active,
    created_at,
    updated_at
  }: MasterExamType) {
    const date = new Date()
    this._id = _id
    this.name = name
    this.description = description
    this.exam_period = exam_period
    this.start_time = start_time
    this.end_time = end_time
    this.active = active || true
    this.teacher_id = teacher_id
    this.created_at = created_at || date
    this.updated_at = updated_at || date
  }
}
