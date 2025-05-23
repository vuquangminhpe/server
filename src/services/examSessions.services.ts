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
  image_hash?: string // Optional hash of the verification image
}
class ExamSessionService {
  async startExamSession({
    exam_code,
    student_id,
    face_image_buffer,
    require_face_verification = true
  }: {
    exam_code: string
    student_id: string
    face_image_buffer?: Buffer
    require_face_verification?: boolean
  }) {
    // Get exam by code
    const exam = await databaseService.exams.findOne({ exam_code })
    if (!exam) {
      throw new Error('Không tìm thấy bài kiểm tra với mã code này')
    }

    // Face verification check (if required and image provided)
    if (require_face_verification && face_image_buffer) {
      const faceVerification = await faceEmbeddingService.verifyFace(student_id, face_image_buffer)

      if (!faceVerification.isMatch) {
        // Log failed verification
        await this.logFaceVerification({
          session_id: new ObjectId(), // Temporary ID for logging
          student_id: new ObjectId(student_id),
          verified: false,
          similarity: faceVerification.similarity,
          confidence: faceVerification.confidence,
          timestamp: new Date()
        })

        throw new ErrorWithStatus({
          message: `Xác thực khuôn mặt không thành công. Độ tương đồng: ${(faceVerification.similarity * 100).toFixed(1)}%. Vui lòng thử lại hoặc liên hệ giáo viên.`,
          status: HTTP_STATUS.FORBIDDEN
        })
      }
    } else if (require_face_verification && !face_image_buffer) {
      throw new ErrorWithStatus({
        message: 'Cần xác thực khuôn mặt để bắt đầu bài thi',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

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
        remaining_time:
          existingSession && existingSession.start_time
            ? this.calculateRemainingTime(existingSession.start_time, exam.duration)
            : exam.duration * 60,
        face_verified: true // Already verified above
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
    } else if (completed_session) {
      throw new ErrorWithStatus({
        message: `Bạn đã làm bài kiểm tra trong ${exam.title.split('#')[0]}. Nếu có sai sót hãy liên hệ với giáo viên`,
        status: HTTP_STATUS.BAD_REQUEST
      })
    } else if (exam.start_time && new Date() < exam.start_time) {
      const startTimeStr =
        master_exam && master_exam.start_time ? new Date(master_exam.start_time).toLocaleString() : 'giờ đã đặt'
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
    if (require_face_verification && face_image_buffer) {
      const verificationResult = await faceEmbeddingService.verifyFace(student_id, face_image_buffer)

      await this.logFaceVerification({
        session_id: session._id!,
        student_id: new ObjectId(student_id),
        verified: true,
        similarity: verificationResult.similarity,
        confidence: verificationResult.confidence,
        timestamp: new Date()
      })
    }

    const examWithQuestions = await examService.getExamWithQuestions(exam._id.toString())

    return {
      session,
      exam: examWithQuestions,
      remaining_time: exam.duration * 60,
      face_verified: require_face_verification
    }
  }
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
   * Verify face during exam (periodic check)
   */
  async verifyFaceDuringExam(
    sessionId: string,
    studentId: string,
    faceImageBuffer: Buffer
  ): Promise<{
    verified: boolean
    similarity: number
    confidence: 'high' | 'medium' | 'low'
    action_required?: string
  }> {
    try {
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
        verified: false,
        similarity: 0,
        confidence: 'low',
        action_required: 'TECHNICAL_ERROR'
      }
    }
  }
  private calculateRemainingTime(start_time: Date, duration: number): number {
    if (!start_time) {
      return duration * 60
    }
    const elapsed = Math.floor((Date.now() - start_time.getTime()) / 1000)
    const remaining = duration * 60 - elapsed
    return Math.max(0, remaining)
  }

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

  // Standard violation recording
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

  // Critical violation - end exam immediately
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

        return {
          ...session,
          exam_title: exam ? exam.title : 'Unknown Exam',
          duration: exam ? exam.duration : 0,
          face_verified: latestVerification?.verified || false,
          face_verification_confidence: latestVerification?.confidence || 'unknown'
        }
      })
    )

    return sessionsWithExams
  }
}

const examSessionService = new ExamSessionService()
export default examSessionService
