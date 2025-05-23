import { Server, Socket } from 'socket.io'
import examSessionService from '../services/examSessions.services'
import databaseService from '../services/database.services'
import { ObjectId } from 'mongodb'
import faceEmbeddingService from '~/services/faceEmbedding.services'
import { parseUserAgent, assessCameraCapability } from '../utils/device'

export const setupFaceVerificationEvents = (io: Server, socket: Socket) => {
  // Enhanced face verification for exam start with camera detection
  socket.on('verify_face_for_exam_start', async (data) => {
    try {
      const { session_id, face_image_data, device_info, has_camera = false } = data
      const user_id = socket.data.user_id

      if (!session_id) {
        socket.emit('face_verification_error', {
          message: 'Session ID is required'
        })
        return
      }

      // If no camera, skip face verification
      if (!has_camera) {
        socket.emit('face_verification_success', {
          session_id,
          message: 'Face verification skipped - no camera detected',
          verified: true,
          similarity: 1.0,
          confidence: 'high',
          has_camera: false
        })
        return
      }

      if (!face_image_data) {
        socket.emit('face_verification_error', {
          message: 'Face image data is required when camera is available'
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
          message: `Face verification failed. Similarity: ${(verificationResult.similarity * 100).toFixed(1)}%. Please ensure good lighting and clear face view.`,
          similarity: verificationResult.similarity,
          confidence: verificationResult.confidence,
          required_similarity: 0.72,
          has_camera: true
        })

        // Record failed verification attempt
        await examSessionService.verifyFaceDuringExam(session_id, user_id, imageBuffer, has_camera)
        return
      }

      // Success - allow exam to continue
      socket.emit('face_verification_success', {
        session_id,
        message: 'Face verification successful',
        similarity: verificationResult.similarity,
        confidence: verificationResult.confidence,
        has_camera: true,
        verified: true
      })

      // Log successful verification
      await examSessionService.verifyFaceDuringExam(session_id, user_id, imageBuffer, has_camera)
    } catch (error) {
      console.error('Error in face verification for exam start:', error)

      if (error instanceof Error && error.message.includes('No stored face embedding')) {
        socket.emit('face_verification_error', {
          message: 'No face profile found. Please upload your face image in your profile first.',
          error_type: 'NO_FACE_PROFILE'
        })
      } else {
        socket.emit('face_verification_error', {
          message: 'Technical error during face verification',
          error_type: 'TECHNICAL_ERROR'
        })
      }
    }
  })

  // Enhanced periodic face verification with camera awareness
  socket.on('periodic_face_check', async (data) => {
    try {
      const { session_id, face_image_data, has_camera = false, device_info } = data
      const user_id = socket.data.user_id

      // If no camera, skip verification but log the attempt
      if (!has_camera) {
        socket.emit('face_verification_ok', {
          session_id,
          message: 'Verification skipped - no camera',
          similarity: 1.0,
          confidence: 'high',
          has_camera: false
        })
        return
      }

      if (!face_image_data) {
        // Just skip this check if no image provided and camera is available
        return
      }

      // Convert base64 to buffer
      const imageBuffer = Buffer.from(face_image_data.split(',')[1], 'base64')

      // Verify face during exam with camera awareness
      const verificationResult = await examSessionService.verifyFaceDuringExam(
        session_id,
        user_id,
        imageBuffer,
        has_camera
      )

      // Handle different verification results
      if (verificationResult.action_required) {
        switch (verificationResult.action_required) {
          case 'TERMINATE_EXAM':
            // Critical violation - end exam immediately
            await examSessionService.recordCriticalViolation(session_id)

            socket.emit('exam_terminated', {
              session_id,
              reason: 'Face verification failed - different person detected',
              similarity: verificationResult.similarity,
              has_camera: true
            })

            // Notify teachers
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
                timestamp: new Date(),
                has_camera: true
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
              confidence: verificationResult.confidence,
              has_camera: true
            })
            break

          case 'WARNING':
            // Just warn the student
            socket.emit('face_verification_warning', {
              session_id,
              message: 'Please ensure your face is clearly visible to the camera',
              similarity: verificationResult.similarity,
              confidence: verificationResult.confidence,
              has_camera: true
            })
            break

          case 'TECHNICAL_ERROR':
            // Technical error - don't penalize but notify
            socket.emit('face_verification_error', {
              session_id,
              message: 'Technical error during face verification - please ensure good lighting',
              has_camera: true
            })
            break
        }
      } else {
        // Verification successful - continue exam
        socket.emit('face_verification_ok', {
          session_id,
          similarity: verificationResult.similarity,
          confidence: verificationResult.confidence,
          has_camera: true
        })
      }
    } catch (error) {
      console.error('Error in periodic face check:', error)
      // Don't interrupt exam for technical errors
    }
  })

  // Device capability assessment
  socket.on('assess_device_capability', async (data) => {
    try {
      const { user_agent, screen_resolution, device_type, timezone, language } = data
      const user_id = socket.data.user_id

      // Parse user agent and assess camera capability
      const deviceInfo = parseUserAgent(user_agent)
      const cameraAssessment = assessCameraCapability({
        user_agent,
        screen_resolution,
        device_type
      })

      // Log device info
      await databaseService.db.collection('device_assessments').insertOne({
        user_id: new ObjectId(user_id),
        device_info: deviceInfo,
        camera_assessment: cameraAssessment,
        raw_data: {
          user_agent,
          screen_resolution,
          device_type,
          timezone,
          language
        },
        timestamp: new Date()
      })

      socket.emit('device_capability_result', {
        device_info: deviceInfo,
        camera_assessment: cameraAssessment,
        recommendations: {
          should_require_face_verification: cameraAssessment.likely_has_camera,
          fallback_options: !cameraAssessment.likely_has_camera
            ? ['Contact teacher for assistance', 'Use a device with camera', 'Join supervised exam session']
            : []
        }
      })
    } catch (error) {
      console.error('Error assessing device capability:', error)
      socket.emit('device_capability_error', {
        message: 'Failed to assess device capability'
      })
    }
  })

  // Enhanced face verification status with device info
  socket.on('get_face_verification_status', async (data) => {
    try {
      const { session_id } = data
      const user_id = socket.data.user_id

      // Get face verification history for this session
      const verificationHistory = await examSessionService.getFaceVerificationHistory(session_id)

      // Get latest verification
      const latestVerification = verificationHistory[0]

      // Get session device info
      const sessionLog = await databaseService.db
        .collection('session_logs')
        .findOne({ session_id: new ObjectId(session_id) })

      socket.emit('face_verification_status', {
        session_id,
        has_face_profile: latestVerification ? true : false,
        device_has_camera: sessionLog?.has_camera || false,
        face_verification_required: sessionLog?.face_verification_required || false,
        latest_verification: latestVerification
          ? {
              verified: latestVerification.verified,
              similarity: latestVerification.similarity,
              confidence: latestVerification.confidence,
              timestamp: latestVerification.timestamp
            }
          : null,
        verification_count: verificationHistory.length,
        device_info: sessionLog?.device_info || null
      })
    } catch (error) {
      console.error('Error getting face verification status:', error)
      socket.emit('face_verification_error', {
        message: 'Failed to get face verification status'
      })
    }
  })

  // Rest of the original methods remain the same...
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
        const sessionLog = await databaseService.db.collection('session_logs').findOne({ session_id: session._id })

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
          device_has_camera: sessionLog?.has_camera || false,
          face_verification_required: sessionLog?.face_verification_required || false,
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
            totalVerifications > 0 ? ((successfulVerifications / totalVerifications) * 100).toFixed(1) + '%' : 'N/A',
          device_info: sessionLog?.device_info || null
        })
      }

      socket.emit('exam_face_report', {
        exam_id,
        exam_title: exam.title,
        total_sessions: sessions.length,
        sessions_with_camera: faceReport.filter((r) => r.device_has_camera).length,
        sessions_without_camera: faceReport.filter((r) => !r.device_has_camera).length,
        face_report: faceReport
      })
    } catch (error) {
      console.error('Error getting exam face report:', error)
      socket.emit('error', { message: 'Failed to get face verification report' })
    }
  })
}
