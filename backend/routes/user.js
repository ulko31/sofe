const express = require('express')
const router = express.Router()
const db = require('../db/init')
const auth = require('../middleware/auth')

// GET /api/user/me
router.get('/me', auth, (req, res) => {
  res.json({ user: req.user })
})

// PUT /api/user/profile
router.put('/profile', auth, (req, res) => {
  const { name, calories, goal, activity, onboarded, telegram_id } = req.body

  if (telegram_id && !req.user) {
    const existing = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(String(telegram_id))
    if (!existing) {
      db.prepare('INSERT INTO users (telegram_id, name, calories, goal, activity, onboarded) VALUES (?, ?, ?, ?, ?, ?)')
        .run(String(telegram_id), name, calories || 2000, goal, activity, onboarded ? 1 : 0)
    }
  }

  db.prepare(`
    UPDATE users SET
      name = COALESCE(?, name),
      calories = COALESCE(?, calories),
      goal = COALESCE(?, goal),
      activity = COALESCE(?, activity),
      onboarded = COALESCE(?, onboarded)
    WHERE id = ?
  `).run(name || null, calories || null, goal || null, activity || null, onboarded ? 1 : null, req.user.id)

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  res.json({ user: updated })
})

// PUT /api/user/notifications — toggle notifications
router.put('/notifications', auth, (req, res) => {
  const { notifications_enabled, notify_water, notify_meals, notify_events, notify_morning } = req.body

  // Add columns if they don't exist
  try { db.exec('ALTER TABLE users ADD COLUMN notifications_enabled INTEGER DEFAULT 1') } catch(e) {}
  try { db.exec('ALTER TABLE users ADD COLUMN notify_water INTEGER DEFAULT 1') } catch(e) {}
  try { db.exec('ALTER TABLE users ADD COLUMN notify_meals INTEGER DEFAULT 1') } catch(e) {}
  try { db.exec('ALTER TABLE users ADD COLUMN notify_events INTEGER DEFAULT 1') } catch(e) {}
  try { db.exec('ALTER TABLE users ADD COLUMN notify_morning INTEGER DEFAULT 1') } catch(e) {}

  db.prepare(`
    UPDATE users SET
      notifications_enabled = ?,
      notify_water = ?,
      notify_meals = ?,
      notify_events = ?,
      notify_morning = ?
    WHERE id = ?
  `).run(
    notifications_enabled ? 1 : 0,
    notify_water ? 1 : 0,
    notify_meals ? 1 : 0,
    notify_events ? 1 : 0,
    notify_morning ? 1 : 0,
    req.user.id
  )

  res.json({ ok: true })
})

module.exports = router
