import { handleSchedule } from '@vercel/schedules'

export const POST = handleSchedule(async () => {
  const backendUrl = process.env.SOFE_BACKEND_URL || 'https://sofe-1615.onrender.com'
  const notificationSecret = process.env.NOTIFICATION_SECRET
  if (!notificationSecret) throw new Error('NOTIFICATION_SECRET is not configured')

  const health = await fetch(`${backendUrl}/api/internal/notifications/run`, {
    method: 'POST',
    headers: {
      'user-agent': 'sofe-notification-scheduler/1.0',
      'x-notification-secret': notificationSecret
    },
    signal: AbortSignal.timeout(55000)
  })

  if (!health.ok) {
    throw new Error(`SOFE backend health check failed with ${health.status}`)
  }
})
