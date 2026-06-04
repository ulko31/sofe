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
