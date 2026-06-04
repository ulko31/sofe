require('dotenv').config()
const express = require('express')
const router = express.Router()
const auth = require('../middleware/auth')

let db, turso
try {
  if (process.env.TURSO_URL) turso = require('../db/turso')
  else db = require('../db/init')
} catch(e) { db = require('../db/init') }

async function q(sql, args = []) {
  if (turso) return turso.query(sql, args)
  return db.prepare(sql).all(...args)
}
async function qOne(sql, args = []) {
  if (turso) return turso.queryOne(sql, args)
  return db.prepare(sql).get(...args)
}
async function r(sql, args = []) {
  if (turso) return turso.run(sql, args)
  return db.prepare(sql).run(...args)
}

// GET /api/user/me
router.get('/me', auth, async (req, res) => {
  res.json({ user: req.user })
})

// PUT /api/user/profile
router.put('/profile', auth, async (req, res) => {
  const { name, calories, goal, activity, onboarded, telegram_id, age, weight, height, gender } = req.body
  try {
    await r(`UPDATE users SET
      name = COALESCE(?, name),
      calories = COALESCE(?, calories),
      goal = COALESCE(?, goal),
      activity = COALESCE(?, activity),
      onboarded = COALESCE(?, onboarded),
      age = COALESCE(?, age),
      weight = COALESCE(?, weight),
      height = COALESCE(?, height),
      gender = COALESCE(?, gender)
      WHERE id = ?`,
      [name || null, calories || null, goal || null, activity || null,
       onboarded ? 1 : null, age || null, weight || null, height || null,
       gender || null, req.user.id])
    const updated = await qOne('SELECT * FROM users WHERE id = ?', [req.user.id])
    res.json({ user: updated })
  } catch(e) { res.status(500).json({ error: e.message }) }
})

// PUT /api/user/notifications
router.put('/notifications', auth, async (req, res) => {
  const { notifications_enabled, notify_water, notify_meals, notify_events, notify_morning } = req.body
  try {
    await r(`UPDATE users SET
      notifications_enabled = ?, notify_water = ?,
      notify_meals = ?, notify_events = ?, notify_morning = ?
      WHERE id = ?`,
      [notifications_enabled ? 1 : 0, notify_water ? 1 : 0,
       notify_meals ? 1 : 0, notify_events ? 1 : 0, notify_morning ? 1 : 0,
       req.user.id])
    res.json({ ok: true })
  } catch(e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
