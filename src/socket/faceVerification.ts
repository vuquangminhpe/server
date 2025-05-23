import { Server, Socket } from 'socket.io'
import examSessionService from '../services/examSessions.services'
import databaseService from '../services/database.services'
import { ObjectId } from 'mongodb'
import faceEmbeddingService from '~/services/faceEmbedding.services'

export const setupFaceVerificationEvents = (io: Server, socket: Socket) => {
  socket.on('verify_face_for_exam', async (data) => {
    try {
      const { session_id, face_image_data } = data
      const user_id = socket.data.user_id

      if (!face_image_data) {
        socket.emit('face_verification_error', {
          message: 'Face image data is required'
        })
        return
      }

      // Convert base64 to buffer
      const imageBuffer = Buffer.from(face_image_data.split(',')[1], 'base64')

      // Verify face
      const verificationResult = await faceEmbeddingService.verifyFace(user_id, imageBuffer)

      if (!verificationResult.isMatch) {
        socket.emit('face_verification_failed', {
          session_id,
          message: 'Face verification failed. Please try again.',
          similarity: verificationResult.similarity,
          confidence: verificationResult.confidence,
          required_similarity: 0.6
        })

        // Record failed verification attempt
        await examSessionService.verifyFaceDuringExam(session_id, user_id, imageBuffer)
        return
      }

      // Success - allow exam to continue
      socket.emit('face_verification_success', {
        session_id,
        message: 'Face verification successful',
        similarity: verificationResult.similarity,
        confidence: verificationResult.confidence
      })

      // Log successful verification
      await examSessionService.verifyFaceDuringExam(session_id, user_id, imageBuffer)
    } catch (error) {
      console.error('Error in face verification:', error)
      socket.emit('face_verification_error', {
        message: 'Technical error during face verification'
      })
    }
  })

  // Periodic face verification during exam
  socket.on('periodic_face_check', async (data) => {
    try {
      const { session_id, face_image_data } = data
      const user_id = socket.data.user_id

      if (!face_image_data) {
        return // Skip if no image provided
      }

      // Convert base64 to buffer
      const imageBuffer = Buffer.from(face_image_data.split(',')[1], 'base64')

      // Verify face during exam
      const verificationResult = await examSessionService.verifyFaceDuringExam(session_id, user_id, imageBuffer)

      // Handle different verification results
      if (verificationResult.action_required) {
        switch (verificationResult.action_required) {
          case 'TERMINATE_EXAM':
            // Critical violation - end exam immediately
            await examSessionService.recordCriticalViolation(session_id)

            socket.emit('exam_terminated', {
              session_id,
              reason: 'Face verification failed - different person detected',
              similarity: verificationResult.similarity
            })

            // Find exam to notify teachers
            const session = await databaseService.examSessions.findOne({ _id: new ObjectId(session_id) })
            if (session) {
              const examId = session.exam_id.toString()
              const student = await databaseService.users.findOne({ _id: new ObjectId(user_id) })

              io.to(`monitor_${examId}`).emit('student_face_violation', {
                session_id,
                student_id: user_id,
                student_name: student?.name || 'Unknown',
                student_username: student?.username || 'Unknown',
                violation_type: 'CRITICAL_FACE_MISMATCH',
                similarity: verificationResult.similarity,
                action_taken: 'EXAM_TERMINATED',
                timestamp: new Date()
              })
            }
            break

          case 'RECORD_VIOLATION':
            // Record as violation but don't terminate
            await examSessionService.recordViolation(session_id)

            socket.emit('face_verification_warning', {
              session_id,
              message: 'Face verification warning - please ensure your face is clearly visible',
              similarity: verificationResult.similarity,
              confidence: verificationResult.confidence
            })
            break

          case 'WARNING':
            // Just warn the student
            socket.emit('face_verification_warning', {
              session_id,
              message: 'Please ensure your face is clearly visible to the camera',
              similarity: verificationResult.similarity,
              confidence: verificationResult.confidence
            })
            break

          case 'TECHNICAL_ERROR':
            // Technical error - don't penalize but notify
            socket.emit('face_verification_error', {
              session_id,
              message: 'Technical error during face verification - please ensure good lighting'
            })
            break
        }
      } else {
        // Verification successful - continue exam
        socket.emit('face_verification_ok', {
          session_id,
          similarity: verificationResult.similarity,
          confidence: verificationResult.confidence
        })
      }
    } catch (error) {
      console.error('Error in periodic face check:', error)
      // Don't interrupt exam for technical errors
    }
  })

  // Request face verification status
  socket.on('get_face_verification_status', async (data) => {
    try {
      const { session_id } = data
      const user_id = socket.data.user_id

      // Get face verification history for this session
      const verificationHistory = await examSessionService.getFaceVerificationHistory(session_id)

      // Get latest verification
      const latestVerification = verificationHistory[0]

      socket.emit('face_verification_status', {
        session_id,
        has_face_profile: latestVerification ? true : false,
        latest_verification: latestVerification
          ? {
              verified: latestVerification.verified,
              similarity: latestVerification.similarity,
              confidence: latestVerification.confidence,
              timestamp: latestVerification.timestamp
            }
          : null,
        verification_count: verificationHistory.length
      })
    } catch (error) {
      console.error('Error getting face verification status:', error)
      socket.emit('face_verification_error', {
        message: 'Failed to get face verification status'
      })
    }
  })

  // Upload face profile (for students who don't have one)
  socket.on('upload_face_profile', async (data) => {
    try {
      const { face_image_data } = data
      const user_id = socket.data.user_id

      if (!face_image_data) {
        socket.emit('face_profile_upload_error', {
          message: 'Face image data is required'
        })
        return
      }

      // Convert base64 to buffer
      const imageBuffer = Buffer.from(face_image_data.split(',')[1], 'base64')

      // Store face embedding
      const success = await faceEmbeddingService.storeFaceEmbedding(user_id, imageBuffer)

      if (!success) {
        socket.emit('face_profile_upload_error', {
          message: 'Failed to process face image. Please ensure your face is clearly visible.'
        })
        return
      }

      socket.emit('face_profile_upload_success', {
        message: 'Face profile uploaded successfully'
      })
    } catch (error) {
      console.error('Error uploading face profile:', error)
      socket.emit('face_profile_upload_error', {
        message: 'Technical error during face profile upload'
      })
    }
  })

  // Teacher requests face verification report for exam
  socket.on('get_exam_face_report', async (data) => {
    try {
      const { exam_id } = data
      const teacher_id = socket.data.user_id

      // Verify teacher owns this exam
      const exam = await databaseService.exams.findOne({ _id: new ObjectId(exam_id) })

      if (!exam || exam.teacher_id.toString() !== teacher_id) {
        socket.emit('error', { message: 'Not authorized to view this exam' })
        return
      }

      // Get all sessions for this exam
      const sessions = await databaseService.examSessions.find({ exam_id: new ObjectId(exam_id) }).toArray()

      const faceReport = []

      for (const session of sessions) {
        const student = await databaseService.users.findOne({ _id: session.student_id })
        const verificationHistory = await examSessionService.getFaceVerificationHistory(session._id!.toString())

        // Calculate verification stats
        const totalVerifications = verificationHistory.length
        const successfulVerifications = verificationHistory.filter((v) => v.verified).length
        const failedVerifications = totalVerifications - successfulVerifications

        // Get latest verification
        const latestVerification = verificationHistory[0]

        faceReport.push({
          session_id: session._id!.toString(),
          student_id: session.student_id.toString(),
          student_name: student?.name || 'Unknown',
          student_username: student?.username || 'Unknown',
          exam_completed: session.completed,
          total_verifications: totalVerifications,
          successful_verifications: successfulVerifications,
          failed_verifications: failedVerifications,
          latest_verification: latestVerification
            ? {
                verified: latestVerification.verified,
                similarity: latestVerification.similarity,
                confidence: latestVerification.confidence,
                timestamp: latestVerification.timestamp
              }
            : null,
          verification_success_rate:
            totalVerifications > 0 ? ((successfulVerifications / totalVerifications) * 100).toFixed(1) + '%' : 'N/A'
        })
      }

      socket.emit('exam_face_report', {
        exam_id,
        exam_title: exam.title,
        total_sessions: sessions.length,
        face_report: faceReport
      })
    } catch (error) {
      console.error('Error getting exam face report:', error)
      socket.emit('error', { message: 'Failed to get face verification report' })
    }
  })
}
