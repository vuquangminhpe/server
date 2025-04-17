import { ObjectId } from 'mongodb'
import crypto from 'crypto'
import databaseService from './database.services'
import Exam from '../models/schemas/Exam.schema'
import questionService from './questions.services'
import QRCode from 'qrcode'

class ExamService {
  // Generate a unique exam code
  generateExamCode() {
    return crypto.randomBytes(4).toString('hex').toUpperCase()
  }

  // Generate QR code for an exam
  async generateQRCode(exam_code: string) {
    const payload = JSON.stringify({
      exam_code,
      timestamp: Date.now()
    })

    return await QRCode.toDataURL(payload)
  }

  async createExam({
    title,
    teacher_id,
    question_count,
    duration,
    start_time = null // New optional parameter
  }: {
    title: string
    teacher_id: string
    question_count: number
    duration: number
    start_time?: Date | null
  }) {
    // Get random questions from this teacher's question bank
    const questions = await questionService.getRandomQuestions(teacher_id, question_count)

    if (questions.length === 0) {
      throw new Error('Không có câu hỏi nào. Vui lòng tạo câu hỏi trước.')
    }

    const exam_code = this.generateExamCode()

    const exam = new Exam({
      title,
      exam_code,
      teacher_id: new ObjectId(teacher_id),
      question_ids: questions.map((q) => q._id),
      duration,
      start_time: start_time || undefined, // Use undefined to avoid setting null in MongoDB
      active: true
    })

    await databaseService.exams.insertOne(exam)

    // Generate QR code
    const qrCode = await this.generateQRCode(exam_code)

    return {
      exam,
      qrCode
    }
  }

  async getExamsByTeacher(teacher_id: string) {
    const exams = await databaseService.exams
      .find({ teacher_id: new ObjectId(teacher_id) })
      .sort({ created_at: -1 })
      .toArray()

    return exams
  }

  async getExamById(exam_id: string) {
    return await databaseService.exams.findOne({ _id: new ObjectId(exam_id) })
  }

  async getExamByCode(exam_code: string) {
    const exam = await databaseService.exams.findOne({ exam_code })

    if (!exam) {
      throw new Error('Không tìm thấy bài kiểm tra hoặc không hoạt động')
    }

    // Check if exam is active
    if (!exam.active) {
      throw new Error('Bài kiểm tra này hiện đã bị vô hiệu hóa')
    }

    // Check if the exam start time is in the future
    if (exam.start_time && new Date() < exam.start_time) {
      throw new Error('Chưa đến giờ thi, hãy liên hệ giáo viên')
    }

    return exam
  }

  async getExamWithQuestions(exam_id: string) {
    const exam = await databaseService.exams.findOne({ _id: new ObjectId(exam_id) })

    if (!exam) {
      throw new Error('Không tìm thấy bài kiểm tra')
    }

    // Get all questions for this exam
    const questions = await databaseService.questions.find({ _id: { $in: exam.question_ids } }).toArray()

    // Remove correct_index from questions for student view
    const sanitizedQuestions = questions.map((q) => ({
      _id: q._id,
      content: q.content,
      answers: q.answers
    }))

    return {
      ...exam,
      questions: sanitizedQuestions
    }
  }

  async bulkGenerateExams({
    title,
    teacher_id,
    quantity,
    question_count,
    duration,
    start_time = null // New optional parameter
  }: {
    title: string
    teacher_id: string
    quantity: number
    question_count: number
    duration: number
    start_time?: Date | null
  }) {
    const qrCodes = []

    for (let i = 0; i < quantity; i++) {
      const { exam, qrCode } = await this.createExam({
        title: `${title} #${i + 1}`,
        teacher_id,
        question_count,
        duration,
        start_time
      })

      qrCodes.push({
        exam_code: exam.exam_code,
        qrCode,
        start_time: exam.start_time // Include start time in response
      })
    }

    return qrCodes
  }

  // New method to update exam status
  async updateExamStatus(
    exam_id: string,
    {
      active,
      start_time,
      duration
    }: {
      active?: boolean
      start_time?: Date | null
      duration?: number
    }
  ) {
    const updateFields: any = {}

    // Only include fields that are provided
    if (active !== undefined) {
      updateFields.active = active
    }

    if (start_time !== undefined) {
      updateFields.start_time = start_time
    }

    if (duration !== undefined) {
      updateFields.duration = duration
    }

    const result = await databaseService.exams.findOneAndUpdate(
      { _id: new ObjectId(exam_id) },
      {
        $set: updateFields
      },
      { returnDocument: 'after' }
    )

    return result
  }

  // Get exam results with student information
  async getExamResults(exam_id: string) {
    // Get the exam sessions
    const sessions = await databaseService.examSessions
      .find({ exam_id: new ObjectId(exam_id) })
      .sort({ start_time: -1 })
      .toArray()

    // Get student info for each session
    const sessionsWithStudentInfo = await Promise.all(
      sessions.map(async (session) => {
        const student = await databaseService.users.findOne({ _id: session.student_id })

        return {
          ...session,

          student_username: student?.username || 'Unknown'
        }
      })
    )

    return sessionsWithStudentInfo
  }

  // Get exam statistics
  async getExamStatistics(exam_id: string) {
    const sessions = await databaseService.examSessions.find({ exam_id: new ObjectId(exam_id) }).toArray()

    const totalSessions = sessions.length

    if (totalSessions === 0) {
      return {
        averageScore: 0,
        completionRate: 0,
        totalStudents: 0,
        violationCount: 0
      }
    }

    const completedSessions = sessions.filter((session) => session.completed)
    const completionRate = (completedSessions.length / totalSessions) * 100

    // Calculate average score (only for completed exams)
    let averageScore = 0
    if (completedSessions.length > 0) {
      const totalScore = completedSessions.reduce((sum, session) => sum + session.score, 0)
      averageScore = totalScore / completedSessions.length
    }

    // Count total violations
    const violationCount = sessions.reduce((sum, session) => sum + session.violations, 0)

    return {
      averageScore,
      completionRate,
      totalStudents: totalSessions,
      violationCount
    }
  }

  // Calculate remaining time helper method
  calculateRemainingTime(startTime: Date, durationMinutes: number): number {
    const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000)
    const now = new Date()

    // If exam is over, return 0
    if (now > endTime) {
      return 0
    }

    // Return remaining seconds
    return Math.floor((endTime.getTime() - now.getTime()) / 1000)
  }
}

const examService = new ExamService()
export default examService
