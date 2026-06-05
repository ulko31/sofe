import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000
})

api.interceptors.request.use(config => {
  const tg = window.Telegram?.WebApp
  if (tg?.initData) {
    config.headers['X-Telegram-Init-Data'] = tg.initData
  }
  return config
})

export default api

export const getMe = () => api.get('/user/me')
export const updateProfile = (data) => api.put('/user/profile', data)

export const getTodayStats = () => api.get('/nutrition/today')
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
export const addSubscription = (data) => api.post('/subscriptions', data)

export const getRecipes = () => api.get('/recipes')
export const getProgress = () => api.get('/progress')
