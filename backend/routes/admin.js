const express = require('express')
const router = express.Router()
const db = require('../db/init')

function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token']
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

// ── STATS ─────────────────────────────────────────────────
router.get('/stats', adminAuth, (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt
  const today = new Date().toISOString().split('T')[0]
  const newToday = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE date(created_at) = ?").get(today).cnt
  const totalMeals = db.prepare('SELECT COUNT(*) as cnt FROM meals').get().cnt
  const activeToday = db.prepare('SELECT COUNT(DISTINCT user_id) as cnt FROM meals WHERE date = ?').get(today).cnt
  const upcomingEvents = db.prepare("SELECT COUNT(*) as cnt FROM events WHERE date >= ?").get(today).cnt
  const goals = {}
  db.prepare('SELECT goal, COUNT(*) as cnt FROM users GROUP BY goal').all().forEach(r => { goals[r.goal] = r.cnt })
  const recentUsers = db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT 10').all()
  res.json({ totalUsers, newToday, totalMeals, activeToday, upcomingEvents, goals, recentUsers })
})

// ── USERS ──────────────────────────────────────────────────
router.get('/users', adminAuth, (req, res) => {
  res.json({ users: db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() })
})

router.delete('/users/:id', adminAuth, (req, res) => {
  db.prepare('DELETE FROM meals WHERE user_id = ?').run(req.params.id)
  db.prepare('DELETE FROM trackers WHERE user_id = ?').run(req.params.id)
  db.prepare('DELETE FROM subscriptions WHERE user_id = ?').run(req.params.id)
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// ── EVENTS ─────────────────────────────────────────────────
router.get('/events', adminAuth, (req, res) => {
  const events = db.prepare('SELECT * FROM events ORDER BY date ASC').all()
  res.json({ events })
})

router.post('/events', adminAuth, (req, res) => {
  const { title, type, date, time, endTime, emoji, location, description, link, color } = req.body
  if (!title || !date) return res.status(400).json({ error: 'title and date required' })
  const result = db.prepare(`
    INSERT INTO events (title, type, date, time, end_time, emoji, location, description, link, color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, type || 'workout', date, time || '10:00', endTime || '11:00', emoji || '🌸', location || '', description || '', link || '', color || '#E8437A')
  res.json(db.prepare('SELECT * FROM events WHERE id = ?').get(result.lastInsertRowid))
})

router.put('/events/:id', adminAuth, (req, res) => {
  const { title, type, date, time, endTime, emoji, location, description, link, color } = req.body
  db.prepare(`
    UPDATE events SET title=?, type=?, date=?, time=?, end_time=?, emoji=?, location=?, description=?, link=?, color=?
    WHERE id=?
  `).run(title, type, date, time, endTime, emoji, location, description, link, color, req.params.id)
  res.json(db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id))
})

router.delete('/events/:id', adminAuth, (req, res) => {
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// ── RECIPES ────────────────────────────────────────────────
router.get('/recipes', adminAuth, (req, res) => {
  const recipes = db.prepare('SELECT * FROM recipes ORDER BY id DESC').all()
  res.json({ recipes: recipes.map(r => ({
    ...r,
    tags: JSON.parse(r.tags || '[]'),
    ingredients: JSON.parse(r.ingredients || '[]'),
    steps: JSON.parse(r.steps || '[]')
  }))})
})

router.post('/recipes', adminAuth, (req, res) => {
  const { name, calories, protein, fat, carbs, time, emoji, tags, image_url, ingredients, steps, servings } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  const result = db.prepare(`
    INSERT INTO recipes (name, calories, protein, fat, carbs, time, emoji, tags, image_url, ingredients, steps, servings)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, calories||0, protein||0, fat||0, carbs||0, time||15, emoji||'🍽',
    JSON.stringify(tags||[]), image_url||'',
    JSON.stringify(ingredients||[]), JSON.stringify(steps||[]), servings||2)
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(result.lastInsertRowid)
  res.json({ ...recipe, tags: JSON.parse(recipe.tags||'[]'), ingredients: JSON.parse(recipe.ingredients||'[]'), steps: JSON.parse(recipe.steps||'[]') })
})

router.put('/recipes/:id', adminAuth, (req, res) => {
  const { name, calories, protein, fat, carbs, time, emoji, tags, image_url, ingredients, steps, servings } = req.body
  db.prepare(`
    UPDATE recipes SET name=?, calories=?, protein=?, fat=?, carbs=?, time=?, emoji=?, tags=?, image_url=?, ingredients=?, steps=?, servings=?
    WHERE id=?
  `).run(name, calories||0, protein||0, fat||0, carbs||0, time||15, emoji||'🍽',
    JSON.stringify(tags||[]), image_url||'',
    JSON.stringify(ingredients||[]), JSON.stringify(steps||[]), servings||2, req.params.id)
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id)
  res.json({ ...recipe, tags: JSON.parse(recipe.tags||'[]'), ingredients: JSON.parse(recipe.ingredients||'[]'), steps: JSON.parse(recipe.steps||'[]') })
})

router.delete('/recipes/:id', adminAuth, (req, res) => {
  db.prepare('DELETE FROM recipes WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// ── WORKOUTS ──────────────────────────────────────────────
router.get('/workouts', adminAuth, (req, res) => {
  res.json({ workouts: db.prepare('SELECT * FROM workouts ORDER BY id DESC').all() })
})

router.post('/workouts', adminAuth, (req, res) => {
  const { name, type, duration, level, format, description, video_url, thumbnail_url, instructor } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })

  // Add columns if not exist
  try { db.exec('ALTER TABLE workouts ADD COLUMN video_url TEXT') } catch(e) {}
  try { db.exec('ALTER TABLE workouts ADD COLUMN thumbnail_url TEXT') } catch(e) {}
  try { db.exec('ALTER TABLE workouts ADD COLUMN instructor TEXT') } catch(e) {}

  const result = db.prepare(`
    INSERT INTO workouts (name, type, duration, level, format, description, video_url, thumbnail_url, instructor)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, type || 'FIT', duration || 30, level || 'Средний', format || 'Онлайн', description || '', video_url || '', thumbnail_url || '', instructor || '')
  res.json(db.prepare('SELECT * FROM workouts WHERE id = ?').get(result.lastInsertRowid))
})

router.put('/workouts/:id', adminAuth, (req, res) => {
  const { name, type, duration, level, format, description, video_url, thumbnail_url, instructor } = req.body
  try { db.exec('ALTER TABLE workouts ADD COLUMN video_url TEXT') } catch(e) {}
  try { db.exec('ALTER TABLE workouts ADD COLUMN thumbnail_url TEXT') } catch(e) {}
  try { db.exec('ALTER TABLE workouts ADD COLUMN instructor TEXT') } catch(e) {}

  db.prepare(`
    UPDATE workouts SET name=?, type=?, duration=?, level=?, format=?, description=?, video_url=?, thumbnail_url=?, instructor=?
    WHERE id=?
  `).run(name, type, duration, level, format, description, video_url || '', thumbnail_url || '', instructor || '', req.params.id)
  res.json(db.prepare('SELECT * FROM workouts WHERE id = ?').get(req.params.id))
})

router.delete('/workouts/:id', adminAuth, (req, res) => {
  db.prepare('DELETE FROM workouts WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// ── PLACES (студии и кафе на карте) ───────────────────────
router.get('/places', adminAuth, (req, res) => {
  try { db.exec(`CREATE TABLE IF NOT EXISTS places (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, type TEXT DEFAULT 'studio',
    address TEXT, lat REAL, lng REAL,
    description TEXT, phone TEXT, website TEXT,
    emoji TEXT DEFAULT '📍', color TEXT DEFAULT '#E8437A',
    rating REAL DEFAULT 0, tags TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now'))
  )`) } catch(e) {}
  const places = db.prepare('SELECT * FROM places ORDER BY type, name').all()
  res.json({ places: places.map(p => ({ ...p, tags: JSON.parse(p.tags || '[]') })) })
})

router.post('/places', adminAuth, (req, res) => {
  try { db.exec(`CREATE TABLE IF NOT EXISTS places (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, type TEXT DEFAULT 'studio',
    address TEXT, lat REAL, lng REAL,
    description TEXT, phone TEXT, website TEXT,
    emoji TEXT DEFAULT '📍', color TEXT DEFAULT '#E8437A',
    rating REAL DEFAULT 0, tags TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now'))
  )`) } catch(e) {}
  const { name, type, address, lat, lng, description, phone, website, emoji, color, rating, tags } = req.body
  const result = db.prepare(`
    INSERT INTO places (name, type, address, lat, lng, description, phone, website, emoji, color, rating, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, type || 'studio', address || '', lat || 0, lng || 0, description || '', phone || '', website || '', emoji || '📍', color || '#E8437A', rating || 0, JSON.stringify(tags || []))
  res.json(db.prepare('SELECT * FROM places WHERE id = ?').get(result.lastInsertRowid))
})

router.delete('/places/:id', adminAuth, (req, res) => {
  db.prepare('DELETE FROM places WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// ── NUTRITION STATS ────────────────────────────────────────
router.get('/nutrition', adminAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0]
  const todayCount = db.prepare('SELECT COUNT(*) as cnt FROM meals WHERE date = ?').get(today).cnt
  const total = db.prepare('SELECT COUNT(*) as cnt FROM meals').get().cnt
  const avgRow = db.prepare('SELECT AVG(calories) as avg FROM meals').get()
  const popularRow = db.prepare('SELECT type, COUNT(*) as cnt FROM meals GROUP BY type ORDER BY cnt DESC LIMIT 1').get()
  const typeMap = { breakfast:'Завтрак', lunch:'Обед', dinner:'Ужин', snack:'Перекус' }
  const recentMeals = db.prepare(`
    SELECT m.*, u.name as user_name FROM meals m
    LEFT JOIN users u ON u.id = m.user_id
    ORDER BY m.created_at DESC LIMIT 20
  `).all()
  res.json({ today: todayCount, total, avgCalories: Math.round(avgRow?.avg||0), popularType: typeMap[popularRow?.type]||'—', recentMeals })
})

module.exports = router
