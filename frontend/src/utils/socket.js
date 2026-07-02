import { io } from 'socket.io-client'

let socket = null

export function getSocket() {
  if (!socket) socket = io({ autoConnect: false })
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
