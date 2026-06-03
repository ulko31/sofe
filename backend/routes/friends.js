const express = require('express')
const router = express.Router()
const db = require('../db/init')
const auth = require('../middleware/auth')

// GET /api/friends — my friends list
router.get('/', auth, (req, res) => {
  const friends = db.prepare(`
    SELECT u.id, u.name, u.username, u.telegram_id, u.goal, u.calories,
           f.status, f.created_at as friend_since,
           ul.lat, ul.lng, ul.share_location, ul.updated_at as location_updated
    FROM friendships f
    JOIN users u ON (
      CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END = u.id
    )
    LEFT JOIN user_locations ul ON ul.user_id = u.id
    WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'
    ORDER BY u.name
  `).all(req.user.id, req.user.id, req.user.id)
  res.json(friends)
})

// GET /api/friends/requests — incoming requests
router.get('/requests', auth, (req, res) => {
  const requests = db.prepare(`
    SELECT u.id, u.name, u.username, u.telegram_id, f.id as friendship_id, f.created_at
    FROM friendships f
    JOIN users u ON f.user_id = u.id
    WHERE f.friend_id = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all(req.user.id)
  res.json(requests)
})

// POST /api/friends/invite — generate invite link
router.post('/invite', auth, (req, res) => {
  const token = Buffer.from(`${req.user.id}:${Date.now()}`).toString('base64url')
  res.json({
    token,
    link: `https://t.me/${process.env.BOT_USERNAME || 'sofe_bot'}?start=friend_${token}`,
    text: `Привет! Я использую SOFE — приложение для здоровья и питания. Присоединяйся и будем следить за прогрессом вместе! 🌸`
  })
})

// POST /api/friends/accept-invite — accept via invite token
router.post('/accept-invite', auth, (req, res) => {
  const { token } = req.body
  if (!token) return res.status(400).json({ error: 'Token required' })

  try {
    const decoded = Buffer.from(token, 'base64url').toString()
    const [inviterId] = decoded.split(':')
    const inviterIdInt = parseInt(inviterId)

    if (inviterIdInt === req.user.id) {
      return res.status(400).json({ error: 'Cannot add yourself' })
    }

    const inviter = db.prepare('SELECT * FROM users WHERE id = ?').get(inviterIdInt)
    if (!inviter) return res.status(404).json({ error: 'User not found' })

    // Check if already friends
    const existing = db.prepare(`
      SELECT * FROM friendships
      WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
    `).get(req.user.id, inviterIdInt, inviterIdInt, req.user.id)

    if (existing?.status === 'accepted') {
      return res.json({ already_friends: true, friend: inviter })
    }

    if (existing) {
      db.prepare("UPDATE friendships SET status = 'accepted' WHERE id = ?").run(existing.id)
    } else {
      db.prepare("INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, 'accepted')")
        .run(inviterIdInt, req.user.id)
    }

    res.json({ success: true, friend: { id: inviter.id, name: inviter.name, username: inviter.username } })
  } catch(e) {
    res.status(400).json({ error: 'Invalid token' })
  }
})

// POST /api/friends/request — send friend request by telegram_id
router.post('/request', auth, (req, res) => {
  const { telegram_id } = req.body
  if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' })

  const target = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(String(telegram_id))
  if (!target) return res.status(404).json({ error: 'User not found in SOFE' })
  if (target.id === req.user.id) return res.status(400).json({ error: 'Cannot add yourself' })

  const existing = db.prepare(`
    SELECT * FROM friendships
    WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
  `).get(req.user.id, target.id, target.id, req.user.id)

  if (existing) return res.json({ existing: true, status: existing.status })

  db.prepare("INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, 'pending')")
    .run(req.user.id, target.id)

  res.json({ success: true, target: { id: target.id, name: target.name } })
})

// PUT /api/friends/:id/accept
router.put('/:id/accept', auth, (req, res) => {
  const f = db.prepare('SELECT * FROM friendships WHERE id = ? AND friend_id = ?').get(req.params.id, req.user.id)
  if (!f) return res.status(404).json({ error: 'Request not found' })
  db.prepare("UPDATE friendships SET status = 'accepted' WHERE id = ?").run(req.params.id)
  res.json({ ok: true })
})

// DELETE /api/friends/:id
router.delete('/:id', auth, (req, res) => {
  db.prepare(`
    DELETE FROM friendships
    WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
  `).run(req.user.id, req.params.id, req.params.id, req.user.id)
  res.json({ ok: true })
})

// POST /api/friends/location — update my location
router.post('/location', auth, (req, res) => {
  const { lat, lng, share } = req.body
  db.prepare(`
    INSERT INTO user_locations (user_id, lat, lng, share_location, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      lat = ?, lng = ?, share_location = ?, updated_at = datetime('now')
  `).run(req.user.id, lat, lng, share ? 1 : 0, lat, lng, share ? 1 : 0)
  res.json({ ok: true })
})

// POST /api/friends/invite-event — invite friend to event
router.post('/invite-event', auth, (req, res) => {
  const { friend_id, event_id, event_title, event_date, event_time, event_location } = req.body
  const friend = db.prepare('SELECT * FROM users WHERE id = ?').get(friend_id)
  if (!friend) return res.status(404).json({ error: 'Friend not found' })

  // Store notification (will be sent by bot)
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS notifications_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER, type TEXT, data TEXT,
      sent INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
    )`)
  } catch(e) {}

  db.prepare(`INSERT INTO notifications_queue (user_id, type, data) VALUES (?, ?, ?)`)
    .run(friend_id, 'event_invite', JSON.stringify({
      from_name: req.user.name || 'Подруга',
      event_title, event_date, event_time, event_location
    }))

  res.json({ ok: true })
})

module.exports = router
