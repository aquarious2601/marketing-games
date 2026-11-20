import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Where the Symfony dev server listens. Overridable so a different port or a
// remote API can be used without editing this file — `dev.ps1` sets it from
// its own -ApiPort, so the two defaults below only have to agree with each
// other.
//
// 8001 rather than 8000 since another application on the same machine claimed
// 8000. The failure that caused is worth remembering: the proxy forwarded
// happily, the other application answered, and the symptom was a login that
// would not work rather than anything saying a port was taken.
const DEV_API_TARGET = process.env.VITE_DEV_API_TARGET ?? 'http://127.0.0.1:8001'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    // P00 R7: the SPA calls /api on its own origin and Vite forwards it to
    // Symfony, so development needs no CORS configuration at all.
    proxy: {
      '/api': {
        target: DEV_API_TARGET,
        changeOrigin: true,
      },
    },
  },

  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
    },
  },
})
