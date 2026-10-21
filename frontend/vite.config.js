import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Served from the root by default (http://localhost:5173/).
  // To deploy under a subfolder, build with e.g. VITE_BASE_PATH=/video-eval-mock/
  base: process.env.VITE_BASE_PATH || '/',
})
