import { ObjectId } from 'mongodb'
import { AccountStatus, UserVerifyStatus } from '../constants/enums'
import { UserStatsQuery, ContentStatsQuery } from '../models/request/Admin.request'
import databaseService from './database.services'
import { StatInterval } from '../constants/messages'
import { UserRole } from '../models/schemas/User.schema'

class AdminService {
  async getUserStatistics(query: UserStatsQuery) {
    const { from_date, to_date, interval, account_type, verification_status } = query

    const dateFilter: any = {}
    if (from_date) {
      dateFilter.created_at = { $gte: new Date(from_date) }
    }
    if (to_date) {
      dateFilter.created_at = { ...dateFilter.created_at, $lte: new Date(to_date) }
    }

    const accountTypeFilter: any = {}
    if (account_type) {
      accountTypeFilter.typeAccount = parseInt(account_type)
    }

    const verificationFilter: any = {}
    if (verification_status) {
      verificationFilter.verify = parseInt(verification_status as string)
    }

    const filter = {
      ...dateFilter,
      ...accountTypeFilter,
      ...verificationFilter
    }

    const totalUsers = await databaseService.users.countDocuments(filter)

    const usersByVerification = await databaseService.users
      .aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$verify',
            count: { $sum: 1 }
          }
        }
      ])
      .toArray()

    const usersByAccountType = await databaseService.users
      .aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$typeAccount',
            count: { $sum: 1 }
          }
        }
      ])
      .toArray()

    const userGrowth = await this.getUserGrowthByInterval(interval || StatInterval.MONTHLY, from_date, to_date)

    return {
      total_users: totalUsers,
      by_verification_status: this.formatVerificationStats(usersByVerification),
      by_account_type: this.formatAccountTypeStats(usersByAccountType),
      growth_over_time: userGrowth
    }
  }

  private formatVerificationStats(stats: any[]) {
    const result: Record<string, number> = {
      unverified: 0,
      verified: 0,
      banned: 0
    }

    stats.forEach((stat) => {
      if (stat._id === UserVerifyStatus.Unverified) {
        result.unverified = stat.count
      } else if (stat._id === UserVerifyStatus.Verified) {
        result.verified = stat.count
      } else if (stat._id === UserVerifyStatus.Banned) {
        result.banned = stat.count
      }
    })

    return result
  }

  private formatAccountTypeStats(stats: any[]) {
    const result: Record<string, number> = {
      free: 0,
      premium: 0,
      platinum: 0
    }

    stats.forEach((stat) => {
      if (stat._id === AccountStatus.FREE) {
        result.free = stat.count
      } else if (stat._id === AccountStatus.PREMIUM) {
        result.premium = stat.count
      } else if (stat._id === AccountStatus.PLATINUM) {
        result.platinum = stat.count
      }
    })

    return result
  }

  private async getUserGrowthByInterval(interval: StatInterval, from_date?: string, to_date?: string) {
    const dateFormat = this.getDateFormatByInterval(interval)
    const fromDate = from_date ? new Date(from_date) : new Date(new Date().setFullYear(new Date().getFullYear() - 1))
    const toDate = to_date ? new Date(to_date) : new Date()

    const growth = await databaseService.users
      .aggregate([
        {
          $match: {
            created_at: { $gte: fromDate, $lte: toDate }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: dateFormat, date: '$created_at' }
            },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ])
      .toArray()

    return growth.map((item) => ({
      date: item._id,
      new_users: item.count
    }))
  }

  private getDateFormatByInterval(interval: StatInterval) {
    switch (interval) {
      case StatInterval.DAILY:
        return '%Y-%m-%d'
      case StatInterval.WEEKLY:
        return '%Y-%U'
      case StatInterval.MONTHLY:
        return '%Y-%m'
      default:
        return '%Y-%m'
    }
  }

  async getContentStatistics(query: ContentStatsQuery) {
    const { from_date, to_date, interval, content_type, has_media } = query

    const dateFilter: any = {}
    if (from_date) {
      dateFilter.created_at = { $gte: new Date(from_date) }
    }
    if (to_date) {
      dateFilter.created_at = { ...dateFilter.created_at, $lte: new Date(to_date) }
    }

    const contentTypeFilter: any = {}
    if (content_type) {
      contentTypeFilter.type = parseInt(content_type)
    }

    const mediaFilter: any = {}
    if (has_media !== undefined) {
      const mediaCondition = has_media === 'true' ? { $gt: 0 } : { $eq: 0 }
      mediaFilter['medias.0'] = mediaCondition
    }

    const filter = {
      ...dateFilter,
      ...contentTypeFilter,
      ...mediaFilter
    }

    return {}
  }

  // Get all teachers with pagination and search
  async getAllTeachers(page: number = 1, limit: number = 10, search: string = '') {
    const skip = (page - 1) * limit

    // Create search filter
    const searchFilter = search
      ? {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { username: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } }
          ]
        }
      : {}

    // Build query filter
    const filter = {
      role: UserRole.Teacher,
      ...searchFilter
    }

    // Get teachers
    const teachers = await databaseService.users
      .find(filter, {
        projection: {
          password: 0,
          email_verify_token: 0,
          forgot_password_token: 0
        }
      })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .toArray()

    // Get total count
    const total = await databaseService.users.countDocuments(filter)

    // Get exam counts for each teacher
    const teachersWithExamCounts = await Promise.all(
      teachers.map(async (teacher) => {
        const examCount = await databaseService.exams.countDocuments({
          teacher_id: teacher._id
        })

        const masterExamCount = await databaseService.masterExams.countDocuments({
          teacher_id: teacher._id
        })

        return {
          ...teacher,
          exam_count: examCount,
          master_exam_count: masterExamCount
        }
      })
    )

    return {
      teachers: teachersWithExamCounts,
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit)
    }
  }

  // Get all students with pagination and search
  async getAllStudents(page: number = 1, limit: number = 10, search: string = '') {
    const skip = (page - 1) * limit

    // Create search filter
    const searchFilter = search
      ? {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { username: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { class: { $regex: search, $options: 'i' } }
          ]
        }
      : {}

    // Build query filter
    const filter = {
      role: UserRole.Student,
      ...searchFilter
    }

    // Get students
    const students = await databaseService.users
      .find(filter, {
        projection: {
          password: 0,
          email_verify_token: 0,
          forgot_password_token: 0
        }
      })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .toArray()

    // Get total count
    const total = await databaseService.users.countDocuments(filter)

    // Get exam session counts for each student
    const studentsWithSessionCounts = await Promise.all(
      students.map(async (student) => {
        const sessionCount = await databaseService.examSessions.countDocuments({
          student_id: student._id
        })

        const completedSessionCount = await databaseService.examSessions.countDocuments({
          student_id: student._id,
          completed: true
        })

        return {
          ...student,
          session_count: sessionCount,
          completed_session_count: completedSessionCount
        }
      })
    )

    return {
      students: studentsWithSessionCounts,
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit)
    }
  }

  // Get all master exams with pagination and search
  async getAllMasterExams(page: number = 1, limit: number = 10, search: string = '') {
    const skip = (page - 1) * limit

    // Create search filter
    const searchFilter = search
      ? {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { exam_period: { $regex: search, $options: 'i' } }
          ]
        }
      : {}

    // Build query filter
    const filter = {
      ...searchFilter
    }

    // Get master exams
    const masterExams = await databaseService.masterExams
      .find(filter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .toArray()

    // Get total count
    const total = await databaseService.masterExams.countDocuments(filter)

    // Get related data for each master exam
    const masterExamsWithDetails = await Promise.all(
      masterExams.map(async (masterExam) => {
        // Get teacher info
        const teacher = await databaseService.users.findOne(
          { _id: masterExam.teacher_id },
          {
            projection: {
              name: 1,
              username: 1,
              email: 1
            }
          }
        )

        // Count child exams
        const examCount = await databaseService.exams.countDocuments({
          master_exam_id: masterExam._id
        })

        // Count completed sessions
        const sessions = await databaseService.examSessions
          .aggregate([
            {
              $lookup: {
                from: 'exams',
                localField: 'exam_id',
                foreignField: '_id',
                as: 'exam'
              }
            },
            {
              $unwind: '$exam'
            },
            {
              $match: {
                'exam.master_exam_id': masterExam._id
              }
            },
            {
              $count: 'total'
            }
          ])
          .toArray()

        const sessionCount = sessions.length > 0 ? sessions[0].total : 0

        return {
          ...masterExam,
          teacher: teacher || { name: 'Unknown Teacher' },
          exam_count: examCount,
          session_count: sessionCount
        }
      })
    )

    return {
      master_exams: masterExamsWithDetails,
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit)
    }
  }

  // Delete a user and related data
  async deleteUser(userId: string) {
    const user = await databaseService.users.findOne({ _id: new ObjectId(userId) })

    if (!user) {
      throw new Error('User not found')
    }

    // Start a transaction
    const session = databaseService.client.startSession()

    try {
      await session.withTransaction(async () => {
        // Delete the user
        await databaseService.users.deleteOne({ _id: new ObjectId(userId) }, { session })

        // If teacher, delete their questions, exams, master exams
        if (user.role === UserRole.Teacher) {
          // Delete questions
          await databaseService.questions.deleteMany({ teacher_id: new ObjectId(userId) }, { session })

          // Get all master exams by this teacher
          const masterExams = await databaseService.masterExams
            .find({ teacher_id: new ObjectId(userId) }, { session })
            .toArray()

          const masterExamIds = masterExams.map((exam) => exam._id)

          // Delete all master exams
          await databaseService.masterExams.deleteMany({ teacher_id: new ObjectId(userId) }, { session })

          // Delete all exams associated with those master exams or teacher
          await databaseService.exams.deleteMany(
            {
              $or: [{ teacher_id: new ObjectId(userId) }, { master_exam_id: { $in: masterExamIds } }]
            },
            { session }
          )
        }

        // If student, delete their exam sessions
        if (user.role === UserRole.Student) {
          // Delete exam sessions
          await databaseService.examSessions.deleteMany({ student_id: new ObjectId(userId) }, { session })

          // Delete exam violations
          await databaseService.db
            .collection('exam_violations')
            .deleteMany({ student_id: new ObjectId(userId) }, { session })
        }

        // Delete refresh tokens
        await databaseService.refreshToken.deleteMany({ user_id: new ObjectId(userId) }, { session })
      })

      return { success: true, message: 'User and related data deleted successfully' }
    } catch (error) {
      console.error('Error deleting user:', error)
      throw error
    } finally {
      await session.endSession()
    }
  }

  // Change user role
  async changeUserRole(userId: string, role: UserRole) {
    // Don't allow changing to admin role for security reasons
    if (role === UserRole.Admin) {
      throw new Error('Cannot promote to admin role using this API')
    }

    const result = await databaseService.users.findOneAndUpdate(
      { _id: new ObjectId(userId) },
      {
        $set: { role },
        $currentDate: { updated_at: true }
      },
      { returnDocument: 'after' }
    )

    return result
  }
}

const adminService = new AdminService()
export default adminService
