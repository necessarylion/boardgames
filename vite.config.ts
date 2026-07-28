import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Bind to every interface so other devices on the network can join a table.
    host: true,
    // The game server owns /ws; everything else is served by Vite in dev.
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true },
      '/healthz': { target: 'http://localhost:8787' },
    },
  },
})
