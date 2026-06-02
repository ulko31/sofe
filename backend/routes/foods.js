const express = require('express')
const router = express.Router()
const db = require('../db/init')
const auth = require('../middleware/auth')

// GET /api/foods/search?q=курица
router.get('/search', auth, (req, res) => {
  const q = (req.query.q || '').trim()
  if (q.length < 1) return res.json([])

  const results = db.prepare(`
    SELECT * FROM foods
    WHERE name LIKE ?
    ORDER BY
      CASE WHEN name LIKE ? THEN 0 ELSE 1 END,
      length(name)
    LIMIT 20
  `).all(`%${q}%`, `${q}%`)

  res.json(results)
})

// GET /api/foods — все продукты (для начального списка)
router.get('/', auth, (req, res) => {
  const foods = db.prepare('SELECT * FROM foods ORDER BY name LIMIT 50').all()
  res.json(foods)
})

module.exports = router
