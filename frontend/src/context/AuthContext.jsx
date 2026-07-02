import { createContext, useContext, useState, useEffect } from 'react'
import api from '../utils/api'
import { connectSocket, disconnectSocket } from '../utils/socket'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(() => JSON.parse(localStorage.getItem('mb_user') || 'null'))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('mb_token')
    if (token) {
      api.get('/auth/me')
        .then(r => { setUser(r.data); connectSocket() })
        .catch(() => { localStorage.removeItem('mb_token'); localStorage.removeItem('mb_user') })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('mb_token', data.token)
    localStorage.setItem('mb_user', JSON.stringify(data.user))
    setUser(data.user)
    connectSocket()
    return data.user
  }

  const register = async (username, email, password, role = 'user') => {
    const { data } = await api.post('/auth/register', { username, email, password, role })
    localStorage.setItem('mb_token', data.token)
    localStorage.setItem('mb_user', JSON.stringify(data.user))
    setUser(data.user)
    connectSocket()
    return data.user
  }

  const logout = () => {
    localStorage.removeItem('mb_token')
    localStorage.removeItem('mb_user')
    disconnectSocket()
    setUser(null)
  }

  const updateUser = (updatedFields) => {
    const merged = { ...user, ...updatedFields }
    localStorage.setItem('mb_user', JSON.stringify(merged))
    setUser(merged)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
