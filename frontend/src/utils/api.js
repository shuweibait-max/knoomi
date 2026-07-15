// ============================================================
//  frontend/src/utils/api.js — production version
// ============================================================

import axios from 'axios'
import { signOut } from 'firebase/auth'
import { auth } from '../config/firebase'

// In dev: '/api' is proxied by Vite to localhost:5000
// In prod: point to your Render backend URL via VITE_API_URL env var
const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'

const api = axios.create({ baseURL: BASE_URL })

api.interceptors.request.use(async config => {
  // Always ask the SDK for a fresh ID token — it handles the hourly
  // refresh internally, so we never cache a raw token string ourselves.
  const token = await auth.currentUser?.getIdToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      signOut(auth)
    }
    return Promise.reject(err)
  }
)

export default api
