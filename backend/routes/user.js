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

  // If new user from onboarding
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

module.exports = router
