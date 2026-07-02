import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // All /api calls go to the Express backend
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      // WebSocket for Socket.IO
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
      },
    },
  },
})
