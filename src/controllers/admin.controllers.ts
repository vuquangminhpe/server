import { Request, Response } from 'express'
import { ADMIN_MESSAGES } from '../constants/messages'
import { UserStatsQuery, ContentStatsQuery } from '../models/request/Admin.request'
import adminService from '../services/admin.services'

export const getUserStatisticsController = async (req: Request<any, any, any, UserStatsQuery>, res: Response) => {
  const result = await adminService.getUserStatistics(req.query)

  res.json({
    message: ADMIN_MESSAGES.GET_USER_STATS_SUCCESS,
    result
  })
}

export const getContentStatisticsController = async (req: Request<any, any, any, ContentStatsQuery>, res: Response) => {
  const result = await adminService.getContentStatistics(req.query)

  res.json({
    message: ADMIN_MESSAGES.GET_TWEET_STATS_SUCCESS,
    result
  })
}
