require('dotenv').config()
const express = require('express')
const router = express.Router()
const { query: q, queryOne: qOne, run: r, exec } = require('../db/turso')

const adminAuth = (req, res, next) => {
  const token = req.headers['x-admin-token'] || req.query.token
  if (token !== process.env.ADMIN_TOKEN) return res.status(403).json({ error: 'Forbidden' })
  next()
}

// USERS
router.get('/users', adminAuth, async (req, res) => {
  const users = await q('SELECT * FROM users ORDER BY created_at DESC')
  res.json({ users })
})
router.delete('/users/:id', adminAuth, async (req, res) => {
  await r('DELETE FROM users WHERE id = ?', [req.params.id])
  res.json({ ok: true })
})

// EVENTS
router.get('/events', adminAuth, async (req, res) => {
  const events = await q('SELECT * FROM events ORDER BY date DESC')
  res.json({ events })
})
router.post('/events', adminAuth, async (req, res) => {
  const { title, type, date, time, end_time, emoji, location, description, link, color } = req.body
  const result = await r(
    'INSERT INTO events (title, type, date, time, end_time, emoji, location, description, link, color) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [title, type||'workout', date, time||'10:00', end_time||'11:00', emoji||'🌸', location||'', description||'', link||'', color||'#E8437A'])
  const event = await qOne('SELECT * FROM events WHERE id = ?', [result.lastInsertRowid])
  res.json(event)
})
router.put('/events/:id', adminAuth, async (req, res) => {
  const { title, type, date, time, end_time, emoji, location, description, link, color } = req.body
  await r('UPDATE events SET title=?,type=?,date=?,time=?,end_time=?,emoji=?,location=?,description=?,link=?,color=? WHERE id=?',
    [title, type, date, time, end_time, emoji, location, description, link, color, req.params.id])
  res.json(await qOne('SELECT * FROM events WHERE id = ?', [req.params.id]))
})
router.delete('/events/:id', adminAuth, async (req, res) => {
  await r('DELETE FROM events WHERE id = ?', [req.params.id])
  res.json({ ok: true })
})

// RECIPES
router.get('/recipes', adminAuth, async (req, res) => {
  const recipes = await q('SELECT * FROM recipes ORDER BY id')
  res.json({ recipes: recipes.map(r => ({ ...r, tags: JSON.parse(r.tags||'[]'), ingredients: JSON.parse(r.ingredients||'[]'), steps: JSON.parse(r.steps||'[]') })) })
})
router.post('/recipes', adminAuth, async (req, res) => {
  const { name, calories, protein, fat, carbs, time, emoji, tags, image_url, ingredients, steps, servings } = req.body
  const result = await r(
    'INSERT INTO recipes (name, calories, protein, fat, carbs, time, emoji, tags, image_url, ingredients, steps, servings) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [name, calories||0, protein||0, fat||0, carbs||0, time||15, emoji||'🍽', JSON.stringify(tags||[]), image_url||'', JSON.stringify(ingredients||[]), JSON.stringify(steps||[]), servings||2])
  res.json(await qOne('SELECT * FROM recipes WHERE id = ?', [result.lastInsertRowid]))
})
router.delete('/recipes/:id', adminAuth, async (req, res) => {
  await r('DELETE FROM recipes WHERE id = ?', [req.params.id])
  res.json({ ok: true })
})

// WORKOUTS
router.get('/workouts', adminAuth, async (req, res) => {
  const workouts = await q('SELECT * FROM workouts ORDER BY id')
  res.json({ workouts })
})
router.post('/workouts', adminAuth, async (req, res) => {
  const { name, type, duration, level, format, description, video_url, thumbnail_url, instructor } = req.body
  const result = await r(
    'INSERT INTO workouts (name, type, duration, level, format, description, video_url, thumbnail_url, instructor) VALUES (?,?,?,?,?,?,?,?,?)',
    [name, type||'cardio', duration||30, level||'Средний', format||'Онлайн', description||'', video_url||'', thumbnail_url||'', instructor||''])
  res.json(await qOne('SELECT * FROM workouts WHERE id = ?', [result.lastInsertRowid]))
})
router.put('/workouts/:id', adminAuth, async (req, res) => {
  const { name, type, duration, level, format, description, video_url, thumbnail_url, instructor } = req.body
  await r('UPDATE workouts SET name=?,type=?,duration=?,level=?,format=?,description=?,video_url=?,thumbnail_url=?,instructor=? WHERE id=?',
    [name, type, duration, level, format, description, video_url, thumbnail_url, instructor, req.params.id])
  res.json(await qOne('SELECT * FROM workouts WHERE id = ?', [req.params.id]))
})
router.delete('/workouts/:id', adminAuth, async (req, res) => {
  await r('DELETE FROM workouts WHERE id = ?', [req.params.id])
  res.json({ ok: true })
})

// PLACES
router.get('/places', adminAuth, async (req, res) => {
  const places = await q('SELECT * FROM places ORDER BY name')
  res.json({ places: places.map(p => ({ ...p, tags: JSON.parse(p.tags||'[]') })) })
})
router.post('/places', adminAuth, async (req, res) => {
  const { name, type, address, lat, lng, description, phone, website, emoji, color, rating, tags, parent_id } = req.body
  const result = await r(
    'INSERT INTO places (name, type, address, lat, lng, description, phone, website, emoji, color, rating, tags, parent_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [name, type||'studio', address||'', parseFloat(lat)||0, parseFloat(lng)||0, description||'', phone||'', website||'', emoji||'📍', color||'#E8437A', parseFloat(rating)||0, JSON.stringify(tags||[]), parent_id||null])
  res.json(await qOne('SELECT * FROM places WHERE id = ?', [result.lastInsertRowid]))
})
router.put('/places/:id', adminAuth, async (req, res) => {
  const { name, type, address, lat, lng, description, phone, website, emoji, color, rating, tags, parent_id } = req.body
  await r('UPDATE places SET name=?,type=?,address=?,lat=?,lng=?,description=?,phone=?,website=?,emoji=?,color=?,rating=?,tags=?,parent_id=? WHERE id=?',
    [name, type, address||'', parseFloat(lat)||0, parseFloat(lng)||0, description||'', phone||'', website||'', emoji||'📍', color||'#E8437A', parseFloat(rating)||0, JSON.stringify(tags||[]), parent_id||null, req.params.id])
  res.json(await qOne('SELECT * FROM places WHERE id = ?', [req.params.id]))
})
router.delete('/places/:id', adminAuth, async (req, res) => {
  await r('DELETE FROM places WHERE parent_id = ?', [req.params.id])
  await r('DELETE FROM places WHERE id = ?', [req.params.id])
  res.json({ ok: true })
})

// FOODS
router.get('/foods', adminAuth, async (req, res) => {
  const foods = await q('SELECT * FROM foods ORDER BY name')
  res.json({ foods })
})
router.post('/foods', adminAuth, async (req, res) => {
  const { name, calories, protein, fat, carbs, unit, unit_weight } = req.body
  const result = await r('INSERT INTO foods (name, calories, protein, fat, carbs, unit, unit_weight) VALUES (?,?,?,?,?,?,?)',
    [name, calories||0, protein||0, fat||0, carbs||0, unit||'100г', unit_weight||100])
  res.json(await qOne('SELECT * FROM foods WHERE id = ?', [result.lastInsertRowid]))
})
router.delete('/foods/:id', adminAuth, async (req, res) => {
  await r('DELETE FROM foods WHERE id = ?', [req.params.id])
  res.json({ ok: true })
})

module.exports = router
