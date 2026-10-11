const express = require('express')
const router = express.Router()
const auth = require('../middleware/auth')
const { searchReference } = require('../services/foodCatalog')
const { query } = require('../db/turso')
router.get('/search', auth, async (req, res) => {
  const text = typeof req.query.q === 'string' ? req.query.q.trim().slice(0,120) : ''
  if (!text) return res.json([])
  let rows = []
  try { rows = await query('SELECT * FROM foods LIMIT 5000') } catch {}
  res.json(searchReference(text, rows))
})
router.get('/', auth, async (req, res) => {
  try { res.json(await query('SELECT * FROM foods ORDER BY name LIMIT 50')) }
  catch { res.status(503).json({ error: 'Каталог временно недоступен' }) }
})
module.exports = router
