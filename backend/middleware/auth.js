require('dotenv').config()

let turso
try {
  if (process.env.TURSO_URL) turso = require('../db/turso')
} catch(e) {}

module.exports = async function auth(req, res, next) {
  try {
    const initData = req.headers['x-telegram-init-data'] || ''

    if (!initData) {
      return res.status(401).json({ error: 'No Telegram auth' })
    }

    // Parse user from initData
    const params = new URLSearchParams(initData)
    const userStr = params.get('user')

    if (!userStr) {
      return res.status(401).json({ error: 'No user data' })
    }

    let tgUser
    try {
      tgUser = JSON.parse(decodeURIComponent(userStr))
    } catch(e) {
      try {
        tgUser = JSON.parse(userStr)
      } catch(e2) {
        return res.status(401).json({ error: 'Cannot parse user' })
      }
    }

    if (!tgUser?.id) {
      return res.status(401).json({ error: 'No user id' })
    }

    if (!turso) {
      return res.status(500).json({ error: 'DB not configured' })
    }

    // Find or create user
    let user = await turso.queryOne(
      'SELECT * FROM users WHERE telegram_id = ?',
      [String(tgUser.id)]
    )

    if (!user) {
      const result = await turso.run(
        'INSERT INTO users (telegram_id, name, username) VALUES (?, ?, ?)',
        [String(tgUser.id), tgUser.first_name || '', tgUser.username || '']
      )
      user = await turso.queryOne('SELECT * FROM users WHERE id = ?', [result.lastInsertRowid])
    }

    req.user = user
    req.tgUser = tgUser
    next()
  } catch(e) {
    console.error('Auth error:', e.message)
    res.status(401).json({ error: 'Auth failed' })
  }
}
