require('dotenv').config()
const express = require('express')
const cors = require('cors')

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors({
  origin: '*',
  credentials: true
}))
app.use('/api/food-photo', express.json({ limit: '3mb' }), require('./routes/foodPhoto'))
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
app.use('/api', miscRoutes)

app.get('/health', (req, res) => res.json({ ok: true, version: '1.0.0' }))
app.get('/api/health', (req, res) => res.json({ ok: true, version: '1.0.0' }))

// Start bot with notifications
const { runDueNotifications } = require('./bot')

app.post('/api/internal/notifications/run', async (req, res) => {
  const expected = process.env.NOTIFICATION_SECRET
  const provided = req.headers['x-notification-secret']
  if (!expected || provided !== expected) return res.status(401).json({ error: 'Unauthorized' })

  try {
    res.json(await runDueNotifications())
  } catch (error) {
    console.error('Notification run failed:', error.message)
    res.status(500).json({ error: 'Notification run failed' })
  }
})

app.listen(PORT, () => console.log(`🚀 SOFE Backend running on port ${PORT}`))
