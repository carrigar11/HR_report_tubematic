import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    allowedHosts: ['monitor-renewing-oarfish.ngrok-free.app', 'https://distent-trilocular-mickie.ngrok-free.dev', 'distent-trilocular-mickie.ngrok-free.dev'],
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
