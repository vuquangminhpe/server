import { Query } from 'express-serve-static-core'
import { UserVerifyStatus } from '../../constants/enums'
import { AdminReportType, StatInterval } from '../../constants/messages'

export interface StatDateRange {
  from_date?: string
  to_date?: string
}

export interface StatIntervalParams extends StatDateRange {
  interval?: StatInterval
}

export interface UserStatsQuery extends Query, StatIntervalParams {
  account_type?: string
  verification_status?: string
}

export interface ContentStatsQuery extends Query, StatIntervalParams {
  content_type?: string
  has_media?: string
}

export interface InteractionStatsQuery extends Query, StatIntervalParams {
  interaction_type?: string
}

export interface RevenueStatsQuery extends Query, StatIntervalParams {
  subscription_type?: string
}

export interface SystemStatsQuery extends Query, StatIntervalParams {
  stat_type?: string
}

export interface AdminUserListQuery extends Query {
  page?: string
  limit?: string
  search?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
  account_type?: string
  verification_status?: string
}

export interface UpdateUserStatusBody {
  user_id: string
  status: UserVerifyStatus
}

export interface UpdateUserRoleBody {
  user_id: string
  role: string
}

export interface GenerateReportBody {
  report_type: AdminReportType
  from_date?: string
  to_date?: string
  format?: 'json' | 'csv'
}
