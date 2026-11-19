import { execFileSync } from 'node:child_process'
import { E2E_ADMIN } from './auth'
import { BACKEND_DIR, E2E_DATABASE_URL } from './env'

/**
 * Prepares the end-to-end database before any test runs: throws the last
 * one away, builds the current schema, and seeds the admin.
 *
 * Dropped rather than truncated. Truncating empties the rows but keeps the
 * *shape*, and `schema:update` cannot always turn one shape into another —
 * F13 added `prize.reward_id NOT NULL` and this setup then failed on a
 * foreign key, with nothing in the error to say that the fix was to delete
 * a database nobody meant to keep. Dropping costs about a second and makes
 * this setup immune to every schema change after it. The upgrade path for
 * databases that *are* meant to be kept is P02.
 */
export default function globalSetup(): void {
  console.log(`[e2e] preparing the ${E2E_DATABASE_URL.split('/').pop()?.split('?')[0]} database`)

  console_(['doctrine:database:drop', '--if-exists', '--force'])
  console_(['doctrine:database:create'])
  console_(['doctrine:schema:update', '--force', '--complete'])

  seedAdmin()
  seedTheInstallation()
}

/**
 * The store, its reward catalogue and its one live wheel game (F27 R32).
 *
 * `schema:update` builds tables and nothing else, and since F27 the suite
 * needs rows: every admin path for a game hangs off a game's id, and the
 * player page is reached through a game's link. The upgrade command is what
 * creates them, so this runs it rather than inventing a second seeding path
 * that could drift from the one a real installation takes.
 */
function seedTheInstallation(): void {
  console_(['app:upgrade-database'])

  console.log('[e2e] seeded the store, the catalogue and one live wheel game')
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
