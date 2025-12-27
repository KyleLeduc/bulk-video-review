/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tsconfigPaths from 'vite-tsconfig-paths'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tsconfigPaths({ loose: true, configNames: ['tsconfig.app.json'] }),
  ],
  base: process.env.NODE_ENV === 'production' ? '/bulk-video-review/' : '/',
  server: {
    host: '127.0.0.1',
  },
  test: {
    environment: 'happy-dom',
  },
})
