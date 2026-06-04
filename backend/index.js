require('dotenv').config()
const express = require('express')
const cors = require('cors')

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors({
  origin: '*',
  credentials: true
}))
app.use(express.json())

require('./db/init')

const userRoutes = require('./routes/user')
const nutritionRoutes = require('./routes/nutrition')
const miscRoutes = require('./routes/misc')
const foodsRoutes = require('./routes/foods')
const aiRoutes = require('./routes/ai')
const adminRoutes = require('./routes/admin')
const friendsRoutes = require('./routes/friends')

app.use('/api/user', userRoutes)
app.use('/api/nutrition', nutritionRoutes)
app.use('/api/foods', foodsRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/friends', friendsRoutes)
app.use('/api/trackers', (req, res, next) => { req.url = '/'; miscRoutes(req, res, next) })
app.use('/api', miscRoutes)

app.get('/health', (req, res) => res.json({ ok: true, version: '1.0.0' }))
app.get('/api/health', (req, res) => res.json({ ok: true, version: '1.0.0' }))

// Bot and notifications run in bot.js separately

app.listen(PORT, () => console.log(`🚀 SOFE Backend running on port ${PORT}`))
