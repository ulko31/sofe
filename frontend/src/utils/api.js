import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000
})

api.interceptors.request.use(config => {
  const tg = window.Telegram?.WebApp
  const initData = tg?.initData || ''
  if (initData) {
    config.headers['X-Telegram-Init-Data'] = initData
  }
  return config
})

// Retry on 401 after short delay (Telegram may not be ready yet)
api.interceptors.response.use(
  res => res,
  async err => {
    if (err.response?.status === 401 && !err.config._retry) {
      err.config._retry = true
      await new Promise(r => setTimeout(r, 1000))
      const tg = window.Telegram?.WebApp
      const initData = tg?.initData || ''
      if (initData) {
        err.config.headers['X-Telegram-Init-Data'] = initData
      }
      return api(err.config)
    }
    return Promise.reject(err)
  }
)

export default api

export const getMe = () => api.get('/user/me')
export const updateProfile = (data) => api.put('/user/profile', data)

export const getTodayStats = () => {
  const date = new Date()
  const y = date.getFullYear()
  const m = String(date.getMonth()+1).padStart(2,'0')
  const d = String(date.getDate()).padStart(2,'0')
  return api.get('/nutrition/today', { params: { date: `${y}-${m}-${d}` } })
}
export const getMeals = (date) => api.get('/nutrition/meals', { params: { date } })
export const addMeal = (data) => api.post('/nutrition/meals', data)
export const deleteMeal = (id) => api.delete(`/nutrition/meals/${id}`)

export const searchFoods = (q) => api.get('/foods/search', { params: { q } })

export const getTrackers = (date) => api.get('/trackers', { params: { date } })
export const updateTracker = (type, value) => api.put('/trackers', { [type]: value })

export const getWorkouts = () => api.get('/workouts')
export const getMyWorkouts = () => api.get('/workouts/my')
export const addWorkout = (data) => api.post('/workouts/my', data)

export const getSubscriptions = () => api.get('/subscriptions')
export const getRecipes = () => api.get('/recipes')
export const getProgress = () => api.get('/progress')
