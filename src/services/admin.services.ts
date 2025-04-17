import { ObjectId } from 'mongodb'
import { AccountStatus, TweetType, UserVerifyStatus } from '../constants/enums'
import {
  UserStatsQuery,
  ContentStatsQuery,
  InteractionStatsQuery,
  RevenueStatsQuery,
  SystemStatsQuery,
  AdminUserListQuery
} from '../models/request/Admin.request'
import databaseService from './database.services'
import { AdminReportType, StatInterval } from '../constants/messages'
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
}

const adminService = new AdminService()
export default adminService
