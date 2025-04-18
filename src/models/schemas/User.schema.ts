import { ObjectId } from 'mongodb'
import { UserVerifyStatus } from '../../constants/enums'

// Add this enum to User.schema.js
export enum UserRole {
  Student = 'student',
  Teacher = 'teacher',
  Admin = 'admin'
}

export default class UserType {
  // Existing fields
  _id?: ObjectId
  password: string
  created_at?: Date
  updated_at?: Date
  email_verify_token?: string
  forgot_password_token?: string
  verify?: UserVerifyStatus
  role: UserRole // Add this field
  name: string
  username?: string
  avatar?: string
  class: string

  constructor(user: UserType) {
    // Existing initialization
    const date = new Date()
    this._id = user._id
    this.password = user.password
    this.created_at = user.created_at || date
    this.updated_at = user.updated_at || date
    this.email_verify_token = user.email_verify_token || ''
    this.forgot_password_token = user.forgot_password_token || ''
    this.verify = user.verify || UserVerifyStatus.Unverified
    this.role = user.role || UserRole.Student
    this.username = user.username || ''
    this.avatar = user.avatar || ''
    this.name = user.name || ''
    this.class = user.class || ''
  }
}
