require('dotenv').config()
const express = require('express')
const router = express.Router()
const auth = require('../middleware/auth')

// Use async Turso client directly if available, otherwise fall back to sync db
let db, turso
try {
  if (process.env.TURSO_URL) {
    turso = require('../db/turso')
  } else {
    db = require('../db/init')
  }
} catch(e) {
  db = require('../db/init')
}

// Helper to run query with either turso or sqlite
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

// ── PUBLIC PLACES ──────────────────────────────────────────
router.get('/places', async (req, res) => {
  try {
    if (turso) await turso.exec(`CREATE TABLE IF NOT EXISTS places (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      type TEXT DEFAULT 'studio', address TEXT, lat REAL, lng REAL,
      description TEXT, phone TEXT, website TEXT,
      emoji TEXT DEFAULT '📍', color TEXT DEFAULT '#E8437A',
      rating REAL DEFAULT 0, tags TEXT DEFAULT '[]',
      parent_id INTEGER DEFAULT NULL, created_at TEXT DEFAULT (datetime('now')))`)
    const places = await q('SELECT * FROM places ORDER BY name')
    res.json(places.map(p => ({ ...p, tags: JSON.parse(p.tags || '[]') })))
  } catch(e) { console.error(e); res.json([]) }
})

// ── PUBLIC EVENTS ──────────────────────────────────────────
router.get('/events/all', async (req, res) => {
  try {
    const events = await q('SELECT * FROM events ORDER BY date ASC')
    res.json(events.map(e => ({
      id: e.id, title: e.title, type: e.type,
      date: e.date, time: e.time, endTime: e.end_time,
      emoji: e.emoji, location: e.location,
      description: e.description, link: e.link, color: e.color
    })))
  } catch(e) { res.json([]) }
})

// ── RECIPES (public) ───────────────────────────────────────
router.get('/recipes', async (req, res) => {
  try {
    const recipes = await q('SELECT * FROM recipes ORDER BY id')
    res.json(recipes.map(r => ({
      ...r,
      tags: JSON.parse(r.tags || '[]'),
      ingredients: JSON.parse(r.ingredients || '[]'),
      steps: JSON.parse(r.steps || '[]')
    })))
  } catch(e) { console.error('recipes error:', e.message); res.json([]) }
})

router.get('/recipes/:id', auth, async (req, res) => {
  try {
    const recipe = await qOne('SELECT * FROM recipes WHERE id = ?', [req.params.id])
    if (!recipe) return res.status(404).json({ error: 'Not found' })
    res.json({ ...recipe, tags: JSON.parse(recipe.tags || '[]'), ingredients: JSON.parse(recipe.ingredients || '[]'), steps: JSON.parse(recipe.steps || '[]') })
  } catch(e) { res.status(500).json({ error: e.message }) }
})

// ── TRACKERS ───────────────────────────────────────────────
router.get('/trackers', auth, async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0]
  try {
    let tracker = await qOne('SELECT * FROM trackers WHERE user_id = ? AND date = ?', [req.user.id, date])
    if (!tracker) tracker = { user_id: req.user.id, date, water: 0, steps: 0, sleep: 0, pulse: 72 }
    res.json(tracker)
  } catch(e) { res.json({ water: 0, steps: 0, sleep: 0, pulse: 72 }) }
})

router.put('/trackers', auth, async (req, res) => {
  const { water, steps, sleep, pulse, date } = req.body
  const d = date || new Date().toISOString().split('T')[0]
  try {
    await r(`INSERT INTO trackers (user_id, date, water, steps, sleep, pulse)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, date) DO UPDATE SET
        water = COALESCE(excluded.water, water),
        steps = COALESCE(excluded.steps, steps),
        sleep = COALESCE(excluded.sleep, sleep),
        pulse = COALESCE(excluded.pulse, pulse)`,
      [req.user.id, d, water ?? null, steps ?? null, sleep ?? null, pulse ?? null])
    const tracker = await qOne('SELECT * FROM trackers WHERE user_id = ? AND date = ?', [req.user.id, d])
    res.json(tracker)
  } catch(e) { res.status(500).json({ error: e.message }) }
})

// ── WORKOUTS ───────────────────────────────────────────────
router.get('/workouts', auth, async (req, res) => {
  try {
    const workouts = await q('SELECT * FROM workouts ORDER BY id')
    res.json(workouts)
  } catch(e) { res.json([]) }
})

router.post('/workouts/log', auth, async (req, res) => {
  const { workout_id, date } = req.body
  res.json({ ok: true })
})

// ── SUBSCRIPTIONS ──────────────────────────────────────────
router.get('/subscriptions', auth, async (req, res) => {
  try {
    const subs = await q('SELECT * FROM subscriptions WHERE user_id = ?', [req.user.id])
    res.json(subs)
  } catch(e) { res.json([]) }
})

// ── PROGRESS ───────────────────────────────────────────────
router.get('/progress', auth, async (req, res) => {
  try {
    const user = await qOne('SELECT * FROM users WHERE id = ?', [req.user.id])
    const days = Math.max(1, Math.floor((Date.now() - new Date(user?.created_at || Date.now())) / 86400000))
    res.json({ days, weightLost: 0, goalPct: Math.min(100, Math.round(days / 30 * 100)) })
  } catch(e) { res.json({ days: 0, weightLost: 0, goalPct: 0 }) }
})

// ── USER GYMS ──────────────────────────────────────────────
router.get('/workouts/gyms', auth, async (req, res) => {
  try {
    await exec(`CREATE TABLE IF NOT EXISTS user_gyms (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, total_sessions INTEGER DEFAULT 8, used_sessions INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`)
    const gyms = await q('SELECT * FROM user_gyms WHERE user_id = ? ORDER BY name', [req.user.id])
    res.json(gyms)
  } catch(e) { res.json([]) }
})

router.post('/workouts/gyms', auth, async (req, res) => {
  await exec(`CREATE TABLE IF NOT EXISTS user_gyms (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, total_sessions INTEGER DEFAULT 8, used_sessions INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`)
  const { name, total_sessions } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  const result = await r('INSERT INTO user_gyms (user_id, name, total_sessions) VALUES (?, ?, ?)', [req.user.id, name, total_sessions || 8])
  res.json(await qOne('SELECT * FROM user_gyms WHERE id = ?', [result.lastInsertRowid]))
})

router.put('/workouts/gyms/:id', auth, async (req, res) => {
  const { name, total_sessions, used_sessions } = req.body
  await r('UPDATE user_gyms SET name=COALESCE(?,name), total_sessions=COALESCE(?,total_sessions), used_sessions=COALESCE(?,used_sessions) WHERE id=? AND user_id=?',
    [name||null, total_sessions||null, used_sessions!=null?used_sessions:null, req.params.id, req.user.id])
  res.json(await qOne('SELECT * FROM user_gyms WHERE id = ?', [req.params.id]))
})

router.delete('/workouts/gyms/:id', auth, async (req, res) => {
  await r('DELETE FROM user_gyms WHERE id = ? AND user_id = ?', [req.params.id, req.user.id])
  res.json({ ok: true })
})

router.post('/workouts/log', auth, async (req, res) => {
  await exec(`CREATE TABLE IF NOT EXISTS workout_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, workout_id INTEGER, gym_id INTEGER, notes TEXT, date TEXT DEFAULT (date('now')), created_at TEXT DEFAULT (datetime('now')))`)
  const { workout_id, gym_id, notes, date } = req.body
  await r('INSERT INTO workout_logs (user_id, workout_id, gym_id, notes, date) VALUES (?,?,?,?,?)',
    [req.user.id, workout_id||null, gym_id||null, notes||'', date||new Date().toISOString().split('T')[0]])
  if (gym_id) await r('UPDATE user_gyms SET used_sessions = used_sessions + 1 WHERE id = ? AND user_id = ?', [gym_id, req.user.id])
  res.json({ ok: true })
})

module.exports = router
