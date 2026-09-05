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
  base: '/',
  build: {
    // Preserve Vite 5's browser targets during this tooling-only migration.
    target: ['chrome87', 'edge88', 'firefox78', 'safari14'],
  },
  server: {
    host: '127.0.0.1',
  },
  test: {
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      // Vitest 4 otherwise omits source files that no test imports.
      include: ['src/**/*.{js,ts,vue}', 'scripts/**/*.{js,mjs,ts}'],
    },
  },
})
