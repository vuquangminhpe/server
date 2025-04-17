import { NextFunction, Request, Response, RequestHandler } from 'express'

export const wrapAsync = (fn: Function): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): Promise<void> => {
    return Promise.resolve(fn(req, res, next)).catch(next)
  }
}
