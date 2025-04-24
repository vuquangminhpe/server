import { MongoClient, Db, Collection } from 'mongodb'
import User from '../models/schemas/User.schema'
import RefreshToken from '../models/schemas/RefreshToken.schema'
import VideoStatus from '../models/schemas/VideoStatus.schema'

import { envConfig } from '../constants/config'
import Question from '../models/schemas/Question.schema'
import Exam from '../models/schemas/Exam.schema'
import ExamSession from '../models/schemas/ExamSession.schema'
import MasterExam from '../models/schemas/MasterExam.schema'

const uri = envConfig.mongodb_url
const dbName = envConfig.db_name

class DatabaseService {
  private static instance: DatabaseService
  public client: MongoClient
  public db: Db

  private constructor() {
    this.client = new MongoClient(uri)
    this.db = this.client.db(dbName)
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService()
    }
    return DatabaseService.instance
  }

  async connect() {
    try {
      await this.client.connect() // Kết nối nếu chưa có
      await this.db.command({ ping: 1 })
      console.log('Connected to MongoDB!')
    } catch (error) {
      console.error('MongoDB connection error:', error)
      throw error
    }
  }

  async indexExams() {
    const exists = await this.exams.indexExists(['exam_code_1', 'teacher_id_1'])
    if (!exists) {
      this.exams.createIndex({ exam_code: 1 }, { unique: true })
      this.exams.createIndex({ teacher_id: 1 })
    }
  }

  async indexExamSessions() {
    const exists = await this.examSessions.indexExists(['exam_id_1_student_id_1', 'student_id_1', 'exam_id_1'])
    if (!exists) {
      this.examSessions.createIndex({ exam_id: 1, student_id: 1 }, { unique: true })
      this.examSessions.createIndex({ student_id: 1 })
      this.examSessions.createIndex({ exam_id: 1 })
    }
  }
  async indexVideoStatus() {
    const exits = await this.users.indexExists('name_1')
    if (!exits) {
      this.videoStatus.createIndex({ name: 1 }, { unique: true })
    }
  }

  get users(): Collection<User> {
    return this.db.collection(envConfig.usersCollection)
  }

  get refreshToken(): Collection<RefreshToken> {
    return this.db.collection(envConfig.refreshCollection)
  }

  get videoStatus(): Collection<VideoStatus> {
    return this.db.collection(envConfig.VideoStatusCollection)
  }
  get questions(): Collection<Question> {
    return this.db.collection('questions')
  }

  get exams(): Collection<Exam> {
    return this.db.collection('exams')
  }

  get examSessions(): Collection<ExamSession> {
    return this.db.collection('exam_sessions')
  }
  get masterExams(): Collection<MasterExam> {
    return this.db.collection('master_exams')
  }
}

const databaseService = DatabaseService.getInstance()
databaseService.connect().catch(console.error)
export default databaseService
