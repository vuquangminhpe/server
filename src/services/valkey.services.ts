import { createClient } from 'redis'
import { envConfig } from '../constants/config'
import { ObjectId } from 'bson'

class ValkeyService {
  private client: ReturnType<typeof createClient> | null = null
  private static instance: ValkeyService
  private connectionPromise: Promise<void> | null = null
  private readonly REFRESH_TOKEN_PREFIX = 'refresh_token:'
  private readonly TOKEN_TO_USER_PREFIX = 'token_to_user:'

  private constructor() {
    // Không tạo client trong constructor để tránh kết nối tự động
    // khi serverless function khởi tạo
  }

  public static getInstance(): ValkeyService {
    if (!ValkeyService.instance) {
      ValkeyService.instance = new ValkeyService()
    }
    return ValkeyService.instance
  }

  private getClient() {
    if (!this.client) {
      this.client = createClient({
        url: process.env.VALKEY_URL || 'redis://localhost:6379',
        socket: {
          tls: process.env.VALKEY_URL?.startsWith('rediss://'),
          reconnectStrategy: (retries) => {
            if (retries > 1) return new Error('Max retries reached') // Giảm số lần thử lại
            return Math.min(retries * 300, 1000) // Giảm thời gian chờ
          },
          connectTimeout: 5000 // Giảm timeout xuống 5 giây
        }
      })

      this.client.on('error', (err) => {
        console.error('Redis error:', err)
        // Reset client khi gặp lỗi
        this.connectionPromise = null
        this.client = null
      })
    }

    return this.client
  }

  async connect(): Promise<void> {
    // Tránh kết nối nếu đang ở quá trình build của Vercel
    if (process.env.VERCEL_ENV === 'development' && process.env.VERCEL_BUILDING) {
      console.log('Skipping Redis connection during Vercel build')
      return Promise.resolve()
    }

    if (!this.connectionPromise) {
      const client = this.getClient()

      this.connectionPromise = client
        .connect()
        .then(() => {
          console.log('Redis connected!')
        })
        .catch((err) => {
          console.error('Redis connection failed:', err)
          this.connectionPromise = null
          this.client = null
          // Không ném lỗi để tránh crash serverless function
          // Thay vào đó, sẽ thử lại ở lần gọi tiếp theo
        })
    }

    return this.connectionPromise
  }

  // Phương thức đảm bảo kết nối với timeout ngắn hơn cho serverless
  private async ensureConnected(): Promise<boolean> {
    try {
      if (!this.client || !this.client.isOpen) {
        // Đặt timeout cho kết nối Redis trong môi trường serverless
        const timeoutPromise = new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error('Redis connection timeout')), 3000)
        })

        await Promise.race([this.connect(), timeoutPromise])
      }
      return true
    } catch (error) {
      console.error('Could not ensure Redis connection:', error)
      return false
    }
  }

  async storeRefreshToken(user_id: string, token: string, expiresInSec: number) {
    const connected = await this.ensureConnected()
    if (!connected || !this.client) return false

    try {
      const tokenKey = `${this.TOKEN_TO_USER_PREFIX}${token}`
      await this.client.setEx(tokenKey, expiresInSec, user_id)
      const userKey = `${this.REFRESH_TOKEN_PREFIX}${user_id}`
      await this.client.sAdd(userKey, token)
      console.log(`Stored refresh token for user_id: ${user_id}`)
      return true
    } catch (error) {
      console.error('Error storing refresh token:', error)
      return false
    }
  }

  async getUserIdFromToken(token: string): Promise<string | null> {
    const connected = await this.ensureConnected()
    if (!connected || !this.client) return null

    try {
      const tokenKey = `${this.TOKEN_TO_USER_PREFIX}${token}`
      return await this.client.get(tokenKey)
    } catch (error) {
      console.error('Error getting user ID from token:', error)
      return null
    }
  }

  async getRefreshTokensForUser(user_id: string): Promise<string[]> {
    const connected = await this.ensureConnected()
    if (!connected || !this.client) return []

    try {
      const userKey = `${this.REFRESH_TOKEN_PREFIX}${user_id}`
      return await this.client.sMembers(userKey)
    } catch (error) {
      console.error('Error getting refresh tokens for user:', error)
      return []
    }
  }

  async deleteRefreshToken(token: string): Promise<boolean> {
    const connected = await this.ensureConnected()
    if (!connected || !this.client) return false

    try {
      const tokenKey = `${this.TOKEN_TO_USER_PREFIX}${token}`
      const user_id = await this.client.get(tokenKey)

      if (!user_id) return false

      await this.client.del(tokenKey)
      const userKey = `${this.REFRESH_TOKEN_PREFIX}${user_id}`
      await this.client.sRem(userKey, token)

      console.log(`Deleted refresh token for user_id: ${user_id}`)
      return true
    } catch (error) {
      console.error('Error deleting refresh token:', error)
      return false
    }
  }

  async deleteAllRefreshTokensForUser(user_id: string): Promise<boolean> {
    const connected = await this.ensureConnected()
    if (!connected || !this.client) return false

    try {
      const userKey = `${this.REFRESH_TOKEN_PREFIX}${user_id}`
      const tokens = await this.client.sMembers(userKey)

      const tokenKeyPromises = tokens.map((token) => this.client?.del(`${this.TOKEN_TO_USER_PREFIX}${token}`))

      await Promise.all([...tokenKeyPromises, this.client.del(userKey)])
      console.log(`Deleted all refresh tokens for user_id: ${user_id}`)
      return true
    } catch (error) {
      console.error('Error deleting all refresh tokens for user:', error)
      return false
    }
  }

  async tokenExists(token: string): Promise<boolean> {
    const connected = await this.ensureConnected()
    if (!connected || !this.client) return false

    try {
      const tokenKey = `${this.TOKEN_TO_USER_PREFIX}${token}`
      return (await this.client.exists(tokenKey)) === 1
    } catch (error) {
      console.error('Error checking if token exists:', error)
      return false
    }
  }

  // Phương thức để đóng kết nối - quan trọng cho serverless
  async disconnect(): Promise<void> {
    if (this.client && this.client.isOpen) {
      await this.client.disconnect()
      this.client = null
      this.connectionPromise = null
      console.log('Redis disconnected')
    }
  }
}

const valkeyService = ValkeyService.getInstance()
export default valkeyService
