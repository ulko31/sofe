import { handleSchedule } from '@vercel/schedules'

export const POST = handleSchedule(async () => {
  const backendUrl = process.env.SOFE_BACKEND_URL || 'https://sofe-1615.onrender.com'

  const health = await fetch(`${backendUrl}/api/health`, {
    headers: { 'user-agent': 'sofe-notification-scheduler/1.0' },
    signal: AbortSignal.timeout(55000)
  })

  if (!health.ok) {
    throw new Error(`SOFE backend health check failed with ${health.status}`)
  }
})
