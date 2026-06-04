// Async Turso client - use this directly in routes
require('dotenv').config()
const { createClient } = require('@libsql/client')

const client = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN
})

// Helper: execute and return rows as objects
async function query(sql, args = []) {
  const res = await client.execute({ sql, args })
  return res.rows.map(row => {
    const obj = {}
    res.columns.forEach((col, i) => { obj[col] = row[i] ?? null })
    return obj
  })
}

// Helper: execute and return first row
async function queryOne(sql, args = []) {
  const rows = await query(sql, args)
  return rows[0] ?? null
}

// Helper: execute mutation (INSERT/UPDATE/DELETE)
async function run(sql, args = []) {
  const res = await client.execute({ sql, args })
  return { lastInsertRowid: Number(res.lastInsertRowid ?? 0), changes: res.rowsAffected ?? 0 }
}

// Helper: execute DDL
async function exec(sql) {
  try { await client.execute(sql) } catch(e) { /* ignore already exists */ }
}

module.exports = { client, query, queryOne, run, exec }
