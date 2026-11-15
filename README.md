# Marketing Games

A collection of standalone, browser-based marketing games. Each game is a
self-contained application in its own subfolder, with its own database,
its own admin interface and its own deployment.

Nothing here is connected to the AA Shop Manager codebase or data.

## Games

| Folder | Game | Status |
|---|---|---|
| [`roulette/`](./roulette) | Spin-the-wheel prize roulette | In development |

## Layout

```
marketing-games/
└── roulette/
    ├── features/     # Feature descriptions (the source of truth for scope)
    ├── backend/      # Symfony 7 API
    └── frontend/     # React 18 + Vite + Tailwind SPA
```

Each game keeps this same shape so a second game can be added without
touching the first.

## Method

This project is built with **Feature Driven Development**. Nothing is
implemented until there is an agreed feature description for it.
See [`roulette/features/README.md`](./roulette/features/README.md) for the loop.

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
cd roulette\backend ; php C:\xampp\php\composer.phar install
cd ..\frontend ; npm install
```

MariaDB must be running (start it from the XAMPP control panel). Then create
the databases — the app's, and the one the tests use:

```powershell
cd roulette\backend ; php bin/console doctrine:database:create --if-not-exists ; php bin/console doctrine:schema:update --force --complete
```

```powershell
cd roulette\backend ; php bin/console doctrine:database:create --if-not-exists --env=test ; php bin/console doctrine:schema:update --force --complete --env=test
```

| Database | Used by |
|---|---|
| `roulette` | The app you run with `dev.ps1` |
| `roulette_test` | The PHPUnit suite |
| `roulette_e2e` | The Playwright suite, created automatically |

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
