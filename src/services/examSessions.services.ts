// src/services/examSessions.services.ts (Updated)
import { ObjectId } from 'mongodb'
import databaseService from './database.services'
import ExamSession from '../models/schemas/ExamSession.schema'
import examService from './exams.services'
import { ErrorWithStatus } from '~/models/Errors'
import HTTP_STATUS from '../constants/httpStatus'
import faceEmbeddingService from './faceEmbedding.services'

interface FaceVerificationLog {
  session_id: ObjectId
  student_id: ObjectId
  verified: boolean
  similarity: number
  confidence: 'high' | 'medium' | 'low'
  timestamp: Date
  image_hash?: string
}

interface StartExamOptions {
  exam_code: string
  student_id: string
  face_image_buffer?: Buffer
  require_face_verification?: boolean
  has_camera?: boolean
  device_info?: {
    user_agent: string
    screen_resolution?: string
    device_type?: 'desktop' | 'mobile' | 'tablet'
  }
}

class ExamSessionService {
  /**
   * Enhanced start exam session with camera detection
   */
  async startExamSession({
    exam_code,
    student_id,
    face_image_buffer,
    require_face_verification = true,
    has_camera = false,
    device_info
  }: StartExamOptions) {
    // Get exam by code
    const exam = await databaseService.exams.findOne({ exam_code })
    if (!exam) {
      throw new Error('Không tìm thấy bài kiểm tra với mã code này')
    }

    // Log device information
    await this.logDeviceInfo(student_id, device_info)

    // Check for existing incomplete session
    const existingSession = await databaseService.examSessions.findOne({
      exam_id: exam._id,
      student_id: new ObjectId(student_id),
      completed: false
    })

    if (existingSession) {
      const examWithQuestions = await examService.getExamWithQuestions(exam._id.toString())

      return {
        session: existingSession,
        exam: examWithQuestions,
        remaining_time: existingSession?.start_time
          ? this.calculateRemainingTime(existingSession.start_time, exam.duration)
          : exam.duration * 60,
        face_verified: has_camera ? await this.checkExistingFaceVerification(existingSession._id!.toString()) : null,
        camera_required: false, // Existing session doesn't require camera check
        has_camera
      }
    }

    // Check if student already completed this exam
    const completed_session = await databaseService.examSessions.findOne({
      exam_id: exam._id,
      student_id: new ObjectId(student_id),
      completed: true
    })

    const master_exam = await databaseService.masterExams.findOne({
      _id: exam.master_exam_id
    })

    // Validation checks
    if (!exam.active) {
      throw new Error('Bài kiểm tra này hiện đã bị vô hiệu hóa')
    }

    if (completed_session) {
      throw new ErrorWithStatus({
        message: `Bạn đã làm bài kiểm tra trong ${exam.title.split('#')[0]}. Nếu có sai sót hãy liên hệ với giáo viên`,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (exam.start_time && new Date() < exam.start_time) {
      const startTimeStr = master_exam?.start_time ? new Date(master_exam.start_time).toLocaleString() : 'giờ đã đặt'
      throw new Error(
        `Chưa đến giờ thi, vui lòng chờ đến giờ thi ${startTimeStr} để bắt đầu kỳ thi, hoặc liên hệ giáo viên nếu có vấn đề!!!`
      )
    }

    const numActiveStudents = exam.number_active_students !== undefined ? Number(exam.number_active_students) : 0

    if (numActiveStudents >= 1) {
      throw new Error(
        `Bài kiểm tra này hiện đã có người khác đang làm hoặc đã hoàn thành trong ${exam.title.split('#')[0]}, vui lòng liên hệ giáo viên để lấy 1 mã code mới`
      )
    }

    // Enhanced face verification logic
    let faceVerificationResult = null
    const shouldRequireFaceVerification = require_face_verification && has_camera

    if (shouldRequireFaceVerification) {
      if (!face_image_buffer) {
        throw new ErrorWithStatus({
          message: 'Cần ảnh khuôn mặt để xác thực danh tính trước khi bắt đầu bài thi',
          status: HTTP_STATUS.BAD_REQUEST
        })
      }

      try {
        faceVerificationResult = await faceEmbeddingService.verifyFace(student_id, face_image_buffer)

        if (!faceVerificationResult.isMatch) {
          throw new ErrorWithStatus({
            message: `Xác thực khuôn mặt không thành công. Độ tương đồng: ${(faceVerificationResult.similarity * 100).toFixed(1)}%. Vui lòng đảm bảo khuôn mặt rõ ràng và thử lại.`,
            status: HTTP_STATUS.FORBIDDEN
          })
        }
      } catch (error) {
        if (error instanceof ErrorWithStatus) {
          throw error
        }

        // Handle case where user has no stored face embedding
        if (error instanceof Error && error.message.includes('No stored face embedding')) {
          throw new ErrorWithStatus({
            message:
              'Chưa có dữ liệu khuôn mặt. Vui lòng cập nhật ảnh đại diện trong hồ sơ cá nhân trước khi làm bài thi.',
            status: HTTP_STATUS.BAD_REQUEST
          })
        }

        throw new ErrorWithStatus({
          message: 'Lỗi kỹ thuật trong quá trình xác thực khuôn mặt. Vui lòng thử lại.',
          status: HTTP_STATUS.INTERNAL_SERVER_ERROR
        })
      }
    }

    // Update exam active student count
    if (numActiveStudents === 0 && (!exam.start_time || new Date() > exam.start_time)) {
      await databaseService.exams.updateOne({ _id: exam._id }, { $set: { number_active_students: 1 } })
    }

    // Create new session
    const session = new ExamSession({
      exam_id: exam._id,
      student_id: new ObjectId(student_id),
      start_time: new Date()
    })

    await databaseService.examSessions.insertOne(session)

    // Log successful face verification if it was performed
    if (shouldRequireFaceVerification && faceVerificationResult && face_image_buffer) {
      await this.logFaceVerification({
        session_id: session._id!,
        student_id: new ObjectId(student_id),
        verified: true,
        similarity: faceVerificationResult.similarity,
        confidence: faceVerificationResult.confidence,
        timestamp: new Date()
      })
    }

    // Log session start with device info
    await this.logSessionStart(session._id!.toString(), {
      has_camera,
      face_verification_required: shouldRequireFaceVerification,
      face_verification_success: faceVerificationResult?.isMatch || false,
      device_info
    })

    const examWithQuestions = await examService.getExamWithQuestions(exam._id.toString())

    return {
      session,
      exam: examWithQuestions,
      remaining_time: exam.duration * 60,
      face_verified: shouldRequireFaceVerification ? faceVerificationResult?.isMatch : null,
      camera_required: shouldRequireFaceVerification,
      has_camera,
      face_verification_similarity: faceVerificationResult?.similarity || null
    }
  }

  /**
   * Log device information
   */
  private async logDeviceInfo(
    studentId: string,
    deviceInfo?: {
      user_agent: string
      screen_resolution?: string
      device_type?: 'desktop' | 'mobile' | 'tablet'
    }
  ): Promise<void> {
    if (!deviceInfo) return

    try {
      await databaseService.db.collection('device_logs').insertOne({
        student_id: new ObjectId(studentId),
        user_agent: deviceInfo.user_agent,
        screen_resolution: deviceInfo.screen_resolution,
        device_type: deviceInfo.device_type,
        timestamp: new Date()
      })
    } catch (error) {
      console.error('Error logging device info:', error)
    }
  }

  /**
   * Log session start with additional info
   */
  private async logSessionStart(
    sessionId: string,
    sessionInfo: {
      has_camera: boolean
      face_verification_required: boolean
      face_verification_success: boolean
      device_info?: any
    }
  ): Promise<void> {
    try {
      await databaseService.db.collection('session_logs').insertOne({
        session_id: new ObjectId(sessionId),
        ...sessionInfo,
        timestamp: new Date()
      })
    } catch (error) {
      console.error('Error logging session start:', error)
    }
  }

  /**
   * Check if existing session has face verification
   */
  private async checkExistingFaceVerification(sessionId: string): Promise<boolean> {
    try {
      const verification = await databaseService.db
        .collection('face_verifications')
        .findOne({ session_id: new ObjectId(sessionId) }, { sort: { timestamp: -1 } })

      return verification?.verified || false
    } catch (error) {
      console.error('Error checking existing face verification:', error)
      return false
    }
  }

  /**
   * Original face verification logging method
   */
  private async logFaceVerification(verificationLog: FaceVerificationLog): Promise<void> {
    try {
      await databaseService.db.collection('face_verifications').insertOne(verificationLog)
    } catch (error) {
      console.error('Error logging face verification:', error)
    }
  }

  /**
   * Get face verification history for a session
   */
  async getFaceVerificationHistory(sessionId: string): Promise<FaceVerificationLog[]> {
    try {
      const verifications = await databaseService.db
        .collection('face_verifications')
        .find({ session_id: new ObjectId(sessionId) })
        .sort({ timestamp: -1 })
        .toArray()

      return verifications as any as FaceVerificationLog[]
    } catch (error) {
      console.error('Error getting face verification history:', error)
      return []
    }
  }

  /**
   * Verify face during exam (periodic check) - enhanced
   */
  async verifyFaceDuringExam(
    sessionId: string,
    studentId: string,
    faceImageBuffer: Buffer,
    hasCamera: boolean = true
  ): Promise<{
    verified: boolean
    similarity: number
    confidence: 'high' | 'medium' | 'low'
    action_required?: string
  }> {
    try {
      // If no camera, skip verification
      if (!hasCamera) {
        return {
          verified: true,
          similarity: 1.0,
          confidence: 'high',
          action_required: undefined
        }
      }

      const verificationResult = await faceEmbeddingService.verifyFace(studentId, faceImageBuffer)

      // Log verification
      await this.logFaceVerification({
        session_id: new ObjectId(sessionId),
        student_id: new ObjectId(studentId),
        verified: verificationResult.isMatch,
        similarity: verificationResult.similarity,
        confidence: verificationResult.confidence,
        timestamp: new Date()
      })

      // Determine action based on verification result
      let action_required: string | undefined

      if (!verificationResult.isMatch) {
        if (verificationResult.similarity < 0.3) {
          action_required = 'TERMINATE_EXAM' // Very low similarity - different person
        } else if (verificationResult.similarity < 0.5) {
          action_required = 'RECORD_VIOLATION' // Low similarity - suspicious
        } else {
          action_required = 'WARNING' // Medium similarity - warn student
        }
      }

      return {
        verified: verificationResult.isMatch,
        similarity: verificationResult.similarity,
        confidence: verificationResult.confidence,
        action_required
      }
    } catch (error) {
      console.error('Error verifying face during exam:', error)
      return {
        verified: hasCamera ? false : true, // If no camera, don't fail verification
        similarity: 0,
        confidence: 'low',
        action_required: hasCamera ? 'TECHNICAL_ERROR' : undefined
      }
    }
  }

  /**
   * Calculate remaining time helper method
   */
  private calculateRemainingTime(start_time: Date, duration: number): number {
    if (!start_time) {
      return duration * 60
    }
    const elapsed = Math.floor((Date.now() - start_time.getTime()) / 1000)
    const remaining = duration * 60 - elapsed
    return Math.max(0, remaining)
  }

  /**
   * Submit exam session (unchanged)
   */
  async submitExamSession({
    session_id,
    answers
  }: {
    session_id: string
    answers: { question_id: string; selected_index: number }[]
  }) {
    // Get the session
    const session = await databaseService.examSessions.findOne({
      _id: new ObjectId(session_id)
    })

    if (!session) {
      throw new Error('Exam session not found')
    }

    if (session.completed) {
      throw new Error('Exam already completed')
    }

    // Get the exam
    const exam = await databaseService.exams.findOne({
      _id: session.exam_id
    })

    if (!exam) {
      throw new Error('Exam not found')
    }

    // Get all questions
    const questions = await databaseService.questions.find({ _id: { $in: exam.question_ids } }).toArray()

    // Calculate score
    let correctAnswers = 0

    const formattedAnswers = answers.map((answer) => ({
      question_id: new ObjectId(answer.question_id),
      selected_index: answer.selected_index
    }))

    for (const answer of formattedAnswers) {
      const question = questions.find((q) => q._id.toString() === answer.question_id.toString())

      if (question && question.correct_index === answer.selected_index) {
        correctAnswers++
      }
    }

    // Calculate score with violation penalties
    let score = (correctAnswers / questions.length) * 100

    // Reduce score based on violation count
    if (session.violations > 0) {
      const penaltyPerViolation = 25 // 25% penalty per violation
      const penaltyPercentage = Math.min(100, session.violations * penaltyPerViolation)
      score = Math.max(0, score * (1 - penaltyPercentage / 100))
    }

    // Update session
    const result = await databaseService.examSessions.findOneAndUpdate(
      { _id: new ObjectId(session_id) },
      {
        $set: {
          answers: formattedAnswers,
          score,
          end_time: new Date(),
          completed: true,
          updated_at: new Date()
        }
      },
      { returnDocument: 'after' }
    )

    return result
  }

  /**
   * Record violation (unchanged)
   */
  async recordViolation(session_id: string) {
    const session = await databaseService.examSessions.findOne({
      _id: new ObjectId(session_id)
    })

    if (!session) {
      throw new Error('Exam session not found')
    }

    const penaltyScore = session.violations === 0 ? session.score : Math.max(0, session.score - 25)

    const result = await databaseService.examSessions.findOneAndUpdate(
      { _id: new ObjectId(session_id) },
      {
        $inc: { violations: 1 },
        $set: {
          score: penaltyScore,
          updated_at: new Date()
        }
      },
      { returnDocument: 'after' }
    )

    return result
  }

  /**
   * Record critical violation (unchanged)
   */
  async recordCriticalViolation(session_id: string) {
    const result = await databaseService.examSessions.findOneAndUpdate(
      { _id: new ObjectId(session_id) },
      {
        $inc: { violations: 5 },
        $set: {
          score: 0,
          completed: true,
          end_time: new Date(),
          updated_at: new Date()
        }
      },
      { returnDocument: 'after' }
    )

    return result
  }

  /**
   * Get student exam history (enhanced)
   */
  async getStudentExamHistory(student_id: string) {
    const sessions = await databaseService.examSessions
      .find({ student_id: new ObjectId(student_id) })
      .sort({ start_time: -1 })
      .toArray()

    // Get exam details for each session
    const sessionsWithExams = await Promise.all(
      sessions.map(async (session) => {
        const exam = await databaseService.exams.findOne({
          _id: session.exam_id
        })

        // Get face verification status
        const faceVerifications = await this.getFaceVerificationHistory(session._id!.toString())
        const latestVerification = faceVerifications[0]

        // Get session log for device info
        const sessionLog = await databaseService.db.collection('session_logs').findOne({ session_id: session._id })

        return {
          ...session,
          exam_title: exam ? exam.title : 'Unknown Exam',
          duration: exam ? exam.duration : 0,
          face_verified: latestVerification?.verified || false,
          face_verification_confidence: latestVerification?.confidence || 'unknown',
          had_camera: sessionLog?.has_camera || false,
          device_type: sessionLog?.device_info?.device_type || 'unknown'
        }
      })
    )

    return sessionsWithExams
  }

  /**
   * Get session statistics for teacher/admin
   */
  async getSessionStatistics(examId: string) {
    try {
      const sessions = await databaseService.examSessions.find({ exam_id: new ObjectId(examId) }).toArray()

      const sessionLogs = await databaseService.db
        .collection('session_logs')
        .find({ session_id: { $in: sessions.map((s) => s._id) } })
        .toArray()

      const deviceStats = {
        total_sessions: sessions.length,
        with_camera: sessionLogs.filter((log) => log.has_camera).length,
        without_camera: sessionLogs.filter((log) => !log.has_camera).length,
        device_types: {
          desktop: sessionLogs.filter((log) => log.device_info?.device_type === 'desktop').length,
          mobile: sessionLogs.filter((log) => log.device_info?.device_type === 'mobile').length,
          tablet: sessionLogs.filter((log) => log.device_info?.device_type === 'tablet').length,
          unknown: sessionLogs.filter((log) => !log.device_info?.device_type).length
        },
        face_verification_required: sessionLogs.filter((log) => log.face_verification_required).length,
        face_verification_success: sessionLogs.filter((log) => log.face_verification_success).length
      }

      return deviceStats
    } catch (error) {
      console.error('Error getting session statistics:', error)
      return null
    }
  }
}

const examSessionService = new ExamSessionService()
export default examSessionService
