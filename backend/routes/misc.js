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

async function exec(sql) {
  if (turso) return turso.exec(sql)
  try { db.exec(sql) } catch(e) {}
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
    await exec(`CREATE TABLE IF NOT EXISTS workout_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, workout_id INTEGER, gym_id INTEGER, notes TEXT, date TEXT DEFAULT (date('now')), created_at TEXT DEFAULT (datetime('now')))`)
    const gyms = await q('SELECT * FROM user_gyms WHERE user_id = ? ORDER BY name', [req.user.id])
    res.json(gyms)
  } catch(e) { console.error('get gyms:', e.message); res.json([]) }
})

router.post('/workouts/gyms', auth, async (req, res) => {
  try {
    await exec(`CREATE TABLE IF NOT EXISTS user_gyms (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, total_sessions INTEGER DEFAULT 8, used_sessions INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`)
    const { name, total_sessions } = req.body
    if (!name) return res.status(400).json({ error: 'name required' })
    const result = await r('INSERT INTO user_gyms (user_id, name, total_sessions) VALUES (?, ?, ?)', [req.user.id, name, total_sessions || 8])
    const gym = await qOne('SELECT * FROM user_gyms WHERE id = ?', [result.lastInsertRowid])
    res.json(gym)
  } catch(e) { console.error('add gym error:', e.message); res.status(500).json({ error: e.message }) }
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

// ── FOOD SEARCH PROXY ─────────────────────────────────────
router.get('/food-search', async (req, res) => {
  const query = req.query.q || ''
  if (!query || query.length < 2) return res.json([])
  
  try {
    const results = []
    
    // Search Open Food Facts with proper headers
    const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=20&fields=product_name,product_name_ru,brands,nutriments,code`
    
    const response = await fetch(offUrl, {
      headers: {
        'User-Agent': 'SOFE-HealthApp/1.0 (https://sofe-jade.vercel.app; contact@sofe.app)',
        'Accept': 'application/json',
        'Accept-Language': 'ru,en'
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      const products = (data.products || [])
        .filter(p => p.product_name && p.nutriments?.['energy-kcal_100g'] > 0)
        .map(p => ({
          id: 'off_' + p.code,
          name: (p.product_name_ru || p.product_name || '').trim(),
          brand: (p.brands || '').split(',')[0].trim(),
          calories: Math.round(p.nutriments['energy-kcal_100g'] || 0),
          protein: Math.round((p.nutriments.proteins_100g || 0) * 10) / 10,
          fat: Math.round((p.nutriments.fat_100g || 0) * 10) / 10,
          carbs: Math.round((p.nutriments.carbohydrates_100g || 0) * 10) / 10,
          unit: '100г', unit_weight: 100
        }))
      results.push(...products)
    }
    
    res.json(results.slice(0, 25))
  } catch(e) {
    console.error('Food search error:', e.message)
    res.json([])
  }
})

// ── LOCAL BARCODE DATABASE (popular Russian products) ──────
const LOCAL_BARCODES = {
  '4600842024383': { name: 'Молоко Простоквашино 3.2%', brand: 'Простоквашино', calories: 60, protein: 2.8, fat: 3.2, carbs: 4.7 },
  '4601573017777': { name: 'Кефир Простоквашино 3.2%', brand: 'Простоквашино', calories: 59, protein: 2.9, fat: 3.2, carbs: 4.0 },
  '4607134960400': { name: 'Творог Простоквашино 5%', brand: 'Простоквашино', calories: 121, protein: 17.0, fat: 5.0, carbs: 1.8 },
  '4607038058874': { name: 'Йогурт Активиа натуральный', brand: 'Activia', calories: 66, protein: 4.2, fat: 2.9, carbs: 5.8 },
  '4607038050359': { name: 'Творог Danone 5%', brand: 'Danone', calories: 121, protein: 17.0, fat: 5.0, carbs: 1.8 },
  '7622210951557': { name: 'Milka молочный шоколад', brand: 'Milka', calories: 535, protein: 6.9, fat: 30.1, carbs: 59.5 },
  '7622210100337': { name: 'Milka Oreo', brand: 'Milka', calories: 520, protein: 6.0, fat: 27.0, carbs: 63.0 },
  '4000417025005': { name: 'Ritter Sport молочный', brand: 'Ritter Sport', calories: 535, protein: 7.5, fat: 30.0, carbs: 59.0 },
  '4607065620392': { name: 'Гречка Мистраль', brand: 'Мистраль', calories: 329, protein: 12.6, fat: 3.3, carbs: 62.0 },
  '4607065620408': { name: 'Рис Мистраль длиннозёрный', brand: 'Мистраль', calories: 344, protein: 7.0, fat: 1.0, carbs: 75.0 },
  '4601234567890': { name: 'Овсянка Геркулес', brand: 'Русский продукт', calories: 342, protein: 11.0, fat: 6.2, carbs: 59.5 },
  '4606203432456': { name: 'Докторская колбаса', brand: '', calories: 257, protein: 12.8, fat: 22.8, carbs: 1.5 },
  '4607004390198': { name: 'Хлеб Дарницкий', brand: 'Хлебозавод', calories: 174, protein: 6.0, fat: 1.4, carbs: 34.0 },
  '4600494008452': { name: 'Яйцо С1 10шт', brand: 'Окская птицефабрика', calories: 157, protein: 12.9, fat: 11.5, carbs: 0.8 },
  '4607049797041': { name: 'Масло сливочное 82.5%', brand: 'Крестьянское', calories: 748, protein: 0.8, fat: 82.5, carbs: 0.8 },
  '4600494025022': { name: 'Сметана 20%', brand: 'Простоквашино', calories: 204, protein: 2.8, fat: 20.0, carbs: 3.2 },
  '4607038055711': { name: 'Чай Lipton жёлтый', brand: 'Lipton', calories: 0, protein: 0, fat: 0, carbs: 0 },
  '46176492': { name: 'Белевская пастила', brand: 'Белёвские сладости', calories: 310, protein: 0.5, fat: 0.0, carbs: 76.0 },
  '4607031762574': { name: 'Лосось слабосолёный', brand: 'Русское море', calories: 202, protein: 22.5, fat: 12.0, carbs: 0 },
}

// ── BARCODE LOOKUP PROXY ───────────────────────────────────
router.get('/barcode/:code', async (req, res) => {
  const barcode = req.params.code.replace(/[^0-9]/g, '')
  if (!barcode) return res.status(400).json({ error: 'Invalid barcode' })
  
  // Try multiple variants
  const variants = [barcode]
  if (barcode.length === 12) variants.push('4' + barcode, '0' + barcode)
  if (barcode.length === 13 && barcode.startsWith('4')) variants.push(barcode.slice(1))
  
  try {
    // Check local DB first
    for (const code of variants) {
      if (LOCAL_BARCODES[code]) {
        return res.json({ found: true, barcode: code, ...LOCAL_BARCODES[code] })
      }
    }
    // Try OFF
    for (const code of variants) {
      try {
        const r = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`, {
          headers: { 'User-Agent': 'SOFE-HealthApp/1.0 (https://sofe-jade.vercel.app; health@sofe.app)' },
          signal: AbortSignal.timeout(8000)
        })
        const data = await r.json()
        if (data.status === 1 && data.product) {
          const p = data.product
          const n = p.nutriments || {}
          return res.json({
            found: true, barcode: code,
            name: p.product_name_ru || p.product_name || 'Продукт',
            brand: (p.brands || '').split(',')[0].trim(),
            calories: Math.round(n['energy-kcal_100g'] || 0),
            protein: Math.round((n.proteins_100g || 0) * 10) / 10,
            fat: Math.round((n.fat_100g || 0) * 10) / 10,
            carbs: Math.round((n.carbohydrates_100g || 0) * 10) / 10,
            image: p.image_front_small_url || null
          })
        }
      } catch(e) { console.log('OFF error:', e.message) }
    }
    res.json({ found: false, barcode })
  } catch(e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
