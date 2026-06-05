require('dotenv').config()

// Use Turso (libsql) if configured, otherwise fall back to local SQLite
const TURSO_URL = process.env.TURSO_URL
const TURSO_TOKEN = process.env.TURSO_TOKEN

if (!TURSO_URL || !TURSO_TOKEN) {
  console.log('⚠️  No Turso config — using local SQLite (data will reset on restart)')
  const Database = require('better-sqlite3')
  const path = require('path')
  const fs = require('fs')
  const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/sofe.db')
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  initSqlite(db)
  module.exports = db
} else {
  console.log('🗄️  Using Turso cloud database')
  const { createClient } = require('@libsql/client')
  const tursoClient = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })
  
  // Create async-aware proxy that queues operations
  const db = createTursoProxy(tursoClient)
  
  // Init schema then export
  initTurso(tursoClient).then(() => {
    console.log('✅ Turso ready')
    seedRecipes(tursoClient).catch(console.error)
  }).catch(e => console.error('Turso init error:', e))
  
  module.exports = db
}

function createTursoProxy(client) {
  // Since all existing code uses sync API, we need a sync-compatible layer
  // We use Atomics + SharedArrayBuffer for true sync async bridging
  
  const { Worker, isMainThread, parentPort, workerData } = require('worker_threads')
  const path = require('path')
  
  // Simple synchronous execution via execFileSync trick
  function execSync(sql, params = []) {
    const { spawnSync } = require('child_process')
    const script = `
      const { createClient } = require('@libsql/client')
      const client = createClient({ url: '${TURSO_URL}', authToken: '${TURSO_TOKEN}' })
      client.execute({ sql: ${JSON.stringify(sql)}, args: ${JSON.stringify(params)} })
        .then(r => { process.stdout.write(JSON.stringify({ ok: true, data: r })); process.exit(0) })
        .catch(e => { process.stdout.write(JSON.stringify({ ok: false, error: e.message })); process.exit(0) })
    `
    const result = spawnSync('node', ['-e', script], { 
      encoding: 'utf8', timeout: 8000,
      cwd: path.join(__dirname, '..')
    })
    if (result.error) throw result.error
    try {
      const parsed = JSON.parse(result.stdout)
      if (!parsed.ok) throw new Error(parsed.error)
      return parsed.data
    } catch(e) {
      throw new Error('DB error: ' + result.stdout + result.stderr)
    }
  }

  function rowToObj(columns, row) {
    const obj = {}
    columns.forEach((col, i) => { obj[col] = row[i] !== undefined ? row[i] : null })
    return obj
  }

  return {
    prepare(sql) {
      return {
        run(...params) {
          const flat = params.flat()
          const r = execSync(sql, flat)
          return { lastInsertRowid: Number(r.lastInsertRowid || 0), changes: r.rowsAffected || 0 }
        },
        get(...params) {
          const flat = params.flat()
          const r = execSync(sql, flat)
          return r.rows?.length ? rowToObj(r.columns, r.rows[0]) : undefined
        },
        all(...params) {
          const flat = params.flat()
          const r = execSync(sql, flat)
          return (r.rows || []).map(row => rowToObj(r.columns, row))
        }
      }
    },
    exec(sql) {
      try { execSync(sql, []) } catch(e) { /* ignore alter table errors */ }
    },
    transaction(fn) {
      return (items) => { for (const item of items) fn([item]) }
    }
  }
}

async function seedRecipes(client) {
  try {
    // Update images even if recipes exist
    const existing = await client.execute("SELECT COUNT(*) as cnt FROM recipes")
    const count = Number(existing.rows[0][0])
    if (count > 0) {
      // Update images for existing recipes
      const imageUpdates = [
        { name: 'Греческий салат', url: '/recipes/salad.jpg' },
        { name: 'Овсянка с ягодами', url: '/recipes/oatmeal.jpg' },
        { name: 'Куриная грудка с овощами', url: '/recipes/chicken.jpg' },
        { name: 'Смузи-боул', url: '/recipes/smoothie_bowl.jpg' },
        { name: 'Творожные сырники', url: '/recipes/syrniki.jpg' },
        { name: 'Боул с лососем и рисом', url: '/recipes/salmon_bowl.jpg' },
        { name: 'Зелёный детокс-смузи', url: '/recipes/green_smoothie.jpg' },
        { name: 'Запечённая рыба с лимоном', url: '/recipes/fish.jpg' }
      ]
      for (const { name, url } of imageUpdates) {
        await client.execute({ sql: 'UPDATE recipes SET image_url = ? WHERE name = ?', args: [url, name] })
      }
      return
    }

    const recipes = [
      { name: 'Греческий салат', calories: 100, protein: 3.5, fat: 7.0, carbs: 6.0, time: 10, emoji: '🥗', tags: '["ПП","Лёгкий","Без готовки"]', image_url: '/recipes/salad.jpg', ingredients: '[{"name":"Помидоры черри","amount":"200г"},{"name":"Огурец","amount":"1 шт"},{"name":"Перец болгарский","amount":"1 шт"},{"name":"Маслины","amount":"50г"},{"name":"Сыр Фета","amount":"100г"},{"name":"Оливковое масло","amount":"2 ст.л."},{"name":"Орегано","amount":"по вкусу"}]', steps: '[{"step":1,"text":"Нарежь помидоры пополам"},{"step":2,"text":"Огурец и перец нарежь кубиками"},{"step":3,"text":"Добавь маслины и раскроши фету"},{"step":4,"text":"Заправь оливковым маслом и орегано"}]', servings: 2 },
      { name: 'Овсянка с ягодами', calories: 180, protein: 6.0, fat: 4.0, carbs: 32.0, time: 10, emoji: '🫐', tags: '["Завтрак","ПП","Быстро"]', image_url: '/recipes/oatmeal.jpg', ingredients: '[{"name":"Овсяные хлопья","amount":"80г"},{"name":"Молоко","amount":"200мл"},{"name":"Черника","amount":"100г"},{"name":"Банан","amount":"1 шт"},{"name":"Мёд","amount":"1 ч.л."}]', steps: '[{"step":1,"text":"Залей хлопья горячим молоком"},{"step":2,"text":"Дай настояться 5 минут"},{"step":3,"text":"Добавь ягоды и нарезанный банан"},{"step":4,"text":"Сбрызни мёдом"}]', servings: 1 },
      { name: 'Куриная грудка с овощами', calories: 165, protein: 28.0, fat: 4.0, carbs: 8.0, time: 25, emoji: '🍗', tags: '["Обед","Белки","ПП"]', image_url: '/recipes/chicken.jpg', ingredients: '[{"name":"Куриная грудка","amount":"300г"},{"name":"Брокколи","amount":"200г"},{"name":"Морковь","amount":"1 шт"},{"name":"Оливковое масло","amount":"1 ст.л."},{"name":"Соль, специи","amount":"по вкусу"}]', steps: '[{"step":1,"text":"Нарежь курицу кусочками и замаринуй со специями"},{"step":2,"text":"Обжарь на оливковом масле 7-8 минут"},{"step":3,"text":"Добавь овощи и туши ещё 10 минут"},{"step":4,"text":"Подавай горячим"}]', servings: 2 },
      { name: 'Смузи-боул', calories: 220, protein: 8.0, fat: 5.0, carbs: 38.0, time: 10, emoji: '🍓', tags: '["Завтрак","Витамины","Красиво"]', image_url: '/recipes/smoothie_bowl.jpg', ingredients: '[{"name":"Замороженная клубника","amount":"150г"},{"name":"Банан","amount":"1 шт"},{"name":"Греческий йогурт","amount":"100г"},{"name":"Гранола","amount":"30г"},{"name":"Свежие ягоды","amount":"50г"},{"name":"Семена чиа","amount":"1 ч.л."}]', steps: '[{"step":1,"text":"Взбей клубнику с бананом и йогуртом"},{"step":2,"text":"Вылей в миску"},{"step":3,"text":"Укрась гранолой, ягодами и семенами чиа"}]', servings: 1 },
      { name: 'Творожные сырники', calories: 220, protein: 14.0, fat: 8.0, carbs: 22.0, time: 20, emoji: '🧀', tags: '["Завтрак","Белки","Вкусно"]', image_url: '/recipes/syrniki.jpg', ingredients: '[{"name":"Творог 5%","amount":"300г"},{"name":"Яйцо","amount":"1 шт"},{"name":"Мука","amount":"3 ст.л."},{"name":"Сахар","amount":"1 ст.л."},{"name":"Ванилин","amount":"щепотка"},{"name":"Сметана","amount":"для подачи"}]', steps: '[{"step":1,"text":"Смешай творог с яйцом, мукой и сахаром"},{"step":2,"text":"Слепи небольшие лепёшки"},{"step":3,"text":"Обжарь на среднем огне по 3-4 минуты с каждой стороны"},{"step":4,"text":"Подавай со сметаной или вареньем"}]', servings: 2 },
      { name: 'Боул с лососем и рисом', calories: 380, protein: 28.0, fat: 12.0, carbs: 40.0, time: 20, emoji: '🍱', tags: '["Обед","Омега-3","Сытно"]', image_url: '/recipes/salmon_bowl.jpg', ingredients: '[{"name":"Рис","amount":"150г"},{"name":"Лосось","amount":"150г"},{"name":"Авокадо","amount":"0.5 шт"},{"name":"Огурец","amount":"0.5 шт"},{"name":"Соевый соус","amount":"1 ст.л."},{"name":"Кунжут","amount":"1 ч.л."}]', steps: '[{"step":1,"text":"Отвари рис"},{"step":2,"text":"Запеки лосось 12 минут при 180°C"},{"step":3,"text":"Нарежь авокадо и огурец"},{"step":4,"text":"Собери боул: рис + рыба + овощи"},{"step":5,"text":"Полей соевым соусом и посыпь кунжутом"}]', servings: 1 },
      { name: 'Зелёный детокс-смузи', calories: 95, protein: 3.0, fat: 2.0, carbs: 18.0, time: 5, emoji: '🥤', tags: '["Детокс","Витамины","Быстро"]', image_url: '/recipes/green_smoothie.jpg', ingredients: '[{"name":"Шпинат","amount":"50г"},{"name":"Банан","amount":"1 шт"},{"name":"Яблоко","amount":"1 шт"},{"name":"Имбирь","amount":"1 см"},{"name":"Вода или кокосовое молоко","amount":"200мл"}]', steps: '[{"step":1,"text":"Положи все ингредиенты в блендер"},{"step":2,"text":"Взбивай 1-2 минуты до однородности"},{"step":3,"text":"Перелей в стакан и пей сразу"}]', servings: 1 },
      { name: 'Запечённая рыба с лимоном', calories: 145, protein: 24.0, fat: 5.0, carbs: 2.0, time: 25, emoji: '🐟', tags: '["Ужин","ПП","Белки"]', image_url: '/recipes/fish.jpg', ingredients: '[{"name":"Белая рыба (треска или тилапия)","amount":"300г"},{"name":"Лимон","amount":"1 шт"},{"name":"Чеснок","amount":"2 зубчика"},{"name":"Оливковое масло","amount":"1 ст.л."},{"name":"Зелень","amount":"по вкусу"}]', steps: '[{"step":1,"text":"Разогрей духовку до 200°C"},{"step":2,"text":"Выложи рыбу на фольгу"},{"step":3,"text":"Полей маслом, добавь чеснок и дольки лимона"},{"step":4,"text":"Запекай 15-18 минут"},{"step":5,"text":"Посыпь зеленью и подавай"}]', servings: 2 }
    ]
    
    for (const r of recipes) {
      await client.execute({
        sql: 'INSERT INTO recipes (name, calories, protein, fat, carbs, time, emoji, tags, image_url, ingredients, steps, servings) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        args: [r.name, r.calories, r.protein, r.fat, r.carbs, r.time, r.emoji, r.tags, r.image_url, r.ingredients, r.steps, r.servings]
      })
    }
    console.log('✅ Seeded', recipes.length, 'recipes')
  } catch(e) { console.error('Recipe seed error:', e.message) }
}

async function initTurso(client) {
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, telegram_id TEXT UNIQUE NOT NULL,
      name TEXT, username TEXT, calories INTEGER DEFAULT 2000,
      goal TEXT DEFAULT 'health', activity TEXT DEFAULT 'medium',
      age INTEGER, weight REAL, height REAL, gender TEXT DEFAULT 'female',
      onboarded INTEGER DEFAULT 0,
      notifications_enabled INTEGER DEFAULT 1,
      notify_water INTEGER DEFAULT 1, notify_meals INTEGER DEFAULT 1,
      notify_events INTEGER DEFAULT 1, notify_morning INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      name TEXT NOT NULL, calories INTEGER DEFAULT 0,
      protein REAL DEFAULT 0, fat REAL DEFAULT 0, carbs REAL DEFAULT 0,
      type TEXT DEFAULT 'snack', date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS trackers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      date TEXT NOT NULL, water REAL DEFAULT 0, steps INTEGER DEFAULT 0,
      sleep REAL DEFAULT 0, pulse INTEGER DEFAULT 72,
      UNIQUE(user_id, date))`,
    `CREATE TABLE IF NOT EXISTS workouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      type TEXT NOT NULL, duration INTEGER DEFAULT 30,
      level TEXT DEFAULT 'Средний', format TEXT DEFAULT 'Онлайн',
      description TEXT, video_url TEXT, thumbnail_url TEXT, instructor TEXT)`,
    `CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      studio TEXT NOT NULL, total INTEGER DEFAULT 8, used INTEGER DEFAULT 0, expires_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      calories INTEGER DEFAULT 0, protein REAL DEFAULT 0,
      fat REAL DEFAULT 0, carbs REAL DEFAULT 0,
      time INTEGER DEFAULT 15, emoji TEXT DEFAULT '🍽',
      tags TEXT DEFAULT '[]', image_url TEXT,
      ingredients TEXT DEFAULT '[]', steps TEXT DEFAULT '[]', servings INTEGER DEFAULT 2)`,
    `CREATE TABLE IF NOT EXISTS foods (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      calories INTEGER DEFAULT 0, protein REAL DEFAULT 0,
      fat REAL DEFAULT 0, carbs REAL DEFAULT 0,
      unit TEXT DEFAULT '100г', unit_weight INTEGER DEFAULT 100)`,
    `CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL,
      type TEXT DEFAULT 'workout', date TEXT NOT NULL,
      time TEXT DEFAULT '10:00', end_time TEXT DEFAULT '11:00',
      emoji TEXT DEFAULT '🌸', location TEXT DEFAULT '',
      description TEXT DEFAULT '', link TEXT DEFAULT '',
      color TEXT DEFAULT '#E8437A', created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS places (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      type TEXT DEFAULT 'studio', address TEXT, lat REAL, lng REAL,
      description TEXT, phone TEXT, website TEXT,
      emoji TEXT DEFAULT '📍', color TEXT DEFAULT '#E8437A',
      rating REAL DEFAULT 0, tags TEXT DEFAULT '[]',
      parent_id INTEGER DEFAULT NULL, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS friendships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL, friend_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS user_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE,
      lat REAL, lng REAL, share_location INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS notifications_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER,
      type TEXT, data TEXT, sent INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')))`
  ]
  for (const sql of tables) {
    try { await client.execute(sql) } catch(e) {}
  }
}

function initSqlite(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, telegram_id TEXT UNIQUE NOT NULL,
      name TEXT, username TEXT, calories INTEGER DEFAULT 2000,
      goal TEXT DEFAULT 'health', activity TEXT DEFAULT 'medium',
      age INTEGER, weight REAL, height REAL, gender TEXT DEFAULT 'female',
      onboarded INTEGER DEFAULT 0,
      notifications_enabled INTEGER DEFAULT 1,
      notify_water INTEGER DEFAULT 1, notify_meals INTEGER DEFAULT 1,
      notify_events INTEGER DEFAULT 1, notify_morning INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      name TEXT NOT NULL, calories INTEGER DEFAULT 0,
      protein REAL DEFAULT 0, fat REAL DEFAULT 0, carbs REAL DEFAULT 0,
      type TEXT DEFAULT 'snack', date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS trackers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      date TEXT NOT NULL, water REAL DEFAULT 0, steps INTEGER DEFAULT 0,
      sleep REAL DEFAULT 0, pulse INTEGER DEFAULT 72,
      UNIQUE(user_id, date));
    CREATE TABLE IF NOT EXISTS workouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      type TEXT NOT NULL, duration INTEGER DEFAULT 30,
      level TEXT DEFAULT 'Средний', format TEXT DEFAULT 'Онлайн',
      description TEXT, video_url TEXT, thumbnail_url TEXT, instructor TEXT);
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      studio TEXT NOT NULL, total INTEGER DEFAULT 8, used INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      calories INTEGER DEFAULT 0, protein REAL DEFAULT 0,
      fat REAL DEFAULT 0, carbs REAL DEFAULT 0,
      time INTEGER DEFAULT 15, emoji TEXT DEFAULT '🍽',
      tags TEXT DEFAULT '[]', image_url TEXT,
      ingredients TEXT DEFAULT '[]', steps TEXT DEFAULT '[]', servings INTEGER DEFAULT 2);
    CREATE TABLE IF NOT EXISTS foods (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      calories INTEGER DEFAULT 0, protein REAL DEFAULT 0,
      fat REAL DEFAULT 0, carbs REAL DEFAULT 0,
      unit TEXT DEFAULT '100г', unit_weight INTEGER DEFAULT 100);
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL,
      type TEXT DEFAULT 'workout', date TEXT NOT NULL,
      time TEXT DEFAULT '10:00', end_time TEXT DEFAULT '11:00',
      emoji TEXT DEFAULT '🌸', location TEXT DEFAULT '',
      description TEXT DEFAULT '', link TEXT DEFAULT '',
      color TEXT DEFAULT '#E8437A', created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS places (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      type TEXT DEFAULT 'studio', address TEXT, lat REAL, lng REAL,
      description TEXT, phone TEXT, website TEXT,
      emoji TEXT DEFAULT '📍', color TEXT DEFAULT '#E8437A',
      rating REAL DEFAULT 0, tags TEXT DEFAULT '[]',
      parent_id INTEGER DEFAULT NULL, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS friendships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL, friend_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS user_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE,
      lat REAL, lng REAL, share_location INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS notifications_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER,
      type TEXT, data TEXT, sent INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')));
  `)
  console.log('✅ SQLite schema ready')
}
