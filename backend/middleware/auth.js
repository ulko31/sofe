const { queryOne, run } = require('../db/turso')

module.exports = async function auth(req, res, next) {
  try {
    const initData = req.headers['x-telegram-init-data'] || ''
    if (!initData) return res.status(401).json({ error: 'No auth' })

    const params = new URLSearchParams(initData)
    const userStr = params.get('user')
    if (!userStr) return res.status(401).json({ error: 'No user' })

    let tgUser
    try { tgUser = JSON.parse(decodeURIComponent(userStr)) }
    catch(e) { try { tgUser = JSON.parse(userStr) } catch(e2) { return res.status(401).json({ error: 'Bad user data' }) } }

    if (!tgUser?.id) return res.status(401).json({ error: 'No user id' })

    let user = await queryOne('SELECT * FROM users WHERE telegram_id = ?', [String(tgUser.id)])

    if (!user) {
      const result = await run(
        'INSERT INTO users (telegram_id, name, username, notifications_enabled, notify_water, notify_meals, notify_events, notify_morning) VALUES (?, ?, ?, 0, 0, 0, 0, 0)',
        [String(tgUser.id), tgUser.first_name || '', tgUser.username || '']
      )
      user = await queryOne('SELECT * FROM users WHERE id = ?', [result.lastInsertRowid])
    }

    // Opening the mini app always calls an authenticated endpoint. Recording it
    // here makes activity independent from meal entries and other user actions.
    try {
      await run("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?", [user.id])
      user.last_seen_at = new Date().toISOString()
    } catch (activityError) {
      // During a fresh deploy the schema migration can finish a moment later.
      // Authentication should still succeed; the next request will be tracked.
      console.warn('Activity tracking is not ready:', activityError.message)
    }

    req.user = user
    req.tgUser = tgUser
    next()
  } catch(e) {
    console.error('Auth error:', e.message)
    res.status(500).json({ error: 'Server error: ' + e.message })
  }
}
