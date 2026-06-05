require('dotenv').config()
const express = require('express')
const router = express.Router()
const auth = require('../middleware/auth')
const { query: q, queryOne: qOne, run: r, exec } = require('../db/turso')

router.get('/', auth, async (req, res) => {
  try {
    await exec(`CREATE TABLE IF NOT EXISTS friendships (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, friend_id INTEGER NOT NULL, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now')))`)
    await exec(`CREATE TABLE IF NOT EXISTS user_locations (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE, lat REAL, lng REAL, share_location INTEGER DEFAULT 0, updated_at TEXT DEFAULT (datetime('now')))`)
    const friends = await q(`
      SELECT u.id, u.name, u.username, u.telegram_id, u.goal, u.calories,
             f.status, f.id as friendship_id,
             ul.lat, ul.lng, ul.share_location, ul.updated_at as location_updated
      FROM friendships f
      JOIN users u ON (CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END = u.id)
      LEFT JOIN user_locations ul ON ul.user_id = u.id AND ul.share_location = 1
      WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'
      ORDER BY u.name`, [req.user.id, req.user.id, req.user.id])
    res.json(friends)
  } catch(e) { console.error(e); res.json([]) }
})

router.get('/requests', auth, async (req, res) => {
  try {
    const requests = await q(`
      SELECT u.id, u.name, u.username, u.telegram_id, f.id as friendship_id, f.created_at
      FROM friendships f JOIN users u ON f.user_id = u.id
      WHERE f.friend_id = ? AND f.status = 'pending'
      ORDER BY f.created_at DESC`, [req.user.id])
    res.json(requests)
  } catch(e) { res.json([]) }
})

router.post('/invite', auth, async (req, res) => {
  const token = Buffer.from(`${req.user.id}:${Date.now()}`).toString('base64url')
  res.json({
    token,
    link: `https://t.me/${process.env.BOT_USERNAME}?start=friend_${token}`,
    text: `Привет! Я использую SOFE — приложение для здоровья. Присоединяйся! 🌸`
  })
})

router.post('/accept-invite', async (req, res) => {
  const { token } = req.body
  if (!token) return res.status(400).json({ error: 'Token required' })
  // Get current user from auth header
  const initData = req.headers['x-telegram-init-data'] || ''
  let currentUser = null
  try {
    const params = new URLSearchParams(initData)
    const userStr = params.get('user')
    if (userStr) {
      const tgUser = JSON.parse(userStr)
      currentUser = await qOne('SELECT * FROM users WHERE telegram_id = ?', [String(tgUser.id)])
    }
  } catch(e) {}
  if (!currentUser) return res.status(401).json({ error: 'Not authenticated' })

  try {
    const decoded = Buffer.from(token, 'base64url').toString()
    const [inviterId] = decoded.split(':')
    const inviterIdInt = parseInt(inviterId)
    if (inviterIdInt === currentUser.id) return res.status(400).json({ error: 'Cannot add yourself' })
    const inviter = await qOne('SELECT * FROM users WHERE id = ?', [inviterIdInt])
    if (!inviter) return res.status(404).json({ error: 'User not found' })
    const existing = await qOne(
      'SELECT * FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
      [currentUser.id, inviterIdInt, inviterIdInt, currentUser.id])
    if (existing?.status === 'accepted') return res.json({ already_friends: true, friend: inviter })
    if (existing) {
      await r("UPDATE friendships SET status = 'accepted' WHERE id = ?", [existing.id])
    } else {
      await r("INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, 'accepted')", [inviterIdInt, currentUser.id])
    }
    res.json({ success: true, friend: { id: inviter.id, name: inviter.name, username: inviter.username } })
  } catch(e) { res.status(400).json({ error: 'Invalid token: ' + e.message }) }
})

router.post('/request', auth, async (req, res) => {
  const { telegram_id } = req.body
  const target = await qOne('SELECT * FROM users WHERE telegram_id = ?', [String(telegram_id)])
  if (!target) return res.status(404).json({ error: 'User not found' })
  if (target.id === req.user.id) return res.status(400).json({ error: 'Cannot add yourself' })
  const existing = await qOne(
    'SELECT * FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
    [req.user.id, target.id, target.id, req.user.id])
  if (existing) return res.json({ existing: true, status: existing.status })
  await r("INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, 'pending')", [req.user.id, target.id])
  res.json({ success: true })
})

router.put('/:id/accept', auth, async (req, res) => {
  await r("UPDATE friendships SET status = 'accepted' WHERE id = ? AND friend_id = ?", [req.params.id, req.user.id])
  res.json({ ok: true })
})

router.delete('/:id', auth, async (req, res) => {
  await r('DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
    [req.user.id, req.params.id, req.params.id, req.user.id])
  res.json({ ok: true })
})

router.post('/location', auth, async (req, res) => {
  const { lat, lng, share } = req.body
  await exec(`CREATE TABLE IF NOT EXISTS user_locations (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE, lat REAL, lng REAL, share_location INTEGER DEFAULT 0, updated_at TEXT DEFAULT (datetime('now')))`)
  await r(`INSERT INTO user_locations (user_id, lat, lng, share_location, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, share_location = excluded.share_location, updated_at = datetime('now')`,
    [req.user.id, lat || 0, lng || 0, share ? 1 : 0])
  res.json({ ok: true })
})

router.post('/invite-event', auth, async (req, res) => {
  const { friend_id, event_title, event_date, event_time, event_location } = req.body
  await exec(`CREATE TABLE IF NOT EXISTS notifications_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, type TEXT, data TEXT, sent INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`)
  await r('INSERT INTO notifications_queue (user_id, type, data) VALUES (?, ?, ?)',
    [friend_id, 'event_invite', JSON.stringify({ from_name: req.user.name || 'Подруга', event_title, event_date, event_time, event_location })])
  res.json({ ok: true })
})

module.exports = router
