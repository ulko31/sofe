require('dotenv').config()
const express = require('express')
const router = express.Router()
const auth = require('../middleware/auth')
const { query: q, queryOne: qOne, run: r, exec } = require('../db/turso')

const ensureTables = async () => {
  await exec(`CREATE TABLE IF NOT EXISTS user_gyms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL, name TEXT NOT NULL,
    total_sessions INTEGER DEFAULT 8, used_sessions INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')))`)
  await exec(`CREATE TABLE IF NOT EXISTS workout_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL, workout_id INTEGER,
    gym_id INTEGER, notes TEXT,
    date TEXT DEFAULT (date('now')),
    created_at TEXT DEFAULT (datetime('now')))`)
}

// GET user's gyms
router.get('/gyms', auth, async (req, res) => {
  await ensureTables()
  const gyms = await q('SELECT * FROM user_gyms WHERE user_id = ? ORDER BY name', [req.user.id])
  res.json(gyms)
})

// POST add gym
router.post('/gyms', auth, async (req, res) => {
  await ensureTables()
  const { name, total_sessions } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  const result = await r('INSERT INTO user_gyms (user_id, name, total_sessions) VALUES (?, ?, ?)',
    [req.user.id, name, total_sessions || 8])
  const gym = await qOne('SELECT * FROM user_gyms WHERE id = ?', [result.lastInsertRowid])
  res.json(gym)
})

// PUT update gym
router.put('/gyms/:id', auth, async (req, res) => {
  const { name, total_sessions, used_sessions } = req.body
  await r('UPDATE user_gyms SET name=COALESCE(?,name), total_sessions=COALESCE(?,total_sessions), used_sessions=COALESCE(?,used_sessions) WHERE id=? AND user_id=?',
    [name||null, total_sessions||null, used_sessions!=null ? used_sessions : null, req.params.id, req.user.id])
  res.json(await qOne('SELECT * FROM user_gyms WHERE id = ?', [req.params.id]))
})

// DELETE gym
router.delete('/gyms/:id', auth, async (req, res) => {
  await r('DELETE FROM user_gyms WHERE id = ? AND user_id = ?', [req.params.id, req.user.id])
  res.json({ ok: true })
})

// POST log workout
router.post('/log', auth, async (req, res) => {
  await ensureTables()
  const { workout_id, gym_id, notes, date } = req.body
  const result = await r('INSERT INTO workout_logs (user_id, workout_id, gym_id, notes, date) VALUES (?,?,?,?,?)',
    [req.user.id, workout_id||null, gym_id||null, notes||'', date||new Date().toISOString().split('T')[0]])
  // Increment used_sessions if gym specified
  if (gym_id) {
    await r('UPDATE user_gyms SET used_sessions = used_sessions + 1 WHERE id = ? AND user_id = ?', [gym_id, req.user.id])
  }
  res.json({ ok: true, id: result.lastInsertRowid })
})

// GET workout logs
router.get('/logs', auth, async (req, res) => {
  await ensureTables()
  const logs = await q('SELECT * FROM workout_logs WHERE user_id = ? ORDER BY date DESC LIMIT 30', [req.user.id])
  res.json(logs)
})

module.exports = router
