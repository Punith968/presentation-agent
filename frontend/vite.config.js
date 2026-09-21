import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/audio': 'http://localhost:3000',
      '/slides': 'http://localhost:3000'
    }
  }
})
