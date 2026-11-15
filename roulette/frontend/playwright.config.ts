import { defineConfig, devices } from '@playwright/test'
import { API_URL, BACKEND_DIR, E2E_DATABASE_URL, WEB_PORT, WEB_URL } from './e2e/env'

/**
 * PHP's built-in server writes an access log line per request to stderr,
 * which buries the test results. Set E2E_SERVER_LOGS=1 to see it when
 * diagnosing a server that will not start.
 */
const SERVER_OUTPUT = process.env.E2E_SERVER_LOGS ? 'pipe' : 'ignore'

export default defineConfig({
  testDir: './e2e',

  // Creates and migrates the end-to-end database before anything runs.
  globalSetup: './e2e/global-setup.ts',

  /**
   * Serial, deliberately.
   *
   * Two things here are shared and neither tolerates concurrency: PHP's
   * built-in development server handles one request at a time, so parallel
   * browsers starve each other and health checks time out; and every test
   * reads the same wheel, so a test that saves would change what another is
   * asserting. Tests remain independent and may be run in any order
   * (P01 R5) — they simply do not run at the same time.
   */
  fullyParallel: false,
  workers: 1,

  // P01 R4: a stray .only would silently shrink the suite.
  forbidOnly: !!process.env.CI,

  retries: process.env.CI ? 2 : 0,

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: WEB_URL,
    // P01 R6: evidence kept only when something went wrong.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // P01 R7
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 5'] },
    },
  ],

  // P01 R1: the suite owns its servers and tears them down afterwards.
  webServer: [
    {
      /**
       * `-d variables_order=EGPCS` is load-bearing, not decoration.
       *
       * Under `php -S`, a request sees environment variables only through
       * getenv(): $_SERVER and $_ENV are empty. Symfony's Dotenv decides
       * whether a variable is already set by looking at $_SERVER and $_ENV,
       * so without this flag it concludes DATABASE_URL is unset, falls back
       * to .env, and the suite quietly runs against the development
       * database. Adding E to variables_order populates $_ENV, and the
       * override below actually takes effect.
       */
      command: `php -d variables_order=EGPCS -S 127.0.0.1:${new URL(API_URL).port} -t public public/index.php`,
      cwd: BACKEND_DIR,
      // Waiting on the health endpoint rather than the root means the server
      // is not merely listening but actually serving the app.
      url: `${API_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      // Its own database, so the suite never touches development data.
      env: { DATABASE_URL: E2E_DATABASE_URL, APP_ENV: 'dev' },
      stdout: SERVER_OUTPUT,
      stderr: SERVER_OUTPUT,
      timeout: 60_000,
    },
    {
      command: `npm run dev -- --port ${WEB_PORT} --strictPort`,
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      // P01 R3: point the proxy at the API this suite started.
      env: { VITE_DEV_API_TARGET: API_URL },
      stdout: SERVER_OUTPUT,
      stderr: SERVER_OUTPUT,
      timeout: 120_000,
    },
  ],
})
