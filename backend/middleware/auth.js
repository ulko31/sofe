const { queryOne, run } = require('../db/turso')
const { validateInitData } = require('../utils/telegramAuth')

module.exports = async function auth(req, res, next) {
  try {
    const initData = req.headers['x-telegram-init-data'] || ''
    if (!initData) return res.status(401).json({ error: 'No auth' })

    if (!process.env.BOT_TOKEN) return res.status(503).json({ error: 'Auth not configured' })
    const tgUser = validateInitData(initData, process.env.BOT_TOKEN)
    if (!tgUser) return res.status(401).json({ error: 'Invalid or expired Telegram session' })

    let user = await queryOne('SELECT * FROM users WHERE telegram_id = ?', [String(tgUser.id)])

    if (!user) {
      const result = await run(
        'INSERT INTO users (telegram_id, name, username) VALUES (?, ?, ?)',
        [String(tgUser.id), tgUser.first_name || '', tgUser.username || '']
      )
      user = await queryOne('SELECT * FROM users WHERE id = ?', [result.lastInsertRowid])
    }

    req.user = user
    req.tgUser = tgUser
    next()
  } catch(e) {
    console.error('Auth error:', e.message)
    res.status(500).json({ error: 'Server error' })
  }
}
