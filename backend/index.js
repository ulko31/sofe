require('dotenv').config()
const express = require('express')
const cors = require('cors')

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors({
  origin: [
    process.env.MINI_APP_URL,
    'http://localhost:3000',
    'https://localhost:3000'
  ],
  credentials: true
}))
app.use(express.json())

// Init DB
require('./db/init')

// Routes
const userRoutes = require('./routes/user')
const nutritionRoutes = require('./routes/nutrition')
const miscRoutes = require('./routes/misc')
const foodsRoutes = require('./routes/foods')

app.use('/api/user', userRoutes)
app.use('/api/nutrition', nutritionRoutes)
app.use('/api/foods', foodsRoutes)
app.use('/api/trackers', (req, res, next) => { req.url = '/'; miscRoutes(req, res, next) })
app.use('/api', miscRoutes)

app.get('/health', (req, res) => res.json({ ok: true, version: '1.0.0' }))

app.listen(PORT, () => {
  console.log(`🚀 SOFE Backend running on port ${PORT}`)
})
