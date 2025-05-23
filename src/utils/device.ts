interface DeviceInfo {
  device_type: 'desktop' | 'mobile' | 'tablet' | 'unknown'
  browser: string
  os: string
  likely_has_camera: boolean
  is_mobile: boolean
  is_tablet: boolean
  is_desktop: boolean
}

/**
 * Parse user agent to extract device information
 */
export function parseUserAgent(userAgent: string): DeviceInfo {
  const ua = userAgent.toLowerCase()

  // Initialize result
  const result: DeviceInfo = {
    device_type: 'unknown',
    browser: 'unknown',
    os: 'unknown',
    likely_has_camera: false,
    is_mobile: false,
    is_tablet: false,
    is_desktop: false
  }

  // Detect OS
  if (ua.includes('windows')) {
    result.os = 'Windows'
  } else if (ua.includes('mac')) {
    result.os = 'macOS'
  } else if (ua.includes('linux')) {
    result.os = 'Linux'
  } else if (ua.includes('android')) {
    result.os = 'Android'
  } else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) {
    result.os = 'iOS'
  }

  // Detect browser
  if (ua.includes('chrome') && !ua.includes('edg')) {
    result.browser = 'Chrome'
  } else if (ua.includes('firefox')) {
    result.browser = 'Firefox'
  } else if (ua.includes('safari') && !ua.includes('chrome')) {
    result.browser = 'Safari'
  } else if (ua.includes('edg')) {
    result.browser = 'Edge'
  } else if (ua.includes('opera')) {
    result.browser = 'Opera'
  }

  // Detect device type
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    result.device_type = 'mobile'
    result.is_mobile = true
    result.likely_has_camera = true // Most mobile devices have cameras
  } else if (ua.includes('tablet') || ua.includes('ipad')) {
    result.device_type = 'tablet'
    result.is_tablet = true
    result.likely_has_camera = true // Most tablets have cameras
  } else if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider')) {
    result.device_type = 'unknown'
    result.likely_has_camera = false // Bots don't have cameras
  } else {
    result.device_type = 'desktop'
    result.is_desktop = true
    // Desktop camera detection is tricky - many laptops have cameras, desktops often don't
    result.likely_has_camera = ua.includes('laptop') || result.os === 'macOS' // Macs usually have cameras
  }

  return result
}

/**
 * Validate screen resolution format
 */
export function isValidScreenResolution(resolution: string): boolean {
  const pattern = /^\d{3,4}x\d{3,4}$/
  return pattern.test(resolution)
}

/**
 * Parse screen resolution
 */
export function parseScreenResolution(resolution: string): { width: number; height: number } | null {
  if (!isValidScreenResolution(resolution)) {
    return null
  }

  const [width, height] = resolution.split('x').map(Number)
  return { width, height }
}

/**
 * Determine if device likely supports camera based on multiple factors
 */
export function assessCameraCapability(deviceInfo: {
  user_agent?: string
  screen_resolution?: string
  device_type?: string
}): {
  likely_has_camera: boolean
  confidence: 'high' | 'medium' | 'low'
  reasons: string[]
} {
  const reasons: string[] = []
  let score = 0

  // Parse user agent if provided
  let parsedUA: DeviceInfo | null = null
  if (deviceInfo.user_agent) {
    parsedUA = parseUserAgent(deviceInfo.user_agent)
  }

  // Device type assessment
  if (deviceInfo.device_type === 'mobile') {
    score += 8
    reasons.push('Mobile devices typically have cameras')
  } else if (deviceInfo.device_type === 'tablet') {
    score += 7
    reasons.push('Tablet devices typically have cameras')
  } else if (deviceInfo.device_type === 'desktop') {
    score += 2
    reasons.push('Desktop devices may or may not have cameras')
  }

  // User agent assessment
  if (parsedUA) {
    if (parsedUA.is_mobile) {
      score += 6
      reasons.push('User agent indicates mobile device')
    } else if (parsedUA.is_tablet) {
      score += 5
      reasons.push('User agent indicates tablet device')
    }

    if (parsedUA.os === 'iOS') {
      score += 7
      reasons.push('iOS devices typically have cameras')
    } else if (parsedUA.os === 'Android') {
      score += 6
      reasons.push('Android devices typically have cameras')
    } else if (parsedUA.os === 'macOS') {
      score += 5
      reasons.push('macOS devices often have built-in cameras')
    }
  }

  // Screen resolution assessment (mobile/tablet typically have lower resolution)
  if (deviceInfo.screen_resolution) {
    const resolution = parseScreenResolution(deviceInfo.screen_resolution)
    if (resolution) {
      const totalPixels = resolution.width * resolution.height
      if (totalPixels < 1920 * 1080) {
        score += 3
        reasons.push('Lower screen resolution suggests mobile/tablet device')
      }
    }
  }

  // Determine confidence and result
  let confidence: 'high' | 'medium' | 'low'
  let likely_has_camera: boolean

  if (score >= 10) {
    likely_has_camera = true
    confidence = 'high'
  } else if (score >= 6) {
    likely_has_camera = true
    confidence = 'medium'
  } else if (score >= 3) {
    likely_has_camera = false
    confidence = 'medium'
  } else {
    likely_has_camera = false
    confidence = 'low'
  }

  return {
    likely_has_camera,
    confidence,
    reasons
  }
}

/**
 * Generate device fingerprint for tracking
 */
export function generateDeviceFingerprint(deviceInfo: {
  user_agent?: string
  screen_resolution?: string
  device_type?: string
  timezone?: string
  language?: string
}): string {
  const parts = [
    deviceInfo.user_agent || 'unknown',
    deviceInfo.screen_resolution || 'unknown',
    deviceInfo.device_type || 'unknown',
    deviceInfo.timezone || 'unknown',
    deviceInfo.language || 'unknown'
  ]

  // Simple hash function
  let hash = 0
  const combined = parts.join('|')

  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32-bit integer
  }

  return Math.abs(hash).toString(36)
}

/**
 * Check if browser supports camera API
 */
export function checkBrowserCameraSupport(userAgent: string): {
  supports_camera: boolean
  api_available: string[]
  limitations: string[]
} {
  const ua = userAgent.toLowerCase()
  const result = {
    supports_camera: false,
    api_available: [] as string[],
    limitations: [] as string[]
  }

  // Modern browsers support
  if (ua.includes('chrome') && !ua.includes('edg')) {
    result.supports_camera = true
    result.api_available.push('getUserMedia', 'MediaDevices')
  } else if (ua.includes('firefox')) {
    result.supports_camera = true
    result.api_available.push('getUserMedia', 'MediaDevices')
  } else if (ua.includes('safari')) {
    result.supports_camera = true
    result.api_available.push('getUserMedia')
    result.limitations.push('Requires user interaction to access camera')
  } else if (ua.includes('edg')) {
    result.supports_camera = true
    result.api_available.push('getUserMedia', 'MediaDevices')
  } else if (ua.includes('opera')) {
    result.supports_camera = true
    result.api_available.push('getUserMedia')
  }

  // Check for old browsers
  if (ua.includes('msie') || ua.includes('trident')) {
    result.supports_camera = false
    result.limitations.push('Internet Explorer does not support modern camera APIs')
  }

  // Check for bot/crawler
  if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider')) {
    result.supports_camera = false
    result.limitations.push('Automated browsers/bots do not support camera access')
  }

  return result
}

/**
 * Suggest fallback options when camera is not available
 */
export function getCameraFallbackOptions(deviceInfo: DeviceInfo): {
  suggested_actions: string[]
  alternative_verification: string[]
  help_text: string
} {
  const result = {
    suggested_actions: [] as string[],
    alternative_verification: [] as string[],
    help_text: ''
  }

  if (deviceInfo.is_mobile || deviceInfo.is_tablet) {
    result.suggested_actions.push(
      'Kiểm tra quyền truy cập camera trong cài đặt trình duyệt',
      'Thử làm mới trang và cho phép quyền camera khi được hỏi',
      'Đảm bảo không có ứng dụng khác đang sử dụng camera'
    )
    result.help_text = 'Thiết bị di động của bạn thường có camera. Vui lòng kiểm tra cài đặt quyền.'
  } else {
    result.suggested_actions.push(
      'Kiểm tra xem máy tính có webcam không',
      'Kết nối webcam ngoài nếu cần thiết',
      'Kiểm tra quyền truy cập camera trong cài đặt trình duyệt',
      'Thử sử dụng thiết bị di động có camera'
    )
    result.help_text = 'Máy tính của bạn có thể không có camera. Vui lòng kết nối webcam hoặc sử dụng thiết bị khác.'
  }

  result.alternative_verification.push(
    'Liên hệ giáo viên để được hỗ trợ',
    'Sử dụng thiết bị khác có camera',
    'Tham gia phòng thi có giám sát trực tiếp'
  )

  return result
}
