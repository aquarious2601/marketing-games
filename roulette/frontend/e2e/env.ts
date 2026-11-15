/**
 * Shared settings for the end-to-end suite, imported by both the Playwright
 * config and its global setup so the two cannot drift apart.
 */

/** Ports of their own (P01 R2), so a running dev.ps1 is never disturbed. */
export const API_PORT = 8011
export const WEB_PORT = 5183

export const API_URL = `http://127.0.0.1:${API_PORT}`
export const WEB_URL = `http://localhost:${WEB_PORT}`

/**
 * A database of its own. The suite writes real wheel configurations, and
 * doing that to the development database would destroy whatever the admin
 * was working on and make the tests depend on its contents.
 */
export const E2E_DATABASE = 'roulette_e2e'
export const E2E_DATABASE_URL =
  `mysql://root:@127.0.0.1:3306/${E2E_DATABASE}?serverVersion=10.4.32-MariaDB&charset=utf8mb4`

/** Where the Symfony project lives, relative to the frontend directory. */
export const BACKEND_DIR = '../backend'
