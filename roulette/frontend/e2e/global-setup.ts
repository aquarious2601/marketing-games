import { execFileSync } from 'node:child_process'
import { E2E_ADMIN } from './auth'
import { BACKEND_DIR, E2E_DATABASE_URL } from './env'

/**
 * Prepares the end-to-end database before any test runs: creates it if it is
 * missing, brings the schema up to date, and empties it so every run starts
 * from the same place.
 */
export default function globalSetup(): void {
  console.log(`[e2e] preparing the ${E2E_DATABASE_URL.split('/').pop()?.split('?')[0]} database`)

  console_(['doctrine:database:create', '--if-not-exists'])
  console_(['doctrine:schema:update', '--force', '--complete'])
  console_([
    'doctrine:query:sql',
    // `player` is emptied too (F08): a run that inherited the last run's
    // players would start with a spin history nobody in this run created.
    'SET FOREIGN_KEY_CHECKS = 0; TRUNCATE TABLE spin; TRUNCATE TABLE player; TRUNCATE TABLE branding; TRUNCATE TABLE `user`; TRUNCATE TABLE prize; TRUNCATE TABLE wheel; SET FOREIGN_KEY_CHECKS = 1',
  ])

  seedAdmin()
}

/**
 * The admin the suite signs in as (F07 R17).
 *
 * Inserted directly rather than through `app:create-admin`, because that
 * command asks for the password interactively — which is the right design
 * for the command and the wrong shape for setup. The hash is produced by
 * PHP so it is exactly what the application will verify, at the low cost
 * the test environment uses.
 */
function seedAdmin(): void {
  const hash = execFileSync(
    'php',
    ['-r', 'echo password_hash(getenv("E2E_PW"), PASSWORD_BCRYPT, ["cost" => 4]);'],
    { env: { ...process.env, E2E_PW: E2E_ADMIN.password }, encoding: 'utf8' },
  ).trim()

  console_([
    'doctrine:query:sql',
    'INSERT INTO `user` (username, password, roles, created_at) ' +
      `VALUES ('${E2E_ADMIN.username}', '${hash}', '["ROLE_ADMIN"]', UTC_TIMESTAMP())`,
  ])

  console.log(`[e2e] seeded the ${E2E_ADMIN.username} account`)
}

function console_(args: string[]): void {
  execFileSync('php', ['bin/console', ...args, '--no-interaction'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL, APP_ENV: 'dev' },
    stdio: process.env.E2E_SERVER_LOGS ? 'inherit' : 'pipe',
  })
}
