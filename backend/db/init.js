const Database = require('better-sqlite3')
const path = require('path')

const db = new Database(path.join(__dirname, '../sofe.db'))

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT UNIQUE NOT NULL,
    name TEXT,
    username TEXT,
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
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    duration INTEGER DEFAULT 30,
    level TEXT DEFAULT 'Средний',
    format TEXT DEFAULT 'Онлайн',
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS user_workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    workout_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (workout_id) REFERENCES workouts(id)
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    studio TEXT NOT NULL,
    total INTEGER NOT NULL,
    used INTEGER DEFAULT 0,
    expires_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    calories INTEGER DEFAULT 0,
    time INTEGER DEFAULT 15,
    emoji TEXT DEFAULT '🍽',
    tags TEXT DEFAULT '[]',
    ingredients TEXT DEFAULT '[]',
    steps TEXT DEFAULT '[]'
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
const existingWorkouts = db.prepare('SELECT COUNT(*) as cnt FROM workouts').get()
if (existingWorkouts.cnt === 0) {
  const insertWorkout = db.prepare('INSERT INTO workouts (name, type, duration, level, format) VALUES (?, ?, ?, ?, ?)')
  ;[
    ['FIT-тренировка', 'FIT', 45, 'Интенсивный', 'Онлайн'],
    ['Stretching', 'Stretching', 30, 'Лёгкий', 'Онлайн'],
    ['Fit ball', 'Fit ball', 40, 'Средний', 'Студия'],
    ['Йога для начинающих', 'Йога', 50, 'Лёгкий', 'Онлайн'],
    ['Пилатес', 'Пилатес', 45, 'Средний', 'Студия'],
    ['Силовая тренировка', 'FIT', 60, 'Высокий', 'Студия']
  ].forEach(w => insertWorkout.run(...w))
}

// Seed recipes
const existingRecipes = db.prepare('SELECT COUNT(*) as cnt FROM recipes').get()
if (existingRecipes.cnt === 0) {
  const insertRecipe = db.prepare('INSERT INTO recipes (name, calories, time, emoji, tags) VALUES (?, ?, ?, ?, ?)')
  ;[
    ['Креветки с брокколи', 320, 25, '🍤', '["Белок","ПП"]'],
    ['Зелёный салат', 180, 10, '🥗', '["Лёгкий"]'],
    ['Паста с говядиной', 490, 40, '🍝', '["Сытный"]'],
    ['Смузи-боул', 260, 5, '🥣', '["Завтрак"]'],
    ['Омлет с овощами', 220, 15, '🍳', '["Завтрак","Белок"]'],
    ['Куриный суп', 280, 45, '🍲', '["ПП","Сытный"]']
  ].forEach(r => insertRecipe.run(...r))
}

// Seed foods
const { seedFoods } = require('./foods')
seedFoods()

module.exports = db
