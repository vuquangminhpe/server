import { ObjectId } from 'mongodb'
import databaseService from './database.services'
import ExamSession from '../models/schemas/ExamSession.schema'
import examService from './exams.services'
import { ErrorWithStatus } from '~/models/Errors'
import HTTP_STATUS from '../constants/httpStatus'

class ExamSessionService {
 
  async startExamSession({ exam_code, student_id }: { exam_code: string; student_id: string }) {
    // Get exam by code
    const exam = await databaseService.exams.findOne({ exam_code })
    if (!exam) {
      throw new Error('Không tìm thấy bài kiểm tra với mã code này')
    }
    
    // Kiểm tra nếu học sinh đã có phiên thi chưa hoàn thành (đang làm dở)
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
        remaining_time: existingSession && existingSession.start_time ? 
          this.calculateRemainingTime(existingSession.start_time, exam.duration) : 
          exam.duration * 60
      }
    }
    
    // Kiểm tra nếu học sinh đã hoàn thành bài thi này
    const exams_session_student = await databaseService.examSessions.findOne({
      exam_id: exam._id,
      student_id: new ObjectId(student_id),
      completed: true
    })
    
    const master_exam = await databaseService.masterExams.findOne({
      _id: exam.master_exam_id
    })
    
    // Kiểm tra các điều kiện để bắt đầu làm bài
    if (!exam.active) {
      throw new Error('Bài kiểm tra này hiện đã bị vô hiệu hóa')
    }
    else if (exams_session_student) {
      throw new ErrorWithStatus({
        message: `Bạn đã làm bài kiểm tra trong ${exam.title.split('#')[0]}. Nếu có sai sót hãy liên hệ với giáo viên`,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }
    else if (exam.start_time && new Date() < exam.start_time) {
      const startTimeStr = master_exam && master_exam.start_time ? 
        new Date(master_exam.start_time).toLocaleString() : 'giờ đã đặt';
      throw new Error(`Chưa đến giờ thi, vui lòng chờ đến giờ thi ${startTimeStr} để bắt đầu kỳ thi, hoặc liên hệ giáo viên nếu có vấn đề!!!`)
    }
    
    const numActiveStudents = exam.number_active_students !== undefined ? 
      Number(exam.number_active_students) : 0;
      
    if (numActiveStudents >= 1) {
      throw new Error(`Bài kiểm tra này hiện đã có người khác đang làm hoặc đã hoàn thành trong ${exam.title.split('#')[0]}, vui lòng liên hệ giáo viên để lấy 1 mã code mới`)
    }
    
    if (numActiveStudents === 0 && (!exam.start_time || new Date() > exam.start_time)) {
      await databaseService.exams.updateOne(
        { _id: exam._id },
        { $set: { number_active_students: 1 } }
      )
    }

    // Create new session
    const session = new ExamSession({
      exam_id: exam._id,
      student_id: new ObjectId(student_id),
      start_time: new Date()
    })

    await databaseService.examSessions.insertOne(session)

    const examWithQuestions = await examService.getExamWithQuestions(exam._id.toString())

    return {
      session,
      exam: examWithQuestions,
      remaining_time: exam.duration * 60
    }
  }

  private calculateRemainingTime(start_time: Date, duration: number): number {
    if (!start_time) {
      return duration * 60;
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

    // If there are existing violations, check if score should be affected
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

  // Standard violation (like tab switching)
  async recordViolation(session_id: string) {
    const session = await databaseService.examSessions.findOne({
      _id: new ObjectId(session_id)
    })

    if (!session) {
      throw new Error('Exam session not found')
    }

    // For the first violation, apply a warning
    // For subsequent violations, reduce score progressively
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

  // Critical violation (like screen capture) - immediately end the exam
  async recordCriticalViolation(session_id: string) {
    const result = await databaseService.examSessions.findOneAndUpdate(
      { _id: new ObjectId(session_id) },
      {
        $inc: { violations: 5 }, // Count as 5 violations to indicate severity
        $set: {
          score: 0, // Set score to 0
          completed: true, // End the exam
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

        return {
          ...session,
          exam_title: exam ? exam.title : 'Unknown Exam',
          duration: exam ? exam.duration : 0
        }
      })
    )

    return sessionsWithExams
  }
}
const examSessionService = new ExamSessionService()
export default examSessionService
