import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // When VITE_API_BASE_URL is set (real MAJA-backed backend), proxy /api
    // to the local backend during development.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
