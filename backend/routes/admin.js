require('dotenv').config()
const express = require('express')
const router = express.Router()
const { query: q, queryOne: qOne, run: r, exec } = require('../db/turso')

const adminAuth = (req, res, next) => {
  const token = req.headers['x-admin-token'] || req.query.token
  if (token !== process.env.ADMIN_TOKEN) return res.status(403).json({ error: 'Forbidden' })
  next()
}

// STATS for dashboard
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const users = await q('SELECT * FROM users')
    const meals = await q('SELECT * FROM meals')
    const events = await q('SELECT * FROM events')
    const recipes = await q('SELECT * FROM recipes')
    const today = new Date().toISOString().split('T')[0]
    const todayMeals = meals.filter(m => m.date === today)
    const activeToday = new Set(todayMeals.map(m => m.user_id)).size
    res.json({
      totalUsers: users.length,
      onboardedUsers: users.filter(u => u.onboarded).length,
      activeToday,
      totalMeals: meals.length,
      totalEvents: events.length,
      totalRecipes: recipes.length,
      newUsersToday: users.filter(u => u.created_at?.startsWith(today)).length
    })
  } catch(e) { res.status(500).json({ error: e.message }) }
})

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

// NUTRITION (user meals log)
router.get('/nutrition', adminAuth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0]
    const meals = await q(`
      SELECT m.*, u.name as user_name, u.telegram_id
      FROM meals m
      LEFT JOIN users u ON u.id = m.user_id
      ORDER BY m.created_at DESC
      LIMIT 200
    `)
    const todayMeals = meals.filter(m => m.date === today)
    const todayCalories = todayMeals.reduce((s, m) => s + (m.calories || 0), 0)
    // Average calories per user per day
    const allCalories = meals.reduce((s, m) => s + (m.calories || 0), 0)
    const avgCalories = meals.length ? Math.round(allCalories / meals.length * 3) : 0
    // Popular meal type
    const typeCounts = {}
    meals.forEach(m => { typeCounts[m.type] = (typeCounts[m.type] || 0) + 1 })
    const popularType = Object.entries(typeCounts).sort((a,b) => b[1]-a[1])[0]?.[0] || '—'
    res.json({
      meals, // for backwards compat
      recentMeals: meals.slice(0, 50),
      total: meals.length,
      today: todayCalories,
      avgCalories,
      popularType
    })
  } catch(e) { res.status(500).json({ error: e.message }) }
})

router.delete('/nutrition/:id', adminAuth, async (req, res) => {
  await r('DELETE FROM meals WHERE id = ?', [req.params.id])
  res.json({ ok: true })
})

// STATS for dashboard
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const users = await q('SELECT * FROM users')
    const meals = await q('SELECT * FROM meals')
    const events = await q('SELECT * FROM events')
    const recipes = await q('SELECT * FROM recipes')
    const today = new Date().toISOString().split('T')[0]
    const todayMeals = meals.filter(m => m.date === today)
    const activeToday = new Set(todayMeals.map(m => m.user_id)).size
    res.json({
      totalUsers: users.length,
      onboardedUsers: users.filter(u => u.onboarded).length,
      activeToday,
      totalMeals: meals.length,
      totalEvents: events.length,
      totalRecipes: recipes.length,
      newUsersToday: users.filter(u => u.created_at?.startsWith(today)).length
    })
  } catch(e) { res.status(500).json({ error: e.message }) }
})

// USERS - update onboarded/notifications
router.put('/users/:id', adminAuth, async (req, res) => {
  const { onboarded, notifications_enabled, calories, goal } = req.body
  await r(`UPDATE users SET
    onboarded = COALESCE(?, onboarded),
    notifications_enabled = COALESCE(?, notifications_enabled),
    calories = COALESCE(?, calories),
    goal = COALESCE(?, goal)
    WHERE id = ?`,
    [onboarded != null ? onboarded : null,
     notifications_enabled != null ? notifications_enabled : null,
     calories || null, goal || null, req.params.id])
  res.json(await qOne('SELECT * FROM users WHERE id = ?', [req.params.id]))
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


async function ensureBroadcastsTable() {
  await exec(`CREATE TABLE IF NOT EXISTS broadcasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    title TEXT DEFAULT '',
    message TEXT NOT NULL,
    audience TEXT DEFAULT 'all',
    button_text TEXT DEFAULT '',
    button_url TEXT DEFAULT '',
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`)
}

// BROADCASTS — separate from personal reminder preferences
router.get('/broadcasts', adminAuth, async (req, res) => {
  try {
    await ensureBroadcastsTable()
    const broadcasts = await q('SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT 100')
    res.json({ broadcasts })
  } catch(e) { res.status(500).json({ error: e.message }) }
})

router.post('/broadcasts', adminAuth, async (req, res) => {
  const {
    type = 'announcement',
    title = '',
    message = '',
    audience = 'all',
    button_text = '',
    button_url = ''
  } = req.body || {}

  const cleanMessage = String(message).trim()
  const cleanTitle = String(title).trim()
  if (!cleanMessage) return res.status(400).json({ error: 'Введите текст рассылки' })
  if (cleanMessage.length > 3500) return res.status(400).json({ error: 'Текст рассылки слишком длинный' })
  if (!process.env.BOT_TOKEN) return res.status(500).json({ error: 'BOT_TOKEN не настроен' })

  const safeType = ['announcement', 'motivation', 'event'].includes(type) ? type : 'announcement'
  const safeAudience = audience === 'reminders' ? 'reminders' : 'all'
  const icons = { announcement: '📣', motivation: '✨', event: '📅' }
  const heading = cleanTitle ? `${icons[safeType]} ${cleanTitle}\n\n` : `${icons[safeType]} `
  const text = heading + cleanMessage

  try {
    await ensureBroadcastsTable()
    const users = await q(
      safeAudience === 'reminders'
        ? 'SELECT telegram_id FROM users WHERE onboarded = 1 AND notifications_enabled = 1 AND telegram_id IS NOT NULL'
        : 'SELECT telegram_id FROM users WHERE onboarded = 1 AND telegram_id IS NOT NULL'
    )

    let sent = 0
    let failed = 0
    const url = String(button_url || '').trim()
    const label = String(button_text || '').trim()
    const replyMarkup = label && /^https:\/\//i.test(url)
      ? { inline_keyboard: [[{ text: label, url }]] }
      : undefined

    for (const user of users) {
      try {
        const response = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: user.telegram_id,
            text,
            reply_markup: replyMarkup
          })
        })
        if (response.ok) sent += 1
        else failed += 1
      } catch {
        failed += 1
      }
      await new Promise(resolve => setTimeout(resolve, 60))
    }

    const result = await r(
      'INSERT INTO broadcasts (type, title, message, audience, button_text, button_url, sent_count, failed_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [safeType, cleanTitle, cleanMessage, safeAudience, label, url, sent, failed]
    )
    res.json({ ok: true, id: result.lastInsertRowid, recipients: users.length, sent, failed })
  } catch(e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
