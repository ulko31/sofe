const express = require('express')
const router = express.Router()
const db = require('../db/init')
const auth = require('../middleware/auth')

// GET /api/nutrition/today — summary stats
router.get('/today', auth, (req, res) => {
  const today = new Date().toISOString().split('T')[0]
  const user = req.user

  const meals = db.prepare('SELECT * FROM meals WHERE user_id = ? AND date = ?').all(user.id, today)

  const consumed = meals.reduce((s, m) => s + (m.calories || 0), 0)
  const protein = meals.reduce((s, m) => s + (m.protein || 0), 0)
  const fat = meals.reduce((s, m) => s + (m.fat || 0), 0)
  const carbs = meals.reduce((s, m) => s + (m.carbs || 0), 0)

  res.json({
    consumed: Math.round(consumed),
    goal: user.calories || 2000,
    burned: 0,
    protein: Math.round(protein),
    fat: Math.round(fat),
    carbs: Math.round(carbs)
  })
})

// GET /api/nutrition/meals?date=YYYY-MM-DD
router.get('/meals', auth, (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0]
  const meals = db.prepare('SELECT * FROM meals WHERE user_id = ? AND date = ? ORDER BY created_at ASC').all(req.user.id, date)
  res.json(meals)
})

// POST /api/nutrition/meals
router.post('/meals', auth, (req, res) => {
  const { name, calories, protein, fat, carbs, type, date } = req.body
  if (!name) return res.status(400).json({ error: 'Name required' })

  const result = db.prepare(
    'INSERT INTO meals (user_id, name, calories, protein, fat, carbs, type, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, name, calories || 0, protein || 0, fat || 0, carbs || 0, type || 'snack', date || new Date().toISOString().split('T')[0])

  const meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(result.lastInsertRowid)
  res.json(meal)
})

// DELETE /api/nutrition/meals/:id
router.delete('/meals/:id', auth, (req, res) => {
  db.prepare('DELETE FROM meals WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id)
  res.json({ ok: true })
})

module.exports = router
