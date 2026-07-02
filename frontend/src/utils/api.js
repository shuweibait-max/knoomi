<<<<<<< HEAD
// ============================================================
//  frontend/src/utils/api.js — production version
// ============================================================

import axios from 'axios'

// In dev: '/api' is proxied by Vite to localhost:5000
// In prod: point to your Render backend URL via VITE_API_URL env var
const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'

const api = axios.create({ baseURL: BASE_URL })

=======
import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

// Attach JWT to every request
>>>>>>> 25715433bb13ee2baeb33eb1d9914574e804fc48
api.interceptors.request.use(config => {
  const token = localStorage.getItem('mb_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

<<<<<<< HEAD
=======
// Auto-logout on 401
>>>>>>> 25715433bb13ee2baeb33eb1d9914574e804fc48
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('mb_token')
      localStorage.removeItem('mb_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
