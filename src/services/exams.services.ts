import { ObjectId } from 'mongodb'
import crypto from 'crypto'
import databaseService from './database.services'
import Exam from '../models/schemas/Exam.schema'
import questionService from './questions.services'
import QRCode from 'qrcode'
import MasterExam from '../models/schemas/MasterExam.schema'

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
    start_time = null, // New optional parameter
    master_exam_id
  }: {
    title: string
    teacher_id: string
    question_count: number
    duration: number
    start_time?: Date | null
    master_exam_id: string
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
      active: true,
      master_exam_id: new ObjectId(master_exam_id)
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
    start_time = null, // New optional parameter
    master_exam_id
  }: {
    title: string
    teacher_id: string
    quantity: number
    question_count: number
    duration: number
    start_time?: Date | null
    master_exam_id: string
  }) {
    const qrCodes = []

    for (let i = 0; i < quantity; i++) {
      const { exam, qrCode } = await this.createExam({
        title: `${title} #${i + 1}`,
        teacher_id,
        question_count,
        duration,
        start_time,
        master_exam_id: master_exam_id
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
  async getClassExamResults(
    examId: string,
    filters?: {
      searchTerm?: string
      violationTypes?: string[]
      page?: number
      limit?: number
    }
  ) {
    try {
      const exam = await databaseService.exams.findOne({ _id: new ObjectId(examId) })

      if (!exam) {
        throw new Error('Exam not found')
      }

      // Base query to get all sessions for this exam
      let query: any = { exam_id: new ObjectId(examId) }

      // Add search filter if provided
      if (filters?.searchTerm) {
        // First get student IDs matching the search term
        const students = await databaseService.users
          .find({
            $or: [
              { name: { $regex: filters.searchTerm, $options: 'i' } },
              { username: { $regex: filters.searchTerm, $options: 'i' } }
            ]
          })
          .toArray()

        const studentIds = students.map((student) => student._id)

        // Add student IDs to the query
        query.student_id = { $in: studentIds }
      }

      // Add violation type filter if provided
      if (filters?.violationTypes && filters.violationTypes.length > 0) {
        const sessions = await databaseService.examSessions
          .aggregate([
            { $match: query },
            {
              $lookup: {
                from: 'exam_violations',
                localField: '_id',
                foreignField: 'session_id',
                as: 'violations'
              }
            },
            {
              $match: {
                'violations.type': { $in: filters.violationTypes }
              }
            }
          ])
          .toArray()

        return await this.enrichSessionsWithStudentInfo(sessions, exam)
      }

      // Simple query without violation type filter
      const sessions = await databaseService.examSessions
        .find(query)
        .skip((filters?.page || 0) * (filters?.limit || 0))
        .limit(filters?.limit || 0)
        .toArray()

      return await this.enrichSessionsWithStudentInfo(sessions, exam)
    } catch (error) {
      console.error('Error getting class exam results:', error)
      throw error
    }
  }

  // Helper method to enrich sessions with student information
  private async enrichSessionsWithStudentInfo(sessions: any[], exam: any) {
    // Get all student IDs
    const studentIds = sessions.map((session) => session.student_id)

    // Fetch all students in one query
    const students = await databaseService.users
      .find({
        _id: { $in: studentIds }
      })
      .toArray()

    // Create a map for quick lookup
    const studentMap = new Map(students.map((student) => [student._id.toString(), student]))

    // Enrich session data with student info
    const enrichedSessions = sessions.map((session) => {
      const student = studentMap.get(session.student_id.toString())

      return {
        session_id: session._id.toString(),
        student_id: session.student_id.toString(),
        student_name: student?.name || 'Unknown',
        student_username: student?.username || 'Unknown',
        score: session.score,
        violations: session.violations,
        start_time: session.start_time,
        end_time: session.end_time,
        completed: session.completed,
        exam_duration: exam.duration
      }
    })

    return enrichedSessions
  }

  // Get detailed violations for a student in an exam
  async getStudentViolations(examId: string, studentId: string) {
    try {
      // Verify the exam exists
      const exam = await databaseService.exams.findOne({ _id: new ObjectId(examId) })

      if (!exam) {
        throw new Error('Exam not found')
      }

      // Find the student's session for this exam
      const session = await databaseService.examSessions.findOne({
        exam_id: new ObjectId(examId),
        student_id: new ObjectId(studentId)
      })

      if (!session) {
        throw new Error('Student session not found')
      }

      // Get all violations for this session
      const violations = await databaseService.db
        .collection('exam_violations')
        .find({ session_id: new ObjectId(session._id) })
        .sort({ timestamp: -1 })
        .toArray()

      return violations
    } catch (error) {
      console.error('Error getting student violations:', error)
      throw error
    }
  }
  async createMasterExam({
    name,
    description,
    exam_period,
    start_time,
    end_time,
    teacher_id
  }: {
    name: string
    description?: string
    exam_period?: string
    start_time?: Date
    end_time?: Date
    teacher_id: string
  }) {
    const masterExam = new MasterExam({
      name,
      description,
      exam_period,
      start_time,
      end_time,
      teacher_id: new ObjectId(teacher_id)
    })

    await databaseService.masterExams.insertOne(masterExam)
    return masterExam
  }

  async getMasterExams(teacher_id: string) {
    console.log(teacher_id)

    const masterExams = await databaseService.masterExams
      .find({ teacher_id: new ObjectId(teacher_id) })
      .sort({ created_at: -1 })
      .toArray()

    return masterExams
  }

  async getMasterExamById(masterExamId: string) {
    return await databaseService.masterExams.findOne({ _id: new ObjectId(masterExamId) })
  }

  async getExamsByMasterExamId(masterExamId: string) {
    return await databaseService.exams.find({ master_exam_id: new ObjectId(masterExamId) }).toArray()
  }

  async getClassesForMasterExam(masterExamId: string) {
    // First get all exams for this master exam
    const exams = await this.getExamsByMasterExamId(masterExamId)

    if (!exams.length) {
      return []
    }

    const examIds = exams.map((exam) => exam._id)

    // Get all sessions for these exams
    const sessions = await databaseService.examSessions.find({ exam_id: { $in: examIds } }).toArray()

    if (!sessions.length) {
      return []
    }

    // Get unique student IDs
    const studentIds = [...new Set(sessions.map((session) => session.student_id.toString()))]

    // Get all students
    const students = await databaseService.users
      .find({ _id: { $in: studentIds.map((id) => new ObjectId(id)) } })
      .toArray()

    // Extract unique class values (assuming each student has a class field)
    const classes = [...new Set(students.map((student) => student.class).filter(Boolean))]

    return classes.map((className) => ({
      class_name: className,
      student_count: students.filter((student) => student.class === className).length
    }))
  }
  async getClassExamResultsForMasterExam(
    masterExamId: string,
    className: string,
    filters?: {
      searchTerm?: string
      violationTypes?: string[]
      page?: number
      limit?: number
    }
  ) {
    try {
      // First get all exams for this master exam
      const exams = await this.getExamsByMasterExamId(masterExamId)

      if (!exams.length) {
        return []
      }

      const examIds = exams.map((exam) => exam._id)

      // Get all students in the specified class
      const studentsInClass = await databaseService.users.find({ class: className }).toArray()

      if (!studentsInClass.length) {
        return []
      }

      const studentIds = studentsInClass.map((student) => student._id)

      // Khởi tạo pipeline cho aggregation
      const pipeline: any[] = [
        {
          $match: {
            exam_id: { $in: examIds },
            student_id: { $in: studentIds }
          }
        },
        {
          $lookup: {
            from: 'exam_violations',
            localField: '_id',
            foreignField: 'session_id',
            as: 'violations'
          }
        }
      ]

      // Add search filter if provided
      if (filters?.searchTerm) {
        // First get student IDs matching the search term
        const matchingStudents = await databaseService.users
          .find({
            class: className,
            $or: [
              { name: { $regex: filters.searchTerm, $options: 'i' } },
              { username: { $regex: filters.searchTerm, $options: 'i' } }
            ]
          })
          .toArray()

        const matchingStudentIds = matchingStudents.map((student) => student._id)

        // Update matching in pipeline
        pipeline[0].$match.student_id = { $in: matchingStudentIds }
      }

      // Handle violation type filter if provided
      if (filters?.violationTypes && filters?.violationTypes.length > 0) {
        // When filtering students by violation type, use the same filter for counting violations
        pipeline.push(
          {
            $addFields: {
              // Only count violations that match the specified types
              filteredViolations: {
                $filter: {
                  input: '$violations',
                  as: 'violation',
                  cond: { $in: ['$$violation.type', filters.violationTypes] }
                }
              }
            }
          },
          {
            $addFields: {
              // Use the filtered violations count instead of the total violations count
              violations_count: { $size: '$filteredViolations' }
            }
          }
        )

        // Filter out students who have no violations of the specified types
        pipeline.push({
          $match: { violations_count: { $gt: 0 } }
        })

        // Keep the filtered violations but maintain the original structure
        pipeline.push({
          $addFields: {
            violations: '$filteredViolations'
          }
        })
      }

      // Add pagination if needed
      if (filters?.page !== undefined && filters?.limit) {
        pipeline.push({ $skip: filters.page * filters.limit }, { $limit: filters.limit })
      }

      // Execute the aggregation pipeline
      const sessions = await databaseService.examSessions.aggregate(pipeline).toArray()

      // Create a map of examId -> exam for quick lookup
      const examMap = new Map(exams.map((exam) => [exam._id.toString(), exam]))

      return await this.enrichSessionsWithStudentInfo(sessions, examMap)
    } catch (error) {
      console.error('Error getting class exam results for master exam:', error)
      throw error
    }
  }
  async getStudentViolationsForMasterExam(masterExamId: string, studentId: string) {
    try {
      // Get all exams for this master exam
      const exams = await this.getExamsByMasterExamId(masterExamId)

      if (!exams.length) {
        return []
      }

      const examIds = exams.map((exam) => exam._id)

      // Find all sessions for these exams and this student
      const sessions = await databaseService.examSessions
        .find({
          exam_id: { $in: examIds },
          student_id: new ObjectId(studentId)
        })
        .toArray()

      if (!sessions.length) {
        return []
      }

      const sessionIds = sessions.map((session) => session._id)

      // Get all violations for these sessions
      const violations = await databaseService.db
        .collection('exam_violations')
        .find({ session_id: { $in: sessionIds } })
        .sort({ timestamp: -1 })
        .toArray()

      // Format violations to ensure they're properly serialized
      return violations.map((violation) => ({
        _id: violation._id.toString(),
        session_id: violation.session_id.toString(),
        student_id: violation.student_id.toString(),
        type: violation.type,
        severity: violation.severity,
        details: violation.details,
        timestamp: violation.timestamp
      }))
    } catch (error) {
      console.error('Error getting student violations for master exam:', error)
      throw error
    }
  }
}

const examService = new ExamService()
export default examService
