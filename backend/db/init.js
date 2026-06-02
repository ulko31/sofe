const Database = require('better-sqlite3')
const path = require('path')

const db = new Database(path.join(__dirname, '../sofe.db'))

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT UNIQUE NOT NULL,
    name TEXT, username TEXT,
    goal TEXT DEFAULT 'health',
    calories INTEGER DEFAULT 2000,
    activity TEXT DEFAULT 'medium',
    onboarded INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS meals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    calories INTEGER DEFAULT 0,
    protein REAL DEFAULT 0,
    fat REAL DEFAULT 0,
    carbs REAL DEFAULT 0,
    type TEXT DEFAULT 'snack',
    date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS trackers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    water REAL DEFAULT 0,
    steps INTEGER DEFAULT 0,
    sleep REAL DEFAULT 0,
    pulse INTEGER DEFAULT 72,
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, date),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, type TEXT NOT NULL,
    duration INTEGER DEFAULT 30,
    level TEXT DEFAULT 'Средний',
    format TEXT DEFAULT 'Онлайн',
    description TEXT
  );
  CREATE TABLE IF NOT EXISTS user_workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL, workout_id INTEGER NOT NULL,
    date TEXT NOT NULL, completed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (workout_id) REFERENCES workouts(id)
  );
  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL, studio TEXT NOT NULL,
    total INTEGER NOT NULL, used INTEGER DEFAULT 0,
    expires_at TEXT, created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    calories INTEGER DEFAULT 0,
    protein REAL DEFAULT 0,
    fat REAL DEFAULT 0,
    carbs REAL DEFAULT 0,
    time INTEGER DEFAULT 15,
    emoji TEXT DEFAULT '🍽',
    tags TEXT DEFAULT '[]',
    image_url TEXT,
    ingredients TEXT DEFAULT '[]',
    steps TEXT DEFAULT '[]',
    servings INTEGER DEFAULT 2
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    type TEXT DEFAULT 'workout',
    date TEXT NOT NULL,
    time TEXT DEFAULT '10:00',
    end_time TEXT DEFAULT '11:00',
    emoji TEXT DEFAULT '🌸',
    location TEXT DEFAULT '',
    description TEXT DEFAULT '',
    link TEXT DEFAULT '',
    color TEXT DEFAULT '#E8437A',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS foods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    calories INTEGER NOT NULL,
    protein REAL DEFAULT 0,
    fat REAL DEFAULT 0,
    carbs REAL DEFAULT 0,
    unit TEXT DEFAULT '100г',
    unit_weight INTEGER DEFAULT 100
  );
`)

// Seed workouts
const wCount = db.prepare('SELECT COUNT(*) as cnt FROM workouts').get()
if (wCount.cnt === 0) {
  const ins = db.prepare('INSERT INTO workouts (name, type, duration, level, format) VALUES (?, ?, ?, ?, ?)')
  ;[
    ['FIT-тренировка','FIT',45,'Интенсивный','Онлайн'],
    ['Stretching','Stretching',30,'Лёгкий','Онлайн'],
    ['Fit ball','Fit ball',40,'Средний','Студия'],
    ['Йога для начинающих','Йога',50,'Лёгкий','Онлайн'],
    ['Пилатес','Пилатес',45,'Средний','Студия'],
    ['Силовая тренировка','FIT',60,'Высокий','Студия']
  ].forEach(w => ins.run(...w))
}

const { seedFoods } = require('./foods')
seedFoods(db)

const { seedRecipes } = require('./recipes_seed')
seedRecipes(db)

module.exports = db
