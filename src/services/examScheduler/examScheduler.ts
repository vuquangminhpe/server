import examService from '../exams.services'

const EXPIRATION_CHECK_INTERVAL = 60 * 1000

/**
 * Start the exam expiration scheduler
 * This will periodically check for exams that have expired and update their status
 */
export const startExamExpirationScheduler = () => {
  console.log('Starting exam expiration scheduler')

  // Initial check
  checkExpiredExams()

  // Set up the interval for regular checks
  setInterval(checkExpiredExams, EXPIRATION_CHECK_INTERVAL)
}

/**
 * Check for expired exams and update their status
 */
async function checkExpiredExams() {
  try {
    const expiredCount = await examService.checkExpiredExams()
    if (expiredCount > 0) {
      console.log(`[${new Date().toISOString()}] Auto-expire check: ${expiredCount} exams marked as expired`)
    }
  } catch (error) {
    console.error('Error in exam expiration check:', error)
  }
}
