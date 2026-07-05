// ============================================================
//  frontend/src/utils/socket.js — production version
// ============================================================

import { io } from 'socket.io-client'

// In dev: connect to the same origin (Vite proxies socket.io to backend)
// In prod: connect directly to the Render backend URL
const SOCKET_URL = import.meta.env.VITE_API_URL || undefined

let socket = null

export function getSocket() {
  if (!socket) {
    socket = SOCKET_URL
      ? io(SOCKET_URL, { autoConnect: false, transports: ['websocket', 'polling'] })
      : io({ autoConnect: false })
  }
  return socket
}

export function connectSocket() {
  const s = getSocket()
  if (!s.connected) {
    s.connect()
    s.on('connect', () => {
      const token = localStorage.getItem('mb_token')
      if (token) s.emit('connect_user', { token })
    })
  }
  return s
}

export function disconnectSocket() {
  socket?.disconnect()
}
