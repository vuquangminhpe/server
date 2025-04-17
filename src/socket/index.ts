import { Server } from 'socket.io'
import http from 'http'
import { verifyToken } from '../utils/jwt'
import { envConfig } from '../constants/config'
import examSessionService from '../services/examSessions.services'
import examSecurityService from '../services/examSecurity.services'
import { ObjectId } from 'mongodb'
import databaseService from '../services/database.services'
import { UserRole } from '../models/schemas/User.schema'

export const initSocketServer = (httpServer: http.Server) => {
  const io = new Server(httpServer, {
    cors: {
      origin: ['https://cta-client.vercel.app', 'http://localhost:3002'],

      methods: ['GET', 'POST'],
      credentials: true
    }
  })

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token

      if (!token) {
        return next(new Error('Authentication error'))
      }

      const decoded = await verifyToken({
        token,
        secretOnPublicKey: envConfig.privateKey_access_token as string
      })

      socket.data.user_id = decoded.user_id

      // Store IP address
      socket.data.ip_address = socket.handshake.address

      // Get user role to handle teacher/student differently
      const user = await databaseService.users.findOne({ _id: new ObjectId(decoded.user_id) })
      socket.data.role = user?.role || null

      next()
    } catch (error) {
      next(new Error('Authentication error'))
    }
  })

  // Active exam sessions with connected students
  const activeExams = new Map()
  // Track teacher connections by exam ID
  const teacherMonitors = new Map()

  // Connection handler
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.data.user_id}, Role: ${socket.data.role}, IP: ${socket.data.ip_address}`)

    // Track active exam sessions for this connection
    const activeExamSessions = new Set()

    // Teacher joins monitoring room
    socket.on('monitor_exam', async (examId) => {
      // Verify this user is a teacher and owns this exam
      if (socket.data.role !== UserRole.Teacher && socket.data.role !== UserRole.Admin) {
        socket.emit('error', { message: 'Not authorized to monitor exams' })
        return
      }

      try {
        // Get the exam
        const exam = await databaseService.exams.findOne({ _id: new ObjectId(examId) })

        if (!exam) {
          socket.emit('error', { message: 'Exam not found' })
          return
        }

        // Verify exam ownership
        if (exam.teacher_id.toString() !== socket.data.user_id && socket.data.role !== UserRole.Admin) {
          socket.emit('error', { message: 'Not authorized to monitor this exam' })
          return
        }

        // Join teacher to monitoring room
        socket.join(`monitor_${examId}`)
        console.log(`Teacher ${socket.data.user_id} monitoring exam ${examId}`)

        // Track this teacher connection
        if (!teacherMonitors.has(examId)) {
          teacherMonitors.set(examId, new Set())
        }
        teacherMonitors.get(examId).add(socket.id)

        // Get active sessions for this exam and send to teacher
        const activeSessions = await databaseService.examSessions
          .find({
            exam_id: new ObjectId(examId),
            completed: false
          })
          .toArray()

        // Get student info for each session
        const sessionsWithStudentInfo = await Promise.all(
          activeSessions.map(async (session) => {
            const student = await databaseService.users.findOne({ _id: session.student_id })

            return {
              session_id: session._id.toString(),
              student_id: session.student_id.toString(),

              student_username: student?.username || 'Unknown',
              start_time: session.start_time,
              violations: session.violations,
              active: activeExams.has(session._id.toString())
            }
          })
        )

        // Send current active sessions to teacher
        socket.emit('active_sessions', {
          exam_id: examId,
          sessions: sessionsWithStudentInfo
        })

        // Send violation history for this exam
        const violations = await databaseService.db
          .collection('exam_violations')
          .find({ session_id: { $in: activeSessions.map((s) => s._id) } })
          .sort({ timestamp: -1 })
          .limit(100)
          .toArray()

        if (violations.length > 0) {
          socket.emit('violations_history', {
            exam_id: examId,
            violations: violations
          })
        }
      } catch (error) {
        console.error('Error setting up monitoring:', error)
        socket.emit('error', { message: 'Failed to set up monitoring' })
      }
    })

    // Student joins exam session room
    socket.on('join_exam', async (sessionId) => {
      try {
        socket.join(`exam_${sessionId}`)
        activeExamSessions.add(sessionId)

        // Track active students
        activeExams.set(sessionId, {
          student_id: socket.data.user_id,
          socket_id: socket.id,
          join_time: new Date(),
          last_activity: new Date()
        })

        // Find which exam this session belongs to
        const session = await databaseService.examSessions.findOne({ _id: new ObjectId(sessionId) })

        if (session) {
          const examId = session.exam_id.toString()

          // Get student info to notify teachers
          const student = await databaseService.users.findOne({ _id: new ObjectId(socket.data.user_id) })

          // Send notification to teachers monitoring this exam
          io.to(`monitor_${examId}`).emit('student_joined', {
            session_id: sessionId,
            exam_id: examId,
            student_id: socket.data.user_id,

            student_username: student?.username || 'Unknown',
            start_time: session.start_time,
            violations: session.violations
          })
        }

        console.log(`Student ${socket.data.user_id} joined exam ${sessionId}`)

        // Get security level for this exam
        const securityLevel = await examSecurityService.getSecurityLevel(sessionId)

        // Send initial settings to client
        socket.emit('security_level_update', {
          session_id: sessionId,
          level: securityLevel
        })

        // Send initial time update
        io.to(`exam_${sessionId}`).emit('time_update', {
          session_id: sessionId,
          timestamp: Date.now()
        })
      } catch (error) {
        console.error('Error joining exam:', error)
        socket.emit('error', { message: 'Failed to join exam session' })
      }
    })

    // Device registration
    socket.on('register_device', async (data) => {
      const { session_id, device_info } = data
      const user_id = socket.data.user_id
      const ip_address = socket.data.ip_address

      // Register the device and check for suspicious activity
      const isValid = await examSecurityService.registerDevice(session_id, user_id, device_info, ip_address)

      if (!isValid) {
        // Notify client of potential issues
        socket.emit('security_warning', {
          session_id,
          message: 'Suspicious activity detected with your device'
        })

        // Also notify teachers
        if (activeExams.has(session_id)) {
          const session = await databaseService.examSessions.findOne({ _id: new ObjectId(session_id) })
          if (session) {
            const examId = session.exam_id.toString()
            io.to(`monitor_${examId}`).emit('security_warning', {
              session_id,
              student_id: user_id,
              message: 'Suspicious device detected',
              device_info
            })
          }
        }
      }
    })

    // Webcam verification
    socket.on('webcam_verification', async (data) => {
      const { session_id, photo } = data
      const user_id = socket.data.user_id

      // Verify the webcam image
      const isVerified = await examSecurityService.verifyWebcamImage(session_id, user_id, photo)

      // Send result back to client
      socket.emit('webcam_verification_result', {
        session_id,
        verified: isVerified
      })
    })

    // Handle tab switching events
    socket.on('tab_switch', async (data) => {
      const { session_id } = data
      const user_id = socket.data.user_id

      try {
        // Update last activity time
        if (activeExams.has(session_id)) {
          activeExams.get(session_id).last_activity = new Date()
        }

        // Record as violation
        const violation = await examSecurityService.recordViolation(
          session_id,
          user_id,
          'tab_switch',
          { timestamp: new Date() },
          'medium'
        )

        // Update session in database
        const updatedSession = await examSessionService.recordViolation(session_id)

        if (updatedSession) {
          // Broadcast violation to the exam room
          io.to(`exam_${session_id}`).emit('violation_recorded', {
            session_id,
            violations: updatedSession.violations,
            score: updatedSession.score,
            type: 'tab_switch'
          })

          // Find the exam ID for this session
          const session = await databaseService.examSessions.findOne({ _id: new ObjectId(session_id) })

          if (session) {
            const examId = session.exam_id.toString()

            // Get student info for teacher notifications
            const student = await databaseService.users.findOne({ _id: new ObjectId(user_id) })

            // Also send to teachers monitoring this exam
            io.to(`monitor_${examId}`).emit('violation_recorded', {
              session_id,
              exam_id: examId,
              student_id: user_id,

              violations: updatedSession.violations,
              score: updatedSession.score,
              type: 'tab_switch',
              timestamp: new Date()
            })
          }
        }
      } catch (error) {
        console.error('Error recording violation:', error)
      }
    })

    // Handle general exam violations
    socket.on('exam_violation', async (data) => {
      const { session_id, type, details } = data
      const user_id = socket.data.user_id

      try {
        // Update last activity time
        if (activeExams.has(session_id)) {
          activeExams.get(session_id).last_activity = new Date()
        }

        // Determine severity based on violation type
        let severity: 'low' | 'medium' | 'high' = 'medium'

        // Higher severity for certain types of violations
        if (
          type === 'screen_capture_attempt' ||
          type === 'keyboard_shortcut' ||
          type === 'multiple_ips' ||
          type === 'webcam_manipulation'
        ) {
          severity = 'high'
        } else if (type === 'inactivity' || type === 'unusual_activity') {
          severity = 'low'
        }

        // Record the violation
        const violation = await examSecurityService.recordViolation(session_id, user_id, type, details, severity)

        // Get updated session
        const updatedSession = await examSessionService.recordViolation(session_id)

        if (updatedSession) {
          // Broadcast violation to the exam room
          io.to(`exam_${session_id}`).emit('violation_recorded', {
            session_id,
            violations: updatedSession.violations,
            score: updatedSession.score,
            type,
            severity
          })

          // Find the exam ID for this session
          const session = await databaseService.examSessions.findOne({ _id: new ObjectId(session_id) })

          if (session) {
            const examId = session.exam_id.toString()

            // Get student info for teacher notifications
            const student = await databaseService.users.findOne({ _id: new ObjectId(user_id) })

            // Also send to teachers monitoring this exam
            io.to(`monitor_${examId}`).emit('violation_recorded', {
              session_id,
              exam_id: examId,
              student_id: user_id,

              student_username: student?.username || 'Unknown',
              violations: updatedSession.violations,
              score: updatedSession.score,
              type,
              severity,
              details,
              timestamp: new Date()
            })
          }
        }
      } catch (error) {
        console.error('Error recording violation:', error)
      }
    })

    // Student submits exam
    socket.on('exam_submitted', async (sessionId) => {
      try {
        // Find the exam ID for this session
        const session = await databaseService.examSessions.findOne({ _id: new ObjectId(sessionId) })

        if (session) {
          const examId = session.exam_id.toString()

          // Get student info for teacher notifications
          const student = await databaseService.users.findOne({ _id: new ObjectId(socket.data.user_id) })

          // Notify teachers monitoring this exam
          io.to(`monitor_${examId}`).emit('student_submitted', {
            session_id: sessionId,
            exam_id: examId,
            student_id: socket.data.user_id,

            student_username: student?.username || 'Unknown',
            score: session.score,
            end_time: session.end_time || new Date()
          })

          // Remove from active exams
          activeExams.delete(sessionId)
        }
      } catch (error) {
        console.error('Error handling exam submission:', error)
      }
    })

    // Teacher ends student's exam early
    socket.on('end_student_exam', async ({ session_id, reason }) => {
      // Verify this is a teacher
      if (socket.data.role !== UserRole.Teacher && socket.data.role !== UserRole.Admin) {
        socket.emit('error', { message: 'Not authorized to end exams' })
        return
      }

      try {
        // Find the exam session
        const session = await databaseService.examSessions.findOne({ _id: new ObjectId(session_id) })

        if (!session) {
          socket.emit('error', { message: 'Exam session not found' })
          return
        }

        // Verify teacher owns this exam
        const exam = await databaseService.exams.findOne({ _id: session.exam_id })

        if (!exam) {
          socket.emit('error', { message: 'Exam not found' })
          return
        }

        if (exam.teacher_id.toString() !== socket.data.user_id && socket.data.role !== UserRole.Admin) {
          socket.emit('error', { message: 'Not authorized to end this exam' })
          return
        }

        // Force end the exam
        await examSessionService.recordCriticalViolation(session_id)

        // Notify student
        io.to(`exam_${session_id}`).emit('exam_ended_by_teacher', {
          session_id,
          reason: reason || 'Ended by teacher'
        })

        // Notify all monitoring teachers
        io.to(`monitor_${exam._id.toString()}`).emit('student_exam_ended', {
          session_id,
          student_id: session.student_id.toString(),
          reason: reason || 'Ended by teacher',
          by_teacher_id: socket.data.user_id
        })

        // Remove from active exams
        activeExams.delete(session_id)

        console.log(`Teacher ${socket.data.user_id} ended exam session ${session_id}`)
      } catch (error) {
        console.error('Error ending student exam:', error)
        socket.emit('error', { message: 'Failed to end student exam' })
      }
    })

    // Teacher sends message to student
    socket.on('teacher_message', async ({ session_id, message }) => {
      // Verify this is a teacher
      if (socket.data.role !== UserRole.Teacher && socket.data.role !== UserRole.Admin) {
        socket.emit('error', { message: 'Not authorized to send teacher messages' })
        return
      }

      try {
        // Find the exam session
        const session = await databaseService.examSessions.findOne({ _id: new ObjectId(session_id) })

        if (!session) {
          socket.emit('error', { message: 'Exam session not found' })
          return
        }

        // Verify teacher owns this exam
        const exam = await databaseService.exams.findOne({ _id: session.exam_id })

        if (!exam) {
          socket.emit('error', { message: 'Exam not found' })
          return
        }

        if (exam.teacher_id.toString() !== socket.data.user_id && socket.data.role !== UserRole.Admin) {
          socket.emit('error', { message: 'Not authorized to message students in this exam' })
          return
        }

        // Send message to student
        io.to(`exam_${session_id}`).emit('teacher_message', {
          session_id,
          message,
          teacher_id: socket.data.user_id,
          timestamp: new Date()
        })

        console.log(`Teacher ${socket.data.user_id} sent message to session ${session_id}`)
      } catch (error) {
        console.error('Error sending teacher message:', error)
        socket.emit('error', { message: 'Failed to send message' })
      }
    })

    // Activity ping from student
    socket.on('activity_ping', async (data) => {
      const { session_id, state, timestamp } = data

      // Update last activity time
      if (activeExams.has(session_id)) {
        activeExams.get(session_id).last_activity = new Date()
      }

      // Log activity
      try {
        await databaseService.db.collection('exam_activity_logs').insertOne({
          session_id: new ObjectId(session_id as string),
          student_id: new ObjectId(socket.data.user_id as string),
          state,
          timestamp: new Date(timestamp),
          socket_id: socket.id,
          ip_address: socket.data.ip_address
        })
      } catch (error) {
        console.error('Error logging activity ping:', error)
      }
    })

    // Teacher requests current exam progress
    socket.on('get_exam_progress', async (examId) => {
      // Verify this is a teacher
      if (socket.data.role !== UserRole.Teacher && socket.data.role !== UserRole.Admin) {
        socket.emit('error', { message: 'Not authorized to view exam progress' })
        return
      }

      try {
        // Verify teacher owns this exam
        const exam = await databaseService.exams.findOne({ _id: new ObjectId(examId) })

        if (!exam) {
          socket.emit('error', { message: 'Exam not found' })
          return
        }

        if (exam.teacher_id.toString() !== socket.data.user_id && socket.data.role !== UserRole.Admin) {
          socket.emit('error', { message: 'Not authorized to view this exam' })
          return
        }

        // Get all sessions for this exam
        const sessions = await databaseService.examSessions.find({ exam_id: new ObjectId(examId) }).toArray()

        // Calculate statistics
        const totalSessions = sessions.length
        const completedSessions = sessions.filter((s) => s.completed).length
        const inProgressSessions = sessions.filter((s) => !s.completed).length
        const averageScore =
          sessions.filter((s) => s.completed).reduce((sum, s) => sum + s.score, 0) / (completedSessions || 1)
        const totalViolations = sessions.reduce((sum, s) => sum + s.violations, 0)

        // Get currently active students
        const activeStudents = []
        for (const session of sessions) {
          if (activeExams.has(session._id.toString())) {
            const student = await databaseService.users.findOne({ _id: session.student_id })
            activeStudents.push({
              session_id: session._id.toString(),
              student_id: session.student_id.toString(),

              student_username: student?.username || 'Unknown',
              violations: session.violations,
              start_time: session.start_time,
              last_activity: activeExams.get(session._id.toString()).last_activity
            })
          }
        }

        // Send progress to teacher
        socket.emit('exam_progress', {
          exam_id: examId,
          total_sessions: totalSessions,
          completed_sessions: completedSessions,
          in_progress_sessions: inProgressSessions,
          average_score: averageScore,
          total_violations: totalViolations,
          active_students: activeStudents
        })
      } catch (error) {
        console.error('Error getting exam progress:', error)
        socket.emit('error', { message: 'Failed to get exam progress' })
      }
    })
    // Get all active sessions across all exams (for global monitoring)
    socket.on('get_all_active_sessions', async () => {
      // Verify this user is a teacher or admin
      if (socket.data.role !== UserRole.Teacher && socket.data.role !== UserRole.Admin) {
        socket.emit('error', { message: 'Not authorized to monitor exams' })
        return
      }

      try {
        // Get all active sessions across all exams
        const activeSessions = await databaseService.examSessions
          .find({
            completed: false
          })
          .toArray()

        // Get exams info
        const examIds = [...new Set(activeSessions.map((session) => session.exam_id.toString()))]
        const exams = await databaseService.exams
          .find({ _id: { $in: examIds.map((id) => new ObjectId(id)) } })
          .toArray()

        const examsMap = new Map(exams.map((exam) => [exam._id.toString(), exam]))

        // Get student info for each session
        const sessionsWithInfo = await Promise.all(
          activeSessions.map(async (session) => {
            const student = await databaseService.users.findOne({ _id: session.student_id })
            const exam = examsMap.get(session.exam_id.toString())

            return {
              session_id: session._id.toString(),
              student_id: session.student_id.toString(),
              student_username: student?.username || 'Unknown',
              exam_id: session.exam_id.toString(),
              exam_title: exam?.title || 'Unknown Exam',
              exam_code: exam?.exam_code,
              start_time: session.start_time,
              violations: session.violations,
              active: activeExams.has(session._id.toString())
            }
          })
        )

        // Get all violations
        const violations = await databaseService.db
          .collection('exam_violations')
          .find({})
          .sort({ timestamp: -1 })
          .limit(200)
          .toArray()

        // Enrich violations with student info
        const violationsWithInfo = await Promise.all(
          violations.map(async (violation) => {
            const session = activeSessions.find((s) => s._id.toString() === violation.session_id?.toString())
            if (!session) return null

            const student = await databaseService.users.findOne({ _id: session.student_id })
            const exam = examsMap.get(session.exam_id.toString())

            return {
              ...violation,
              student_username: student?.username || 'Unknown',
              exam_id: session.exam_id.toString(),
              exam_title: exam?.title || 'Unknown Exam'
            }
          })
        )

        // Filter out null values from violationsWithInfo
        const filteredViolations = violationsWithInfo.filter((v) => v !== null)

        // Send data to the requesting client
        socket.emit('all_active_sessions', {
          sessions: sessionsWithInfo,
          violations: filteredViolations
        })
      } catch (error) {
        console.error('Error fetching all active sessions:', error)
        socket.emit('error', { message: 'Failed to fetch active sessions' })
      }
    })

    // Teacher joins monitoring room for a specific exam
    socket.on('monitor_exam', async (examId) => {
      // Verify this user is a teacher and owns this exam
      if (socket.data.role !== UserRole.Teacher && socket.data.role !== UserRole.Admin) {
        socket.emit('error', { message: 'Not authorized to monitor exams' })
        return
      }

      try {
        // Get the exam
        const exam = await databaseService.exams.findOne({ _id: new ObjectId(examId) })

        if (!exam) {
          socket.emit('error', { message: 'Exam not found' })
          return
        }

        // Verify exam ownership
        if (exam.teacher_id.toString() !== socket.data.user_id && socket.data.role !== UserRole.Admin) {
          socket.emit('error', { message: 'Not authorized to monitor this exam' })
          return
        }

        // Join teacher to monitoring room
        socket.join(`monitor_${examId}`)
        console.log(`Teacher ${socket.data.user_id} monitoring exam ${examId}`)

        // Track this teacher connection
        if (!teacherMonitors.has(examId)) {
          teacherMonitors.set(examId, new Set())
        }
        teacherMonitors.get(examId).add(socket.id)

        // Get active sessions for this exam
        const activeSessions = await databaseService.examSessions
          .find({
            exam_id: new ObjectId(examId),
            completed: false
          })
          .toArray()

        // Get student info for each session
        const sessionsWithStudentInfo = await Promise.all(
          activeSessions.map(async (session) => {
            const student = await databaseService.users.findOne({ _id: session.student_id })

            return {
              session_id: session._id.toString(),
              student_id: session.student_id.toString(),
              student_username: student?.username || 'Unknown',
              start_time: session.start_time,
              violations: session.violations,
              active: activeExams.has(session._id.toString())
            }
          })
        )

        // Send current active sessions to teacher
        socket.emit('active_sessions', {
          exam_id: examId,
          sessions: sessionsWithStudentInfo
        })

        // Send violation history for this exam
        const violations = await databaseService.db
          .collection('exam_violations')
          .find({ session_id: { $in: activeSessions.map((s) => s._id) } })
          .sort({ timestamp: -1 })
          .limit(100)
          .toArray()

        if (violations.length > 0) {
          socket.emit('violations_history', {
            exam_id: examId,
            violations: violations
          })
        }
      } catch (error) {
        console.error('Error setting up monitoring:', error)
        socket.emit('error', { message: 'Failed to set up monitoring' })
      }
    })
    // Periodic time updates (every 5 seconds)
    const timeInterval = setInterval(() => {
      // Get all rooms this socket is in
      const rooms = Array.from(socket.rooms).filter((room) => room.startsWith('exam_'))

      // Send time update to each room
      rooms.forEach((room) => {
        const sessionId = room.replace('exam_', '')

        io.to(room).emit('time_update', {
          session_id: sessionId,
          timestamp: Date.now()
        })
      })
    }, 5000)

    // Periodic status updates for teacher monitoring (every 10 seconds)
    const monitoringInterval = setInterval(async () => {
      // Only for teachers
      if (socket.data.role !== UserRole.Teacher && socket.data.role !== UserRole.Admin) {
        return
      }

      // Get all monitor rooms this teacher is in
      const monitorRooms = Array.from(socket.rooms).filter((room) => room.startsWith('monitor_'))

      for (const room of monitorRooms) {
        const examId = room.replace('monitor_', '')

        // Get active sessions for this exam
        const activeSessions = []
        const sessions = await databaseService.examSessions
          .find({
            exam_id: new ObjectId(examId),
            completed: false
          })
          .toArray()

        for (const session of sessions) {
          const sessionId = session._id.toString()

          if (activeExams.has(sessionId)) {
            const student = await databaseService.users.findOne({ _id: session.student_id })
            activeSessions.push({
              session_id: sessionId,
              student_id: session.student_id.toString(),

              student_username: student?.username || 'Unknown',
              violations: session.violations,
              start_time: session.start_time,
              elapsed_time: Math.floor((Date.now() - session.start_time.getTime()) / 1000),
              last_activity: activeExams.get(sessionId).last_activity,
              active: true
            })
          }
        }

        if (activeSessions.length > 0) {
          socket.emit('active_sessions_update', {
            exam_id: examId,
            active_sessions: activeSessions,
            timestamp: new Date()
          })
        }
      }
    }, 10000)

    // Cleanup on disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.data.user_id}`)
      clearInterval(timeInterval)
      clearInterval(monitoringInterval)

      // If this was a student in the middle of an exam
      if (activeExamSessions.size > 0) {
        // Record sudden disconnection as potential violation
        activeExamSessions.forEach(async (sessionId) => {
          try {
            await examSecurityService.recordViolation(
              sessionId as string,
              socket.data.user_id,
              'sudden_disconnect',
              { ip_address: socket.data.ip_address },
              'medium'
            )

            // Find the exam ID for this session
            const session = await databaseService.examSessions.findOne({ _id: new ObjectId(sessionId as string) })

            if (session) {
              const examId = session.exam_id.toString()

              // Get student info for teacher notifications
              const student = await databaseService.users.findOne({ _id: new ObjectId(socket.data.user_id) })

              // Notify teachers monitoring this exam
              io.to(`monitor_${examId}`).emit('student_disconnected', {
                session_id: sessionId,
                exam_id: examId,
                student_id: socket.data.user_id,

                student_username: student?.username || 'Unknown',
                timestamp: new Date()
              })
            }

            // Remove from active exams after 30 seconds (to allow for reconnection)
            setTimeout(() => {
              activeExams.delete(sessionId as string)
            }, 30000)
          } catch (error) {
            console.error('Error recording disconnect violation:', error)
          }
        })
      }

      // If this was a teacher monitoring
      if (socket.data.role === UserRole.Teacher || socket.data.role === UserRole.Admin) {
        // Remove from teacher monitors
        for (const [examId, teachers] of teacherMonitors.entries()) {
          if (teachers.has(socket.id)) {
            teachers.delete(socket.id)

            // If no more teachers monitoring this exam, clean up
            if (teachers.size === 0) {
              teacherMonitors.delete(examId)
            }
          }
        }
      }
    })
  })

  return io
}
