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

// GET /api/nutrition/today
router.get('/today', auth, async (req, res) => {
  const today = new Date().toISOString().split('T')[0]
  try {
    const user = await qOne('SELECT * FROM users WHERE id = ?', [req.user.id])
    const meals = await q('SELECT * FROM meals WHERE user_id = ? AND date = ?', [req.user.id, today])
    const consumed = meals.reduce((s, m) => s + (m.calories || 0), 0)
    const protein = meals.reduce((s, m) => s + (m.protein || 0), 0)
    const fat = meals.reduce((s, m) => s + (m.fat || 0), 0)
    const carbs = meals.reduce((s, m) => s + (m.carbs || 0), 0)
    res.json({ consumed, goal: user?.calories || 2000, protein, fat, carbs })
  } catch(e) { res.status(500).json({ error: e.message }) }
})

// GET /api/nutrition/meals
router.get('/meals', auth, async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0]
  try {
    const meals = await q('SELECT * FROM meals WHERE user_id = ? AND date = ? ORDER BY created_at', [req.user.id, date])
    res.json(meals)
  } catch(e) { res.status(500).json({ error: e.message }) }
})

// POST /api/nutrition/meals
router.post('/meals', auth, async (req, res) => {
  const { name, calories, protein, fat, carbs, type, date } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  try {
    const result = await r(
      'INSERT INTO meals (user_id, name, calories, protein, fat, carbs, type, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, name, calories || 0, protein || 0, fat || 0, carbs || 0, type || 'snack', date || new Date().toISOString().split('T')[0]]
    )
    const meal = await qOne('SELECT * FROM meals WHERE id = ?', [result.lastInsertRowid])
    res.json(meal)
  } catch(e) { res.status(500).json({ error: e.message }) }
})

// DELETE /api/nutrition/meals/:id
router.delete('/meals/:id', auth, async (req, res) => {
  try {
    await r('DELETE FROM meals WHERE id = ? AND user_id = ?', [req.params.id, req.user.id])
    res.json({ ok: true })
  } catch(e) { res.status(500).json({ error: e.message }) }
})

// GET /api/nutrition/history
router.get('/history', auth, async (req, res) => {
  const days = parseInt(req.query.days) || 7
  const result = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    try {
      const meals = await q('SELECT * FROM meals WHERE user_id = ? AND date = ?', [req.user.id, dateStr])
      const consumed = meals.reduce((s, m) => s + (m.calories || 0), 0)
      const protein = meals.reduce((s, m) => s + (m.protein || 0), 0)
      const fat = meals.reduce((s, m) => s + (m.fat || 0), 0)
      const carbs = meals.reduce((s, m) => s + (m.carbs || 0), 0)
      result.push({ date: dateStr, consumed: Math.round(consumed), protein: Math.round(protein), fat: Math.round(fat), carbs: Math.round(carbs) })
    } catch(e) {
      result.push({ date: dateStr, consumed: 0, protein: 0, fat: 0, carbs: 0 })
    }
  }
  res.json(result)
})

module.exports = router
