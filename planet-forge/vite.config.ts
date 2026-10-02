import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Planet Forge runs beside Aion Forge (port 5173), on its own port
const PORT = 5174

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1', port: PORT, strictPort: true,
    // The shared Planet Spec examples live beside this app, in contracts/
    fs: { allow: ['.', '../contracts'] },
  },
  preview: { host: '127.0.0.1', port: PORT, strictPort: true },
  test: { environment: 'node' },
})
