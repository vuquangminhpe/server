import { ObjectId } from 'mongodb'
import databaseService from './database.services'
import ExamSession from '../models/schemas/ExamSession.schema'

// New schema for device information
interface RemoteAccessData {
  processNames?: string[]
  networkInterfaces?: any[] // Thông tin về network interfaces
  performanceMetrics?: any // Các chỉ số về hiệu suất
  screenSharingActive?: boolean // Có đang chia sẻ màn hình không
  windowProperties?: any // Các thuộc tính cửa sổ trình duyệt bất thường
  userAgentData?: any // Chi tiết về user agent
  plugins?: any[] // Các plugin trình duyệt đáng ngờ
  inputPatterns?: any // Các mẫu nhập liệu bất thường
  webRTCData?: any // Dữ liệu từ WebRTC có thể tiết lộ kết nối
  virtualDeviceSignatures?: string[] // Dấu hiệu máy ảo hoặc thiết bị giả lập
  timestamp: Date
}
interface RemoteAccessDetectionResult {
  detected: boolean
  score: number
  details: any
  severity: 'low' | 'medium' | 'high'
}
// New schema for violations
interface ViolationRecord {
  session_id: ObjectId
  student_id: ObjectId
  type: string
  details: any
  timestamp: Date
  severity: 'low' | 'medium' | 'high'
}

class ExamSecurityService {
  private remoteAccessSoftwarePatterns = [
    'ultraview',
    'ultraviewer',
    'ultra viewer',
    'uv_',
    'ultravnc',
    'teamviewer',
    'anydesk',
    'ammyy',
    'radmin',
    'logmein',
    'vnc',
    'tightvnc',
    'realvnc',
    'remote desktop',
    'chrome remote',
    'microsoft remote',
    'msrdp',
    'rdp',
    'remote utilities',
    'supremo',
    'joinme',
    'screenconnect',
    'connectwise control',
    'zoho assist',
    'remotepc',
    'splashtop',
    'gotomypc',
    'pcnow',
    'airdroid',
    'aeroadmin',
    'screen sharing',
    'desktop sharing',
    'remote support',
    'remotedesktop',
    'remotesupport',
    'remote-access'
  ]

  // Record a device for an exam session
  async registerDevice(sessionId: string, studentId: string, deviceInfo: any, ipAddress: string): Promise<boolean> {
    try {
      // Check if collection exists, create if not
      await this.ensureCollectionsExist()

      // Store the device information
      await databaseService.db.collection('exam_devices').insertOne({
        session_id: new ObjectId(sessionId),
        student_id: new ObjectId(studentId),
        ...deviceInfo,
        ip_address: ipAddress,
        created_at: new Date()
      })

      // Check for duplicate devices/sessions
      const deviceCount = await databaseService.db.collection('exam_devices').countDocuments({
        fingerprint: deviceInfo.fingerprint,
        session_id: { $ne: new ObjectId(sessionId) },
        created_at: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
      })

      if (deviceCount > 0) {
        // Record this as a potential violation - same device used for multiple exams
        await this.recordViolation(
          sessionId,
          studentId,
          'duplicate_device',
          {
            fingerprint: deviceInfo.fingerprint,
            count: deviceCount
          },
          'low'
        )

        return false
      }

      // Check for multiple IPs for same student in short timeframe
      const ipCount = await databaseService.db.collection('exam_devices').countDocuments({
        student_id: new ObjectId(studentId),
        ip_address: { $ne: ipAddress },
        created_at: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
      })

      if (ipCount > 0) {
        // Record this as a potential violation - multiple IPs
        await this.recordViolation(
          sessionId,
          studentId,
          'multiple_ips',
          {
            current_ip: ipAddress,
            count: ipCount
          },
          'high'
        )

        return false
      }
      const db = databaseService.db
      const collections = await db.listCollections().toArray()
      const collectionNames = collections.map((c) => c.name)

      const requiredCollections = [
        'exam_devices',
        'exam_violations',
        'exam_verifications',
        'exam_remote_access_checks',
        'exam_remote_access_detections'
      ]

      for (const collection of requiredCollections) {
        if (!collectionNames.includes(collection)) {
          await db.createCollection(collection)

          // Create indexes
          if (collection === 'exam_remote_access_checks' || collection === 'exam_remote_access_detections') {
            await db.collection(collection).createIndex({ session_id: 1 })
            await db.collection(collection).createIndex({ student_id: 1 })
            await db.collection(collection).createIndex({ timestamp: 1 })
            await db.collection(collection).createIndex({ detected: 1 })
          }
        }
      }
      return true
    } catch (error) {
      console.error('Error registering device:', error)
      return false
    }
  }

  // Record a violation
  async recordViolation(
    sessionId: string,
    studentId: string,
    type: string,
    details: any,
    severity: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<ViolationRecord> {
    try {
      // Check if collection exists, create if not
      await this.ensureCollectionsExist()

      const violation: ViolationRecord = {
        session_id: new ObjectId(sessionId),
        student_id: new ObjectId(studentId),
        type,
        details,
        severity,
        timestamp: new Date()
      }

      // Insert the violation record
      await databaseService.db.collection('exam_violations').insertOne(violation)

      // Update the session with violation count
      await databaseService.examSessions.updateOne(
        { _id: new ObjectId(sessionId) },
        {
          $inc: { violations: 1 },
          $set: {
            // If it's a high severity violation, reset score to 0
            ...(severity === 'high' ? { score: 0 } : {}),
            updated_at: new Date()
          }
        }
      )

      return violation
    } catch (error) {
      console.error('Error recording violation:', error)
      throw error
    }
  }

  // Verify webcam image (placeholder for actual implementation)
  async verifyWebcamImage(sessionId: string, studentId: string, photoData: string): Promise<boolean> {
    try {
      // In a real implementation, you would:
      // 1. Store the image
      // 2. Possibly use facial recognition to verify student identity
      // 3. Check for multiple people in frame

      // For now, we'll just store a record that verification happened
      await databaseService.db.collection('exam_verifications').insertOne({
        session_id: new ObjectId(sessionId),
        student_id: new ObjectId(studentId),
        type: 'webcam',
        verified: true, // Placeholder, in real system would be result of verification
        timestamp: new Date()
      })

      return true
    } catch (error) {
      console.error('Error verifying webcam image:', error)
      return false
    }
  }

  // Get all violations for a session
  async getSessionViolations(sessionId: string): Promise<ViolationRecord[]> {
    try {
      const violations = await databaseService.db
        .collection('exam_violations')
        .find({ session_id: new ObjectId(sessionId) })
        .sort({ timestamp: -1 })
        .toArray()

      return violations as unknown as ViolationRecord[]
    } catch (error) {
      console.error('Error getting session violations:', error)
      return []
    }
  }

  // Calculate security score (0-100) for a session
  async calculateSecurityScore(sessionId: string): Promise<number> {
    try {
      const violations = await this.getSessionViolations(sessionId)

      if (violations.length === 0) return 100

      // Calculate score based on number and severity of violations
      let penaltyPoints = 0

      for (const violation of violations) {
        switch (violation.severity) {
          case 'low':
            penaltyPoints += 5
            break
          case 'medium':
            penaltyPoints += 15
            break
          case 'high':
            penaltyPoints += 30
            break
        }
      }

      // Cap at 100 points penalty
      penaltyPoints = Math.min(penaltyPoints, 100)

      return 100 - penaltyPoints
    } catch (error) {
      console.error('Error calculating security score:', error)
      return 0
    }
  }

  // Determine security level based on exam settings and environmental factors
  async getSecurityLevel(sessionId: string): Promise<'low' | 'medium' | 'high'> {
    return 'high'
  }

  // Ensure collections exist
  private async ensureCollectionsExist(): Promise<void> {
    const db = databaseService.db
    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map((c) => c.name)

    const requiredCollections = ['exam_devices', 'exam_violations', 'exam_verifications']

    for (const collection of requiredCollections) {
      if (!collectionNames.includes(collection)) {
        await db.createCollection(collection)

        // Create indexes
        if (collection === 'exam_devices') {
          await db.collection(collection).createIndex({ session_id: 1 })
          await db.collection(collection).createIndex({ student_id: 1 })
          await db.collection(collection).createIndex({ fingerprint: 1 })
        } else if (collection === 'exam_violations') {
          await db.collection(collection).createIndex({ session_id: 1 })
          await db.collection(collection).createIndex({ student_id: 1 })
          await db.collection(collection).createIndex({ timestamp: 1 })
        } else if (collection === 'exam_verifications') {
          await db.collection(collection).createIndex({ session_id: 1 })
          await db.collection(collection).createIndex({ student_id: 1 })
        }
      }
    }
  }
  // Add these methods to the ExamSecurityService class

  // Register extended device with more detailed device information
  async registerExtendedDevice(sessionId: string, studentId: string, extendedDeviceInfo: any): Promise<boolean> {
    try {
      // Check if collection exists, create if not
      await this.ensureCollectionsExist()

      // Check if we need to create a new collection for extended device info
      const db = databaseService.db
      const collections = await db.listCollections().toArray()
      const collectionNames = collections.map((c) => c.name)

      if (!collectionNames.includes('exam_devices_extended')) {
        await db.createCollection('exam_devices_extended')

        // Create indexes
        await db.collection('exam_devices_extended').createIndex({ session_id: 1 })
        await db.collection('exam_devices_extended').createIndex({ student_id: 1 })
        await db.collection('exam_devices_extended').createIndex({ timestamp: 1 })

        // Create compound index for better query performance
        await db.collection('exam_devices_extended').createIndex({
          student_id: 1,
          session_id: 1
        })
      }

      // Store the extended device information
      await databaseService.db.collection('exam_devices_extended').insertOne({
        session_id: new ObjectId(sessionId),
        student_id: new ObjectId(studentId),
        ...extendedDeviceInfo,
        timestamp: new Date()
      })

      // Also store basic device info using the existing method
      const basicDeviceInfo = {
        fingerprint: extendedDeviceInfo.fingerprint || extendedDeviceInfo.connection_id || 'unknown',
        userAgent: extendedDeviceInfo.userAgent || '',
        screenResolution:
          extendedDeviceInfo.screenWidth && extendedDeviceInfo.screenHeight
            ? `${extendedDeviceInfo.screenWidth}x${extendedDeviceInfo.screenHeight}`
            : '',
        platform: extendedDeviceInfo.platform || '',
        language: extendedDeviceInfo.language || '',
        timezone: extendedDeviceInfo.timezone || ''
      }

      // Use the existing method to perform standard checks
      return await this.registerDevice(sessionId, studentId, basicDeviceInfo, extendedDeviceInfo.ip_address || '')
    } catch (error) {
      console.error('Error registering extended device:', error)
      return false
    }
  }

  // Evaluate the risk score of a device (0-100)
  async evaluateDeviceRisk(sessionId: string, studentId: string, deviceInfo: any): Promise<number> {
    try {
      let riskScore = 0

      // 1. Check for emulator/virtual device signs
      if (this.isEmulatorOrVirtualDevice(deviceInfo)) {
        riskScore += 30
      }

      // 2. Check for developer mode indicators
      if (this.hasDeveloperModeIndicators(deviceInfo)) {
        riskScore += 20
      }

      // 3. Check for suspicious browser plugins/extensions
      if (deviceInfo.plugins && this.hasSuspiciousPlugins(deviceInfo.plugins)) {
        riskScore += 15
      }

      // 4. Check for unusual screen resolution
      if (this.hasUnusualScreenResolution(deviceInfo)) {
        riskScore += 10
      }

      // 5. Check geographical consistency
      const locationRisk = await this.checkLocationConsistency(studentId, deviceInfo)
      riskScore += locationRisk

      // 6. Check time consistency
      const timeRisk = await this.checkTimeConsistency(studentId, deviceInfo)
      riskScore += timeRisk

      // 7. Check for VPN/proxy usage
      if (deviceInfo.ip_address && (await this.isVpnOrProxy(deviceInfo.ip_address))) {
        riskScore += 25
      }

      // 8. Check browser fingerprint history
      const fingerprintRisk = await this.checkFingerprintHistory(studentId, deviceInfo)
      riskScore += fingerprintRisk

      // Cap risk score at 100
      return Math.min(riskScore, 100)
    } catch (error) {
      console.error('Error evaluating device risk:', error)
      return 50 // Return middle risk on error
    }
  }

  // Helper methods for risk evaluation

  private isEmulatorOrVirtualDevice(deviceInfo: any): boolean {
    const userAgent = deviceInfo.userAgent?.toLowerCase() || ''
    const emulatorIndicators = [
      'android emulator',
      'sdk_gphone',
      'generic',
      'goldfish',
      'ranchu',
      'vbox',
      'virtual',
      'vmware',
      'xen'
    ]

    // Check user agent for emulator signs
    if (emulatorIndicators.some((indicator) => userAgent.includes(indicator))) {
      return true
    }

    // Check unusual hardware properties
    if (deviceInfo.deviceMemory && deviceInfo.deviceMemory > 16) {
      return true
    }

    // Check unusual hardware concurrency
    if (deviceInfo.hardwareConcurrency && deviceInfo.hardwareConcurrency > 32) {
      return true
    }

    return false
  }

  private hasDeveloperModeIndicators(deviceInfo: any): boolean {
    // Check for debug flags in user agent or other parameters
    const userAgent = deviceInfo.userAgent?.toLowerCase() || ''

    // Look for debug/dev mode indicators
    if (userAgent.includes('debug') || userAgent.includes('development') || deviceInfo.webdriver === true) {
      return true
    }

    return false
  }

  private hasSuspiciousPlugins(plugins: any[]): boolean {
    const suspiciousPluginKeywords = [
      'hack',
      'cheat',
      'proxy',
      'vpn',
      'anonymizer',
      'screen capture',
      'screenshot',
      'recorder',
      'automation'
    ]

    for (const plugin of plugins) {
      const pluginName = (plugin.name || '').toLowerCase()
      if (suspiciousPluginKeywords.some((keyword) => pluginName.includes(keyword))) {
        return true
      }
    }

    return false
  }

  private hasUnusualScreenResolution(deviceInfo: any): boolean {
    // Check for unusual screen dimensions
    const width = deviceInfo.screenWidth || 0
    const height = deviceInfo.screenHeight || 0

    // Extremely high or low resolutions
    if (width > 7680 || height > 4320) {
      return true
    }

    // Check for unusual aspect ratios
    if (width > 0 && height > 0) {
      const aspectRatio = width / height
      if (aspectRatio < 0.5 || aspectRatio > 3) {
        return true
      }
    }

    // Check for non-standard resolutions
    const standardResolutions = [
      // Mobile
      [320, 480],
      [375, 667],
      [390, 844],
      [414, 896],
      [428, 926],
      // Tablet
      [768, 1024],
      [810, 1080],
      [834, 1112],
      [1024, 1366],
      // Desktop
      [1280, 720],
      [1366, 768],
      [1440, 900],
      [1536, 864],
      [1680, 1050],
      [1920, 1080],
      [2560, 1440],
      [3840, 2160]
    ]

    // Allow some flexibility in resolution (±10%)
    const isNearStandard = standardResolutions.some(([stdWidth, stdHeight]) => {
      const widthDiff = Math.abs(width - stdWidth) / stdWidth
      const heightDiff = Math.abs(height - stdHeight) / stdHeight
      return widthDiff <= 0.1 && heightDiff <= 0.1
    })

    // If it's not close to any standard resolution
    return !isNearStandard
  }

  private async checkLocationConsistency(studentId: string, deviceInfo: any): Promise<number> {
    try {
      // Get previous device records for this student
      const previousDevices = await databaseService.db
        .collection('exam_devices')
        .find({
          student_id: new ObjectId(studentId),
          created_at: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
        })
        .toArray()

      // If no previous devices, return low risk
      if (previousDevices.length === 0) {
        return 0
      }

      // Check timezone consistency
      const currentTimezone = deviceInfo.timezone || ''
      const hasTimezoneChange = previousDevices.some(
        (device) => device.timezone && device.timezone !== currentTimezone && currentTimezone !== ''
      )

      if (hasTimezoneChange) {
        return 15 // Timezone change is suspicious
      }

      return 0
    } catch (error) {
      console.error('Error checking location consistency:', error)
      return 5 // Default to low risk on error
    }
  }

  private async checkTimeConsistency(studentId: string, deviceInfo: any): Promise<number> {
    try {
      // Get the student's typical exam taking times
      const examSessions = await databaseService.examSessions
        .find({ student_id: new ObjectId(studentId) })
        .sort({ created_at: -1 })
        .limit(10)
        .toArray()

      if (examSessions.length < 3) {
        return 0 // Not enough data for time pattern analysis
      }

      // Extract hours of day from previous sessions
      const sessionHours = examSessions.map((session) => new Date(session.created_at).getHours())

      // Get current hour
      const currentHour = new Date().getHours()

      // Check if current hour is outside the student's normal pattern
      // (simple check: if none of the previous sessions were at this hour)
      if (!sessionHours.includes(currentHour)) {
        return 10
      }

      return 0
    } catch (error) {
      console.error('Error checking time consistency:', error)
      return 0
    }
  }

  private async isVpnOrProxy(ipAddress: string): Promise<boolean> {
    // This would ideally call an IP intelligence API
    // For now, implement a basic check or connect to a 3rd party API

    // Placeholder implementation - would be replaced with actual API call
    const suspiciousIpRanges = [
      '64.', // Some known VPN ranges
      '148.22',
      '51.254',
      '191.101'
    ]

    return suspiciousIpRanges.some((range) => ipAddress.startsWith(range))
  }

  private async checkFingerprintHistory(studentId: string, deviceInfo: any): Promise<number> {
    try {
      // If no fingerprint provided, return moderate risk
      if (!deviceInfo.fingerprint) {
        return 10
      }

      // Check how many different students have used this fingerprint
      const usersWithSameFingerprint = await databaseService.db.collection('exam_devices').distinct('student_id', {
        fingerprint: deviceInfo.fingerprint,
        created_at: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
      })

      if (usersWithSameFingerprint.length > 1) {
        // Multiple students using the same device is suspicious
        return 25
      }

      return 0
    } catch (error) {
      console.error('Error checking fingerprint history:', error)
      return 5
    }
  }
  async detectRemoteAccessSoftware(
    sessionId: string,
    studentId: string,
    remoteAccessData: RemoteAccessData
  ): Promise<RemoteAccessDetectionResult> {
    try {
      // Đảm bảo collection tồn tại
      await this.ensureCollectionsExist()

      // Lưu dữ liệu vào database để phân tích sau
      await databaseService.db.collection('exam_remote_access_checks').insertOne({
        session_id: new ObjectId(sessionId),
        student_id: new ObjectId(studentId),
        data: remoteAccessData,
        timestamp: new Date()
      })

      let detectionScore = 0
      let detectionDetails: any = {}

      // 1. Kiểm tra tên process
      if (remoteAccessData.processNames && remoteAccessData.processNames.length > 0) {
        const suspiciousProcesses = remoteAccessData.processNames.filter((process) =>
          this.remoteAccessSoftwarePatterns.some((pattern) => process.toLowerCase().includes(pattern))
        )

        if (suspiciousProcesses.length > 0) {
          detectionScore += 60 // Dấu hiệu rất mạnh
          detectionDetails.suspiciousProcesses = suspiciousProcesses
        }
      }

      // 2. Kiểm tra plugin trình duyệt đáng ngờ
      if (remoteAccessData.plugins && remoteAccessData.plugins.length > 0) {
        const suspiciousPlugins = remoteAccessData.plugins.filter((plugin) =>
          this.remoteAccessSoftwarePatterns.some((pattern) => (plugin.name || '').toLowerCase().includes(pattern))
        )

        if (suspiciousPlugins.length > 0) {
          detectionScore += 40 // Dấu hiệu khá mạnh
          detectionDetails.suspiciousPlugins = suspiciousPlugins.map((p) => p.name)
        }
      }

      // 3. Kiểm tra active screen sharing
      if (remoteAccessData.screenSharingActive) {
        detectionScore += 70 // Dấu hiệu rất mạnh
        detectionDetails.screenSharing = true
      }

      // 4. Phân tích dữ liệu WebRTC
      if (remoteAccessData.webRTCData) {
        // Kiểm tra các kết nối không phổ biến, nhiều IP, kết nối trung gian
        const webRTCData = remoteAccessData.webRTCData

        // Kiểm tra nếu có nhiều hơn 2 địa chỉ IP khác nhau
        if (webRTCData.localIPs && webRTCData.localIPs.length > 2) {
          detectionScore += 15
          detectionDetails.multipleIPs = webRTCData.localIPs
        }

        // Kiểm tra loại kết nối
        if (
          webRTCData.connectionType &&
          ['vpn', 'proxy', 'relay', 'virtual'].some((type) => webRTCData.connectionType.toLowerCase().includes(type))
        ) {
          detectionScore += 20
          detectionDetails.suspiciousConnection = webRTCData.connectionType
        }
      }

      // 5. Phân tích mẫu nhập liệu
      if (remoteAccessData.inputPatterns) {
        const patterns = remoteAccessData.inputPatterns

        // Kiểm tra độ trễ nhập liệu bất thường (có thể do điều khiển từ xa)
        if (patterns.averageDelay && patterns.averageDelay > 200) {
          detectionScore += 15
          detectionDetails.unusualInputDelay = patterns.averageDelay
        }

        // Kiểm tra mẫu nhập liệu không tự nhiên
        if (patterns.irregularPattern) {
          detectionScore += 20
          detectionDetails.irregularInputPattern = true
        }
      }

      // 6. Kiểm tra thông tin user agent
      if (remoteAccessData.userAgentData) {
        // Kiểm tra các dấu hiệu bất thường trong user agent
        const userAgentLower = (remoteAccessData.userAgentData.raw || '').toLowerCase()
        if (this.remoteAccessSoftwarePatterns.some((pattern) => userAgentLower.includes(pattern))) {
          detectionScore += 30
          detectionDetails.suspiciousUserAgent = remoteAccessData.userAgentData.raw
        }

        // Kiểm tra nếu platform version quá mới hoặc quá cũ (bất thường)
        if (remoteAccessData.userAgentData.platformVersion) {
          const versionParts = remoteAccessData.userAgentData.platformVersion.split('.')
          if (versionParts.length > 0) {
            const majorVersion = parseInt(versionParts[0])
            // Kiểm tra nếu phiên bản quá cao hoặc quá thấp (giá trị cần điều chỉnh)
            if (majorVersion > 30 || majorVersion < 5) {
              detectionScore += 10
              detectionDetails.suspiciousPlatformVersion = remoteAccessData.userAgentData.platformVersion
            }
          }
        }
      }

      // 7. Kiểm tra dấu hiệu của các thiết bị ảo
      if (remoteAccessData.virtualDeviceSignatures && remoteAccessData.virtualDeviceSignatures.length > 0) {
        const virtualSignatures = [
          'vmware',
          'virtualbox',
          'qemu',
          'xen',
          'parallels',
          'hyperv',
          'virtual machine',
          'emulator',
          'android studio',
          'bluestacks',
          'nox',
          'genymotion',
          'windroy',
          'virtual device'
        ]

        const foundVirtualSignatures = remoteAccessData.virtualDeviceSignatures.filter((sig) =>
          virtualSignatures.some((pattern) => sig.toLowerCase().includes(pattern))
        )

        if (foundVirtualSignatures.length > 0) {
          detectionScore += 25
          detectionDetails.virtualDeviceSignatures = foundVirtualSignatures
        }
      }

      // 8. Kiểm tra window properties bất thường
      if (remoteAccessData.windowProperties) {
        // Kiểm tra các thuộc tính cửa sổ không phổ biến
        const props = remoteAccessData.windowProperties

        // Kiểm tra nếu có các thuộc tính không phổ biến do phần mềm điều khiển từ xa thêm vào
        const suspiciousProps = Object.keys(props).filter((key) =>
          this.remoteAccessSoftwarePatterns.some((pattern) => key.toLowerCase().includes(pattern))
        )

        if (suspiciousProps.length > 0) {
          detectionScore += 35
          detectionDetails.suspiciousWindowProperties = suspiciousProps
        }

        // Kiểm tra kích thước cửa sổ bất thường (có thể do điều khiển từ xa)
        if (props.innerWidth && props.outerWidth && props.innerHeight && props.outerHeight) {
          const widthDiff = props.outerWidth - props.innerWidth
          const heightDiff = props.outerHeight - props.innerHeight

          // Nếu sự khác biệt quá lớn hoặc quá nhỏ (không phổ biến)
          if (widthDiff < 5 || widthDiff > 200 || heightDiff < 30 || heightDiff > 300) {
            detectionScore += 10
            detectionDetails.unusualWindowDimensions = {
              innerWidth: props.innerWidth,
              outerWidth: props.outerWidth,
              innerHeight: props.innerHeight,
              outerHeight: props.outerHeight
            }
          }
        }
      }

      // 9. Kiểm tra chỉ số hiệu suất
      if (remoteAccessData.performanceMetrics) {
        const metrics = remoteAccessData.performanceMetrics

        // Kiểm tra nếu có độ trễ hoạt ảnh cao (có thể do điều khiển từ xa)
        if (metrics.animationDelay && metrics.animationDelay > 100) {
          detectionScore += 15
          detectionDetails.highAnimationDelay = metrics.animationDelay
        }

        // Kiểm tra nếu có độ trễ render cao
        if (metrics.renderDelay && metrics.renderDelay > 50) {
          detectionScore += 10
          detectionDetails.highRenderDelay = metrics.renderDelay
        }

        // Kiểm tra nếu có frameRate thấp bất thường
        if (metrics.frameRate && metrics.frameRate < 30) {
          detectionScore += 15
          detectionDetails.lowFrameRate = metrics.frameRate
        }
      }

      // Xác định mức độ nghiêm trọng dựa trên điểm số
      let severity: 'low' | 'medium' | 'high' = 'low'

      if (detectionScore >= 60) {
        severity = 'high'
      } else if (detectionScore >= 30) {
        severity = 'medium'
      }

      // Ghi lại kết quả phát hiện vào cơ sở dữ liệu
      if (detectionScore > 0) {
        await databaseService.db.collection('exam_remote_access_detections').insertOne({
          session_id: new ObjectId(sessionId),
          student_id: new ObjectId(studentId),
          score: detectionScore,
          details: detectionDetails,
          severity,
          detected: detectionScore >= 30, // Xác định có phát hiện được hay không
          timestamp: new Date()
        })

        // Nếu phát hiện đủ mạnh, ghi lại vi phạm
        if (detectionScore >= 30) {
          await this.recordViolation(
            sessionId,
            studentId,
            'remote_access_detected',
            {
              score: detectionScore,
              details: detectionDetails
            },
            severity as 'low' | 'medium' | 'high'
          )
        }
      }

      return {
        detected: detectionScore >= 30,
        score: detectionScore,
        details: detectionDetails,
        severity
      }
    } catch (error) {
      console.error('Error detecting remote access software:', error)
      return {
        detected: false,
        score: 0,
        details: { error: 'Error during detection process' },
        severity: 'low'
      }
    }
  }
}

const examSecurityService = new ExamSecurityService()
export default examSecurityService
