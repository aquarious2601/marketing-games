# P01 — End-to-end browser tests

| | |
|---|---|
| **ID** | P01 |
| **Status** | Done |
| **Interface** | Platform |
| **Depends on** | [P00](./P00-walking-skeleton.md) |
| **Agreed on** | 2026-11-14 |

## 1. Summary

Playwright drives a real browser against the real API, so that the journeys a
customer actually takes are checked by a machine on every run.

## 2. Why

P00's suites are fast and precise, but each half is tested with the other half
replaced by a mock. They cannot catch the faults that only appear when the two
run together: a proxy misconfigured, a build that drops a stylesheet, a wheel
that renders off-screen on a phone, a request blocked by CORS in production.

The game will be opened on a stranger's phone at a market stall. That is the
scenario worth automating, and it is the one a jsdom test cannot reproduce.

## 3. Actors

| Actor | Role |
|---|---|
| Developer | Runs the suite, reads the trace of a failure |
| Headless browser | Stands in for a real visitor, on desktop and on a phone |

## 4. User stories

- As a **developer**, I want **a real browser to load the real app against the
  real API**, so that **integration faults are caught before a customer finds
  them**.
- As a **developer**, I want **the phone viewport covered**, so that
  **a layout that breaks on mobile fails the build rather than the campaign**.
- As a **developer**, I want **a trace when a run fails**, so that **I can see
  what the browser saw instead of guessing**.

## 5. Scope

### In scope

- Playwright with Chromium, run headless.
- Two projects: a desktop viewport and a phone viewport.
- Playwright starting both servers itself, on ports of their own, so the suite
  never collides with servers already running for development.
- Coverage of the P00 journeys: the page loads, the API is reached, the API
  being down degrades visibly, the API contract holds, and the phone layout
  does not scroll sideways.
- Traces, screenshots and video kept for failures only.
- Inclusion in the repository-wide runner, behind an opt-in switch.

### Out of scope

- Cross-browser runs on Firefox and WebKit — Chromium first; widen when the
  game has visual behaviour worth the extra minutes.
- Visual regression snapshots — the UI is a placeholder; snapshots now would
  only need rewriting with every feature.
- Running against a deployed environment — local only until there is one.
- Continuous integration — candidate, see `ROADMAP.md`.

## 6. Rules

| # | Rule |
|---|---|
| R1 | The suite starts its own API and web servers and stops them when it finishes. |
| R2 | Those servers use ports distinct from the development defaults (8000, 5173), so a running `dev.ps1` does not interfere. |
| R2b | The API under test runs against its own database, never the development one. A test asserts this directly (see the defect below). |
| R3 | The web server under test proxies to the API server the suite started, not to the development one. |
| R4 | Tests run against the dev build, headless, with no `.only` permitted to reach a non-interactive run. |
| R5 | Every test is independent and may run in any order. |
| R6 | A failing test retains a trace; a passing one retains nothing. |
| R7 | The suite covers both a desktop and a phone viewport. |
| R8 | API failure is simulated by intercepting the request in the browser, not by stopping the server, so the test stays independent. |
| R9 | `npm run test:e2e` exits non-zero on failure. |
| R10 | The repository runner leaves the suite out of a normal run and includes it with `-E2E`. Amended 2026-11-15: it was previously included by default, which made the routine check take minutes. |
| R11 | Playwright's own specs are excluded from the Vitest run, and vice versa. |

## 7. Data model

None.

## 8. API surface

None added. The suite exercises `GET /api/health` from P00.

## 9. Interface

No user-facing change. Developer-facing surface:

| Command | Purpose |
|---|---|
| `npm run test:e2e` | Headless run |
| `npm run test:e2e:ui` | Interactive runner for debugging |
| `npm run test:e2e:report` | Open the report from the last run |

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| Chromium not installed | The run fails with Playwright's own instruction to install it |
| A port is already taken | `strictPort` makes the run fail loudly rather than drifting to another port |
| A server fails to start | Playwright times out waiting for its URL and reports which one |

## 11. Acceptance criteria

- [x] Given no servers are running, when the suite starts, then it brings up both and the tests pass.
- [x] Given the suite finishes, when it exits, then it has stopped the servers it started.
- [x] Given a desktop viewport, when the page loads, then the heading reads "Roulette" and the indicator reaches the connected state.
- [x] Given a phone viewport, when the page loads, then the content fits with no horizontal scroll.
- [x] Given the health request is intercepted and failed, when the page loads, then the indicator reaches the unreachable state and the page still renders.
- [x] Given a direct request to the API, when `/api/health` is fetched, then it returns 200 with the four documented keys.
- [x] Given a direct request to an unknown `/api` path, when fetched, then it returns 404 as JSON.
- [x] Given `npm run test:e2e` fails, then it exits non-zero.
- [x] Given `.\test-all.ps1`, when run, then it omits the end-to-end suite and says so, and `-E2E` includes it. _(Amended 2026-11-15; originally the reverse.)_

## 12. Verification

### Defect found later: the suite was writing to the development database

Added 2026-11-14, while building F02.

The configuration passed `DATABASE_URL` to the API server through Playwright's
`webServer.env`, and this document and the README both claimed the suite was
therefore isolated. **It was not.** Every end-to-end run had been writing to
the development database.

The cause is specific to PHP's built-in server: a request served by `php -S`
sees environment variables only through `getenv()`. `$_SERVER` and `$_ENV` are
empty for it. Symfony's Dotenv decides whether a variable is already set by
looking at `$_SERVER` and `$_ENV`, so it concluded `DATABASE_URL` was unset,
loaded the value from `.env`, and connected to `roulette`.

Nothing failed, because the development database has the same schema. The only
visible trace was 49 stray spin rows.

Two changes:

- The server is now started with `-d variables_order=EGPCS`, which populates
  `$_ENV` so the override takes effect.
- `/api/health` reports which database the process is actually connected to
  when debug is on — read from the connection parameters, not by querying, so
  P00 R4 still holds — and an end-to-end test asserts it is `roulette_e2e`.
  The isolation is now checked rather than assumed.

Verified by recording the row counts either side of a full run: the
development database stayed at 49 spins while the end-to-end database went
from 0 to 16.

### Original verification

Checked on 2026-11-14:

- Full suite run from clean: Playwright started both servers, ran every test
  across the desktop and phone projects, and stopped the servers afterwards.
- A deliberately failing expectation produced a non-zero exit and a retained
  trace; removing it returned the run to green.
- `.\test-all.ps1` reported the end-to-end suite alongside the others;
  `-SkipE2E` omitted it. _(That switch became the opt-in `-E2E` on
  2026-11-15, so a normal run is about twenty seconds.)_

## 13. Open questions

- None.
