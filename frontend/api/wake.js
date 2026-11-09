export const config = { maxDuration: 60 }

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    return response.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const backendUrl = process.env.SOFE_BACKEND_URL || 'https://sofe-1615.onrender.com'

  try {
    const health = await fetch(`${backendUrl}/api/health`, {
      headers: { 'user-agent': 'sofe-notification-scheduler/1.0' },
      signal: AbortSignal.timeout(55000)
    })

    return response.status(health.ok ? 200 : 502).json({ ok: health.ok })
  } catch (error) {
    return response.status(503).json({ ok: false, error: 'Backend unavailable' })
  }
}
