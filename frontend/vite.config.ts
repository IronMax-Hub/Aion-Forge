import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    proxy: { '/api': 'http://127.0.0.1:4000' },
  },
  preview: {
    proxy: { '/api': 'http://127.0.0.1:4000' },
  },
  test: {
    environment: 'node',
  },
})
