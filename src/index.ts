import express from 'express'
import databaseService from './services/database.services'
import usersRouter from './routes/user.routes'
import { defaultErrorHandler } from './middlewares/error.middlewares'
import mediasRouter from './routes/medias.routes'
import { config } from 'dotenv'
import staticRouter from './routes/static.routes'
import { initFolderImage, initFolderVideo, initFolderVideoHls } from './utils/file'
import cors, { CorsOptions } from 'cors'
import { createServer } from 'http'
import { initSocketServer } from './socket'
// import '../utils/fake'
import './utils/s3'
import helmet from 'helmet'
import { envConfig, isProduction } from './constants/config'

import adminRouter from './routes/admin.routes'
import apiRouter from './routes'
import geminiRoutes from './routes/gemini.routes'
config()
databaseService
  .connect()
  .then(() => {
    databaseService.indexVideoStatus()
  })
  .catch()
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15p
//   max: 100, // 1 IP => 100 requests 15 phút
//   standardHeaders: true,
//   legacyHeaders: false
// })
// // => trả về lỗi 429 mặc định => giới hạn requests
const app = express()
const httpServer = createServer(app)
const port = envConfig.port || 3002
app.use(helmet())
const corsOptions: CorsOptions = {
  origin: '*',
  optionsSuccessStatus: 200
}

// app.use(limiter)
app.use(cors(corsOptions))

try {
  initFolderImage()
  initFolderVideo()
  initFolderVideoHls()
  console.log('Directories initialized successfully')
} catch (error) {
  console.error('Error initializing directories:', error)
}
app.use(express.json())
app.use('/users', usersRouter)
app.use('/medias', mediasRouter)

app.use('/static', staticRouter)
app.use('/admin', adminRouter)
app.use('/api', apiRouter)
app.use('/gemini', geminiRoutes)
// app.use('/static/video-hls', express.static(UPLOAD_VIDEO_HLS_DIR))
const io = initSocketServer(httpServer)
app.use(defaultErrorHandler)

httpServer.listen(port, () => {
  console.log(`Server listening on port ${port}`)
})

export default app
