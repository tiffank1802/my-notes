import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/my-notes/',
  server: {
    allowedHosts: true, // Permet l'aperçu depuis n'importe quel host (e2b.app, etc.)
  },
})
