import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
  server: {
    // Repassa as chamadas /api para o backend (npm run server)
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
  // `npm run preview` (a versão publicada, com o app instalável): mesma coisa
  preview: {
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
})
