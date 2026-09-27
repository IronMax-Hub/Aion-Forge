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
    // Tests that build whole universes run every solid planet's world history
    // and, since C2.3b, the evolution of its life: minutes, not seconds
    testTimeout: 600_000,
  },
})
