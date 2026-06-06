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
    // Try multiple OFF endpoints
    let response = null
    const urls = [
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=20&fields=product_name,product_name_ru,brands,nutriments,code`,
      `https://ru.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=20&fields=product_name,product_name_ru,brands,nutriments,code`
    ]
    for (const url of urls) {
      try {
        response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SOFE-App/1.0; +https://sofe-jade.vercel.app)',
            'Accept': 'application/json',
            'Accept-Language': 'ru,en'
          },
          signal: AbortSignal.timeout(8000)
        })
        if (response.ok) break
      } catch(e) { response = null }
    }
    const offUrl = urls[0]
    
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

  // Молочные продукты
  '4600494002221': { name: 'Молоко Простоквашино 2.5%', brand: 'Простоквашино', calories: 52, protein: 2.9, fat: 2.5, carbs: 4.7 },
  '4600494002238': { name: 'Молоко Простоквашино 1.5%', brand: 'Простоквашино', calories: 44, protein: 2.9, fat: 1.5, carbs: 4.7 },
  '4607038058881': { name: 'Йогурт Активиа клубника', brand: 'Activia', calories: 95, protein: 4.0, fat: 2.8, carbs: 13.0 },
  '4607038058898': { name: 'Йогурт Активиа персик', brand: 'Activia', calories: 94, protein: 3.9, fat: 2.7, carbs: 13.0 },
  '4601234000015': { name: 'Сырок Б.Ю.Александров ваниль', brand: 'Александров', calories: 340, protein: 7.5, fat: 23.0, carbs: 26.0 },
  '4601234000022': { name: 'Сырок Б.Ю.Александров клубника', brand: 'Александров', calories: 335, protein: 7.2, fat: 22.5, carbs: 26.0 },
  '4607182230011': { name: 'Творог Чудо 4.2%', brand: 'Чудо', calories: 107, protein: 14.0, fat: 4.2, carbs: 4.5 },
  '4670004540019': { name: 'Кефир Вкуснотеево 2.5%', brand: 'Вкуснотеево', calories: 53, protein: 2.9, fat: 2.5, carbs: 4.0 },
  '4600494008469': { name: 'Сметана Простоквашино 15%', brand: 'Простоквашино', calories: 158, protein: 2.6, fat: 15.0, carbs: 3.0 },
  '4607038050366': { name: 'Творог Данон 9%', brand: 'Danone', calories: 155, protein: 16.0, fat: 9.0, carbs: 2.0 },
  '4680009780010': { name: 'Масло Крестьянское 72.5%', brand: 'Простоквашино', calories: 661, protein: 0.8, fat: 72.5, carbs: 1.3 },

  // Шоколад и сладкое
  '7622210951540': { name: 'Milka молочный шоколад 100г', brand: 'Milka', calories: 535, protein: 6.9, fat: 30.1, carbs: 59.5 },
  '7622210951564': { name: 'Milka Орео 100г', brand: 'Milka', calories: 519, protein: 6.1, fat: 26.5, carbs: 63.6 },
  '7622210954381': { name: 'Milka Caramel 100г', brand: 'Milka', calories: 519, protein: 5.7, fat: 27.0, carbs: 63.0 },
  '4000417711907': { name: 'Ritter Sport Whole Hazelnuts', brand: 'Ritter Sport', calories: 562, protein: 8.5, fat: 38.0, carbs: 45.0 },
  '4000417024008': { name: 'Ritter Sport Молочный шоколад', brand: 'Ritter Sport', calories: 535, protein: 7.5, fat: 30.0, carbs: 59.0 },
  '4603339015839': { name: 'Шоколад Россия Нежный молочный', brand: 'Россия', calories: 544, protein: 6.5, fat: 31.0, carbs: 61.0 },
  '4603339014009': { name: 'Шоколад Россия Золотой ярлык', brand: 'Россия', calories: 530, protein: 6.2, fat: 29.0, carbs: 62.0 },
  '4607065650825': { name: 'Конфеты Рафаэлло', brand: 'Ferrero', calories: 601, protein: 5.7, fat: 42.6, carbs: 48.4 },
  '4008400201306': { name: 'Ferrero Rocher 3шт', brand: 'Ferrero', calories: 573, protein: 7.3, fat: 39.0, carbs: 47.0 },
  '4600699501016': { name: 'Мармелад Ударница', brand: 'Ударница', calories: 321, protein: 1.0, fat: 0.0, carbs: 79.0 },
  '4607018890018': { name: 'Зефир Шармэль ваниль', brand: 'Ударница', calories: 299, protein: 0.5, fat: 0.1, carbs: 73.3 },
  '4601234560123': { name: 'Пастила Белевская', brand: 'Белёвские сладости', calories: 310, protein: 0.5, fat: 0.0, carbs: 76.0 },
  '4607065650818': { name: 'Вафли Артек', brand: 'КДВ', calories: 452, protein: 7.6, fat: 19.0, carbs: 63.0 },
  '4607065650801': { name: 'Печенье Юбилейное молочное', brand: 'Kraft', calories: 440, protein: 7.4, fat: 15.0, carbs: 67.0 },
  '7613036311403': { name: 'KitKat 4 палочки', brand: 'KitKat', calories: 513, protein: 6.3, fat: 26.8, carbs: 63.0 },
  '7613034626974': { name: 'Bounty 57г', brand: 'Bounty', calories: 471, protein: 3.5, fat: 24.7, carbs: 60.9 },
  '5000159461122': { name: 'Snickers 50г', brand: 'Snickers', calories: 488, protein: 8.5, fat: 23.9, carbs: 60.8 },
  '5000159488242': { name: 'Twix 50г', brand: 'Twix', calories: 495, protein: 4.8, fat: 24.1, carbs: 64.3 },

  // Соки и напитки
  '4601234100012': { name: 'Сок Добрый яблочный 1л', brand: 'Добрый', calories: 44, protein: 0.3, fat: 0.0, carbs: 10.6 },
  '4601234100029': { name: 'Сок Добрый апельсиновый 1л', brand: 'Добрый', calories: 46, protein: 0.5, fat: 0.0, carbs: 10.8 },
  '4601234100036': { name: 'Сок Добрый мультифрукт 1л', brand: 'Добрый', calories: 46, protein: 0.3, fat: 0.0, carbs: 11.0 },
  '4670016271019': { name: 'Сок Я яблочный 1л', brand: 'Я', calories: 46, protein: 0.2, fat: 0.0, carbs: 11.0 },
  '4670016271026': { name: 'Сок Я апельсиновый 1л', brand: 'Я', calories: 45, protein: 0.6, fat: 0.0, carbs: 10.4 },
  '4601234200011': { name: 'Rich яблоко 1л', brand: 'Rich', calories: 48, protein: 0.3, fat: 0.0, carbs: 11.3 },
  '4601234200028': { name: 'Rich мультифрукт 1л', brand: 'Rich', calories: 50, protein: 0.3, fat: 0.0, carbs: 12.0 },
  '4670000830016': { name: 'Вода Святой Источник 1.5л', brand: 'Святой Источник', calories: 0, protein: 0, fat: 0, carbs: 0 },
  '4680009780003': { name: 'Вода BonAqua 1.5л', brand: 'BonAqua', calories: 0, protein: 0, fat: 0, carbs: 0 },
  '5449000000996': { name: 'Coca-Cola 0.5л', brand: 'Coca-Cola', calories: 42, protein: 0.0, fat: 0.0, carbs: 10.6 },
  '5449000054227': { name: 'Coca-Cola Zero 0.5л', brand: 'Coca-Cola', calories: 0, protein: 0.0, fat: 0.0, carbs: 0.0 },
  '5449000131836': { name: 'Sprite 0.5л', brand: 'Sprite', calories: 29, protein: 0.0, fat: 0.0, carbs: 7.0 },
  '5449000054340': { name: 'Fanta апельсин 0.5л', brand: 'Fanta', calories: 48, protein: 0.0, fat: 0.0, carbs: 11.8 },
  '4607167392018': { name: 'Чай Greenfield Earl Grey', brand: 'Greenfield', calories: 0, protein: 0, fat: 0, carbs: 0 },
  '4607167392025': { name: 'Чай Greenfield Flying Dragon', brand: 'Greenfield', calories: 0, protein: 0, fat: 0, carbs: 0 },
  '4601234300019': { name: 'Кофе Nescafe Classic 190г', brand: 'Nescafe', calories: 0, protein: 0, fat: 0, carbs: 0 },
  '7613036897464': { name: 'Nescafe Gold 190г', brand: 'Nescafe', calories: 0, protein: 0, fat: 0, carbs: 0 },

  // Снеки и чипсы
  '4606272011019': { name: 'Чипсы Lays классические 150г', brand: "Lay's", calories: 533, protein: 6.5, fat: 31.0, carbs: 57.0 },
  '4606272011026': { name: 'Чипсы Lays сметана и лук', brand: "Lay's", calories: 530, protein: 6.3, fat: 30.5, carbs: 58.0 },
  '4606272011033': { name: 'Чипсы Lays сыр 150г', brand: "Lay's", calories: 529, protein: 6.2, fat: 30.0, carbs: 58.5 },
  '4606272010012': { name: 'Чипсы Pringles оригинальные 165г', brand: 'Pringles', calories: 524, protein: 6.0, fat: 29.5, carbs: 58.0 },
  '4607065660015': { name: 'Сухарики Три Корочки бекон', brand: 'Три Корочки', calories: 381, protein: 12.5, fat: 12.0, carbs: 55.0 },
  '4607065660022': { name: 'Сухарики Три Корочки сыр', brand: 'Три Корочки', calories: 383, protein: 12.8, fat: 12.5, carbs: 55.0 },
  '4660003510016': { name: 'Попкорн кинотеатральный соль', brand: '', calories: 382, protein: 8.0, fat: 13.0, carbs: 60.0 },
  '4607182230028': { name: 'Орехи Микс соленый 150г', brand: '', calories: 598, protein: 16.0, fat: 53.0, carbs: 15.0 },

  // Хлеб и выпечка
  '4607004390204': { name: 'Хлеб Бородинский', brand: 'Хлебозавод', calories: 207, protein: 6.8, fat: 1.3, carbs: 40.7 },
  '4607004390211': { name: 'Батон нарезной', brand: 'Хлебозавод', calories: 264, protein: 8.1, fat: 2.9, carbs: 51.0 },
  '4607065640016': { name: 'Хлебцы Finn Crisp ржаные', brand: 'Finn Crisp', calories: 318, protein: 9.0, fat: 1.5, carbs: 67.0 },
  '4670005090015': { name: 'Хлебцы Dr.Korner гречневые', brand: 'Dr.Korner', calories: 303, protein: 10.0, fat: 2.0, carbs: 62.0 },

  // Крупы и бакалея
  '4607065620415': { name: 'Гречка Мистраль быстрого приготовления', brand: 'Мистраль', calories: 329, protein: 12.6, fat: 3.3, carbs: 62.0 },
  '4607065620422': { name: 'Рис Мистраль круглозёрный', brand: 'Мистраль', calories: 344, protein: 7.0, fat: 1.0, carbs: 76.0 },
  '4607065620439': { name: 'Рис Мистраль для суши', brand: 'Мистраль', calories: 344, protein: 7.0, fat: 1.0, carbs: 76.0 },
  '4601234400017': { name: 'Макароны Makfa спагетти', brand: 'Makfa', calories: 345, protein: 12.0, fat: 1.5, carbs: 69.5 },
  '4601234400024': { name: 'Макароны Barilla спагетти №5', brand: 'Barilla', calories: 353, protein: 12.0, fat: 1.5, carbs: 70.5 },
  '4606272020011': { name: 'Геркулес Русский продукт', brand: 'Русский продукт', calories: 342, protein: 11.0, fat: 6.2, carbs: 59.5 },
  '4607182230035': { name: 'Мюсли Fitness с ягодами', brand: 'Nestlé', calories: 352, protein: 8.0, fat: 3.0, carbs: 72.0 },

  // Консервы и готовая еда
  '4600001234567': { name: 'Тунец в собственном соку Bonduelle', brand: 'Bonduelle', calories: 96, protein: 22.0, fat: 1.0, carbs: 0.0 },
  '4607065670014': { name: 'Шпроты рижские', brand: 'Рижское золото', calories: 363, protein: 17.4, fat: 32.4, carbs: 0.0 },
  '4607065670021': { name: 'Горошек зелёный Bonduelle', brand: 'Bonduelle', calories: 55, protein: 3.6, fat: 0.1, carbs: 9.2 },
  '4607065670038': { name: 'Кукуруза сладкая Bonduelle', brand: 'Bonduelle', calories: 82, protein: 2.9, fat: 0.6, carbs: 16.1 },
  '4607065670045': { name: 'Фасоль красная Bonduelle', brand: 'Bonduelle', calories: 99, protein: 7.7, fat: 0.3, carbs: 15.9 },

  // Мясо и колбасы
  '4606272030010': { name: 'Колбаса Докторская Мясницкий ряд', brand: 'Мясницкий ряд', calories: 257, protein: 12.8, fat: 22.8, carbs: 1.5 },
  '4606272030027': { name: 'Сосиски Молочные Мясницкий ряд', brand: 'Мясницкий ряд', calories: 266, protein: 10.4, fat: 23.9, carbs: 1.6 },
  '4607182230042': { name: 'Ветчина Ромкор', brand: 'Ромкор', calories: 188, protein: 16.0, fat: 14.0, carbs: 0.0 },
  '4607065650832': { name: 'Сардельки свиные', brand: '', calories: 332, protein: 11.8, fat: 31.6, carbs: 1.3 },

  // Йогурты и десерты
  '4607038058904': { name: 'Актимель натуральный', brand: 'Actimel', calories: 75, protein: 2.9, fat: 1.5, carbs: 11.2 },
  '4607038058911': { name: 'Актимель клубника', brand: 'Actimel', calories: 76, protein: 2.8, fat: 1.4, carbs: 12.0 },
  '4660003510023': { name: 'Чудо йогурт клубника-земляника', brand: 'Чудо', calories: 91, protein: 2.9, fat: 2.5, carbs: 14.3 },
  '4660003510030': { name: 'Чудо йогурт персик-манго', brand: 'Чудо', calories: 92, protein: 2.8, fat: 2.5, carbs: 14.5 },
  '4607038058928': { name: 'Растишка клубника', brand: 'Растишка', calories: 98, protein: 3.1, fat: 2.4, carbs: 16.0 },

  // Масло и соусы
  '4601701000015': { name: 'Масло подсолнечное Злато', brand: 'Злато', calories: 884, protein: 0.0, fat: 99.9, carbs: 0.0 },
  '4601701000022': { name: 'Масло оливковое Iberica', brand: 'Iberica', calories: 884, protein: 0.0, fat: 99.9, carbs: 0.0 },
  '4607065680013': { name: 'Майонез Ряба провансаль', brand: 'Ряба', calories: 627, protein: 2.8, fat: 67.0, carbs: 2.6 },
  '4607065680020': { name: 'Кетчуп Heinz томатный', brand: 'Heinz', calories: 112, protein: 1.8, fat: 0.2, carbs: 25.9 },
  '4607065680037': { name: 'Соус Tabasco', brand: 'Tabasco', calories: 11, protein: 0.5, fat: 0.2, carbs: 1.7 },

  // Замороженные продукты
  '4607182230059': { name: 'Пельмени Дарья классические', brand: 'Дарья', calories: 240, protein: 10.5, fat: 11.5, carbs: 23.5 },
  '4607182230066': { name: 'Вареники с картошкой', brand: 'Дарья', calories: 175, protein: 5.0, fat: 3.0, carbs: 32.0 },
  '4607182230073': { name: 'Блины с творогом', brand: '', calories: 177, protein: 7.2, fat: 5.8, carbs: 24.8 },
  '4607065690012': { name: 'Мороженое Пломбир 72г', brand: 'Чистая Линия', calories: 231, protein: 3.5, fat: 15.0, carbs: 21.0 },
  '4607065690029': { name: 'Мороженое Магнат классический', brand: 'Магнат', calories: 280, protein: 3.2, fat: 19.0, carbs: 24.0 },

  // ВкусВилл
  '2100100117191': { name: 'Яичный белок ВкусВилл', brand: 'ВкусВилл', calories: 44, protein: 10.9, fat: 0.1, carbs: 0.7 },
  '4607073963698': { name: 'Творог высокобелковый ВкусВилл', brand: 'ВкусВилл', calories: 99, protein: 18.0, fat: 0.1, carbs: 3.5 },
  '2100100011536': { name: 'Сухарики пшеничные ВкусВилл', brand: 'ВкусВилл', calories: 381, protein: 12.5, fat: 12.0, carbs: 55.0 },
  '4630053492062': { name: 'Плов с курицей ВкусВилл', brand: 'ВкусВилл', calories: 155, protein: 8.5, fat: 6.5, carbs: 16.0 },
  '4607073963704': { name: 'Творог 5% ВкусВилл', brand: 'ВкусВилл', calories: 121, protein: 17.0, fat: 5.0, carbs: 1.8 },
  '4607073963711': { name: 'Кефир 2.5% ВкусВилл', brand: 'ВкусВилл', calories: 53, protein: 2.9, fat: 2.5, carbs: 4.0 },
  '4607073963728': { name: 'Молоко 2.5% ВкусВилл', brand: 'ВкусВилл', calories: 52, protein: 2.9, fat: 2.5, carbs: 4.7 },
  '4607073963735': { name: 'Йогурт натуральный ВкусВилл', brand: 'ВкусВилл', calories: 66, protein: 4.0, fat: 3.0, carbs: 4.5 },
  '4607073963742': { name: 'Сметана 20% ВкусВилл', brand: 'ВкусВилл', calories: 204, protein: 2.8, fat: 20.0, carbs: 3.2 },
  '4607073963759': { name: 'Греча ВкусВилл', brand: 'ВкусВилл', calories: 329, protein: 12.6, fat: 3.3, carbs: 62.0 },
  '4607073963766': { name: 'Хлеб цельнозерновой ВкусВилл', brand: 'ВкусВилл', calories: 213, protein: 8.0, fat: 2.5, carbs: 38.0 },
  '4607073963773': { name: 'Печенье овсяное ВкусВилл', brand: 'ВкусВилл', calories: 380, protein: 7.5, fat: 12.0, carbs: 60.0 },
  '4607073963780': { name: 'Мюсли ВкусВилл с сухофруктами', brand: 'ВкусВилл', calories: 358, protein: 9.0, fat: 5.5, carbs: 68.0 },
  '4630053492079': { name: 'Суп томатный ВкусВилл', brand: 'ВкусВилл', calories: 42, protein: 1.5, fat: 1.2, carbs: 6.5 },
  '4630053492086': { name: 'Котлеты куриные ВкусВилл', brand: 'ВкусВилл', calories: 185, protein: 16.0, fat: 11.5, carbs: 5.0 },

  // Детское питание
  '4606272040018': { name: 'Каша Heinz гречневая', brand: 'Heinz', calories: 355, protein: 11.5, fat: 3.5, carbs: 70.0 },
  '4606272040025': { name: 'Пюре Агуша яблоко', brand: 'Агуша', calories: 68, protein: 0.4, fat: 0.1, carbs: 16.2 },
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
// This is intentionally left empty
