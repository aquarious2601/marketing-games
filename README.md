# Marketing Games

One browser-based application serving several marketing games to one store.
The games share a database, an admin interface and a deployment, because they
share the shop: its name, its logo, its currency, its reward catalogue and its
customers.

Nothing here is connected to the AA Shop Manager codebase or data.

## Games

| Game | What it is | Status |
|---|---|---|
| Wheel | Spin-the-wheel prize roulette | In development |
| Gift sheet | Every reward on the list, one code each | Specified ([F28](./app/features/F28-the-gift-sheet.md)) |

## Layout

```
marketing-games/
└── app/
    ├── features/     # Feature descriptions (the source of truth for scope)
    ├── backend/      # Symfony 7 API
    │   └── src/Games/Wheel/      # one game's own code
    ├── frontend/     # React 19 + Vite + Tailwind SPA
    │   └── src/games/wheel/      # the same game's own code
    └── deploy/       # provisioning, release and rollback scripts
```

Everything outside a `games/` folder is shared by every game. A second game
is a folder in each of those two places and nothing else moved
([P05](./app/features/P05-one-app-a-folder-per-game.md)).

## Method

This project is built with **Feature Driven Development**. Nothing is
implemented until there is an agreed feature description for it.
See [`app/features/README.md`](./app/features/README.md) for the loop.

## Running it

Prerequisites: PHP 8.2+, Composer, Node 20+, and MariaDB/MySQL (XAMPP covers
all of these on this machine).

```powershell
.\dev.ps1
```

Starts the API and the web app in two windows, then open
**http://localhost:5173**. The page shows a connection indicator, so you can
see at a glance whether the frontend is reaching the API.

Open **http://localhost:5173/admin** to configure the wheel.

> The admin page has no login yet. Keep this on your own machine until the
> admin authentication feature lands.

First time, or after pulling:

```powershell
cd app\backend ; php C:\xampp\php\composer.phar install
cd ..\frontend ; npm install
```

MariaDB must be running (start it from the XAMPP control panel). Then create
the databases — the app's, and the one the tests use:

```powershell
cd app\backend ; php bin/console doctrine:database:create --if-not-exists ; php bin/console doctrine:schema:update --force --complete
```

```powershell
cd app\backend ; php bin/console doctrine:database:create --if-not-exists --env=test ; php bin/console doctrine:schema:update --force --complete --env=test
```

| Database | Used by |
|---|---|
| `roulette` | The app you run with `dev.ps1` |
| `roulette_test` | The PHPUnit suite |
| `roulette_e2e` | The Playwright suite, created automatically |
| `roulette_upgrade_test` | `DatabaseUpgradeTest`, created and dropped by it |

### Upgrading a database that already holds data

`schema:update` above is for an **empty** database. Once there are prizes and
spins in one, a new required column cannot simply be added — see
[P02](./app/features/P02-database-upgrades.md). After pulling a version
that changes the schema, run:

```powershell
cd rouletteackend ; php bin/console app:upgrade-database --dry-run
```

```powershell
cd rouletteackend ; php bin/console app:upgrade-database
```

The first prints what it would do and writes nothing. Both are safe to run
twice, and against an already-current database both do nothing. Afterwards
`doctrine:schema:update --dump-sql` should report no difference.

## Testing

```powershell
.\test-all.ps1
```

Runs the fast suites across every game — about twenty seconds — and exits
non-zero if any fail. Run it before committing; a feature is not finished
while it is red.

| Layer | Tooling | In a normal run |
|---|---|---|
| Backend | PHPUnit, with functional tests that boot the real kernel | yes |
| Frontend | Vitest + Testing Library (jsdom) | yes |
| Types | `tsc` across the app and the end-to-end specs | yes |
| End to end | Playwright driving Chromium at desktop and phone sizes | **no — opt in** |

The end-to-end suite is **not** part of a normal run. It starts real servers
and a real browser and takes several minutes, so ask for it explicitly:

```powershell
.	est-all.ps1 -E2E
```

Each suite uses its own database, so running the tests never touches what you
were working on in the app. The end-to-end suite also starts its own API and
web servers on ports 8011 and 5183, so it never collides with `dev.ps1`.


## Stack

- **Backend** — PHP 8.2, Symfony 7.4 LTS, MariaDB 10.4 (XAMPP)
- **Frontend** — React 19, Vite 8, Tailwind CSS 3, React Router 7
- **Targets** — mobile phone, tablet and desktop browsers (responsive, one codebase)
