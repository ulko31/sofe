const express = require('express')
const router = express.Router()
const db = require('../db/init')
const auth = require('../middleware/auth')

// ── TRACKERS ──────────────────────────────────────────────────
router.get('/trackers', auth, (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0]
  let row = db.prepare('SELECT * FROM trackers WHERE user_id = ? AND date = ?').get(req.user.id, date)
  if (!row) row = { water: 0, steps: 0, sleep: 0, pulse: 72 }
  res.json(row)
})

router.post('/trackers', auth, (req, res) => {
  const { type, value, date } = req.body
  const d = date || new Date().toISOString().split('T')[0]
  const allowed = ['water', 'steps', 'sleep', 'pulse']
  if (!allowed.includes(type)) return res.status(400).json({ error: 'Invalid tracker type' })
  db.prepare(`
    INSERT INTO trackers (user_id, date, ${type}) VALUES (?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET ${type} = ?, updated_at = datetime('now')
  `).run(req.user.id, d, value, value)
  const row = db.prepare('SELECT * FROM trackers WHERE user_id = ? AND date = ?').get(req.user.id, d)
  res.json(row)
})

// ── WORKOUTS ──────────────────────────────────────────────────
router.get('/workouts', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM workouts').all())
})

router.get('/workouts/my', auth, (req, res) => {
  const workouts = db.prepare(`
    SELECT uw.*, w.name, w.type, w.duration, w.level
    FROM user_workouts uw JOIN workouts w ON w.id = uw.workout_id
    WHERE uw.user_id = ? ORDER BY uw.created_at DESC
  `).all(req.user.id)
  res.json(workouts)
})

router.post('/workouts/my', auth, (req, res) => {
  const { workout_id, date } = req.body
  const result = db.prepare('INSERT INTO user_workouts (user_id, workout_id, date) VALUES (?, ?, ?)').run(req.user.id, workout_id, date || new Date().toISOString().split('T')[0])
  res.json({ id: result.lastInsertRowid, workout_id, date })
})

// ── SUBSCRIPTIONS ─────────────────────────────────────────────
router.get('/subscriptions', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').all(req.user.id))
})

router.post('/subscriptions', auth, (req, res) => {
  const { studio, total, expires_at } = req.body
  const result = db.prepare('INSERT INTO subscriptions (user_id, studio, total, expires_at) VALUES (?, ?, ?, ?)').run(req.user.id, studio, total, expires_at || null)
  res.json(db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(result.lastInsertRowid))
})

router.post('/subscriptions/:id/use', auth, (req, res) => {
  db.prepare('UPDATE subscriptions SET used = used + 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id)
  res.json(db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.id))
})

// ── RECIPES ───────────────────────────────────────────────────
router.get('/recipes', auth, (req, res) => {
  const recipes = db.prepare('SELECT * FROM recipes').all()
  res.json(recipes.map(r => ({
    ...r,
    tags: JSON.parse(r.tags || '[]'),
    ingredients: JSON.parse(r.ingredients || '[]'),
    steps: JSON.parse(r.steps || '[]')
  })))
})

router.get('/recipes/:id', auth, (req, res) => {
  const r = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id)
  if (!r) return res.status(404).json({ error: 'Not found' })
  res.json({
    ...r,
    tags: JSON.parse(r.tags || '[]'),
    ingredients: JSON.parse(r.ingredients || '[]'),
    steps: JSON.parse(r.steps || '[]')
  })
})

// ── PROGRESS ──────────────────────────────────────────────────
router.get('/progress', auth, (req, res) => {
  const user = req.user
  const createdAt = new Date(user.created_at || Date.now())
  const days = Math.max(1, Math.floor((Date.now() - createdAt.getTime()) / 86400000))
  res.json({ days, weightLost: 0, goalPct: Math.min(99, days * 2) })
})

module.exports = router
