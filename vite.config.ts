import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/')
          if (
            normalizedId.includes('node_modules/three/addons') ||
            normalizedId.includes('node_modules/three/tsl') ||
            normalizedId.includes('node_modules/three/src/renderers')
          ) {
            return 'vendor-three-webgpu'
          }
          if (normalizedId.includes('node_modules/three-stdlib')) return 'vendor-three-stdlib'
          if (normalizedId.includes('node_modules/@react-three/fiber')) return 'vendor-r3f'
          if (normalizedId.includes('node_modules/three')) return 'vendor-three-core'
          if (
            normalizedId.includes('node_modules/react') ||
            normalizedId.includes('node_modules/zustand')
          ) {
            return 'vendor-react-core'
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
})
