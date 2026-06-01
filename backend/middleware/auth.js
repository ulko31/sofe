const crypto = require('crypto')
const db = require('../db/init')

function validateTelegramData(initData, botToken) {
  try {
    const params = new URLSearchParams(initData)
    const hash = params.get('hash')
    params.delete('hash')

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
    const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

    return hash === expectedHash
  } catch {
    return false
  }
}

function getOrCreateUser(telegramUser) {
  const existing = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(String(telegramUser.id))
  if (existing) return existing

  const result = db.prepare(
    'INSERT INTO users (telegram_id, name, username) VALUES (?, ?, ?)'
  ).run(String(telegramUser.id), telegramUser.first_name, telegramUser.username || null)

  return db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid)
}

module.exports = function authMiddleware(req, res, next) {
  // Dev mode — skip auth if no token
  if (process.env.NODE_ENV === 'development' && !req.headers['x-telegram-init-data']) {
    req.user = db.prepare('SELECT * FROM users LIMIT 1').get() || { id: 1, telegram_id: 'dev', name: 'Dev User' }
    return next()
  }

  const initData = req.headers['x-telegram-init-data']
  if (!initData) return res.status(401).json({ error: 'No Telegram auth' })

  const isValid = validateTelegramData(initData, process.env.BOT_TOKEN)
  if (!isValid) return res.status(401).json({ error: 'Invalid Telegram auth' })

  const params = new URLSearchParams(initData)
  const userStr = params.get('user')
  if (!userStr) return res.status(401).json({ error: 'No user data' })

  const telegramUser = JSON.parse(userStr)
  req.user = getOrCreateUser(telegramUser)
  next()
}
