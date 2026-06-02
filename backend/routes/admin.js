const express = require('express')
const router = express.Router()
const db = require('../db/init')

// Simple admin auth middleware
function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token']
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

// GET /api/admin/stats
router.get('/stats', adminAuth, (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt
  const today = new Date().toISOString().split('T')[0]
  const newToday = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE date(created_at) = ?").get(today).cnt
  const totalMeals = db.prepare('SELECT COUNT(*) as cnt FROM meals').get().cnt
  const activeToday = db.prepare('SELECT COUNT(DISTINCT user_id) as cnt FROM meals WHERE date = ?').get(today).cnt

  const goals = {}
  db.prepare('SELECT goal, COUNT(*) as cnt FROM users GROUP BY goal').all().forEach(r => {
    goals[r.goal] = r.cnt
  })

  const recentUsers = db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT 10').all()

  const upcomingEvents = 0 // managed via events.json

  res.json({ totalUsers, newToday, totalMeals, activeToday, upcomingEvents, goals, recentUsers })
})

// GET /api/admin/users
router.get('/users', adminAuth, (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all()
  res.json({ users })
})

// DELETE /api/admin/users/:id
router.delete('/users/:id', adminAuth, (req, res) => {
  db.prepare('DELETE FROM meals WHERE user_id = ?').run(req.params.id)
  db.prepare('DELETE FROM trackers WHERE user_id = ?').run(req.params.id)
  db.prepare('DELETE FROM subscriptions WHERE user_id = ?').run(req.params.id)
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// GET /api/admin/nutrition
router.get('/nutrition', adminAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0]
  const todayMeals = db.prepare('SELECT COUNT(*) as cnt FROM meals WHERE date = ?').get(today).cnt
  const total = db.prepare('SELECT COUNT(*) as cnt FROM meals').get().cnt

  const avgRow = db.prepare('SELECT AVG(calories) as avg FROM meals').get()
  const avgCalories = Math.round(avgRow.avg || 0)

  const popularRow = db.prepare('SELECT type, COUNT(*) as cnt FROM meals GROUP BY type ORDER BY cnt DESC LIMIT 1').get()
  const typeMap = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус' }
  const popularType = typeMap[popularRow?.type] || '—'

  const recentMeals = db.prepare(`
    SELECT m.*, u.name as user_name FROM meals m
    LEFT JOIN users u ON u.id = m.user_id
    ORDER BY m.created_at DESC LIMIT 20
  `).all()

  res.json({ today: todayMeals, total, avgCalories, popularType, recentMeals })
})

module.exports = router
