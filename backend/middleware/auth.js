require('dotenv').config()
const crypto = require('crypto')

let turso
try {
  if (process.env.TURSO_URL) turso = require('../db/turso')
} catch(e) {}

module.exports = async function auth(req, res, next) {
  try {
    const initData = req.headers['x-telegram-init-data'] || ''
    if (!initData) return res.status(401).json({ error: 'No auth' })

    const params = new URLSearchParams(initData)
    const hash = params.get('hash')
    params.delete('hash')
    const dataCheckString = [...params.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`).join('\n')
    const secret = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN || '').digest()
    const expectedHash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex')

    const userStr = params.get('user')
    if (!userStr) return res.status(401).json({ error: 'No user' })
    const tgUser = JSON.parse(userStr)

    if (!turso) return res.status(500).json({ error: 'DB not configured' })

    // Find or create user
    let user = await turso.queryOne('SELECT * FROM users WHERE telegram_id = ?', [String(tgUser.id)])
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
