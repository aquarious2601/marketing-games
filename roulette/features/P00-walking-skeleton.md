# P00 — Walking skeleton and regression safety net

| | |
|---|---|
| **ID** | P00 |
| **Status** | Done |
| **Interface** | Platform |
| **Depends on** | — |
| **Agreed on** | 2026-11-14 |

## 1. Summary

The thinnest possible slice of the real stack — browser calls React, React calls
Symfony, Symfony answers — plus a test suite on both sides and one command that
runs everything, so that every later feature has something to regress against.

## 2. Why

Feature-driven development only protects you if a broken feature is *visible*.
Without a suite in place before F01, the first regression is found by a customer
spinning a wheel at a market stall. This feature buys the ability to say
"nothing else broke" after every change.

It also proves the plumbing once, in isolation. If the frontend cannot reach the
backend, we find out now, on a trivial endpoint, instead of while debugging
wheel-segment probability maths.

## 3. Actors

| Actor | Role |
|---|---|
| Developer | Runs the suite, reads failures |
| Browser (any device) | Loads the SPA, which calls the API |

## 4. User stories

- As a **developer**, I want **one command that runs every test**, so that
  **I can prove a change broke nothing before I commit it**.
- As a **developer**, I want **the frontend and backend proven to talk to each
  other**, so that **plumbing faults never masquerade as feature bugs**.

## 5. Scope

### In scope

- A health endpoint on the API.
- A typed frontend API client with a configurable base URL.
- A visible connection indicator in the SPA, so a human can see the link works.
- PHPUnit on the backend, with a functional test booting the real kernel.
- Vitest + Testing Library on the frontend, with a component test and a
  client test.
- Dev proxy so the SPA calls `/api` with no CORS configuration.
- One runner script executing both suites and failing if either fails.

### Out of scope

- Database, Doctrine, entities and migrations — arrive with the first feature
  that needs to persist something.
- Authentication — belongs to the admin login feature.
- End-to-end browser tests (Playwright) — candidate, see `ROADMAP.md`.
- CI pipeline — candidate, see `ROADMAP.md`.
- Production CORS and deployment configuration.

## 6. Rules

| # | Rule |
|---|---|
| R1 | `GET /api/health` returns HTTP 200 with `Content-Type: application/json`. |
| R2 | The health response body contains `status` (always `"ok"`), `app`, `env` and `time`. |
| R3 | `time` is an ISO 8601 UTC timestamp. |
| R4 | The health endpoint requires no authentication and reads no database. |
| R5 | An unknown `/api/*` path returns HTTP 404, not an HTML error page. |
| R6 | The frontend reads its API base URL from `VITE_API_BASE_URL`, defaulting to `/api`. |
| R7 | In development, Vite proxies `/api` to the Symfony server so no CORS headers are needed. |
| R8 | The SPA shows one of three connection states: checking, connected, unreachable. |
| R9 | A failed or slow health call never throws past the client; it resolves to an error state. |
| R10 | The client applies a request timeout so an unreachable API cannot hang the UI indefinitely. |
| R11 | `npm run test` (frontend) and `vendor/bin/phpunit` (backend) each exit non-zero on failure. |
| R12 | The root runner script runs both suites and exits non-zero if either fails. |

## 7. Data model

None. This feature introduces no persistence.

## 8. API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | none | Liveness probe and plumbing proof |

Response `200 application/json`:

```json
{ "status": "ok", "app": "roulette", "env": "dev", "time": "2026-11-14T20:12:03+00:00" }
```

## 9. Interface

### Player view

A plain page with the game name and a small connection indicator. This page is
placeholder scaffolding; F01 onwards replaces its contents. The indicator is
the only behaviour.

### Admin view

None yet.

### Responsive behaviour

The placeholder page centres its content and stays within the viewport at
375px, 768px and 1280px with no horizontal scroll.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| API reachable, 200 | Indicator shows connected, with the reported environment |
| API unreachable (server down) | Indicator shows unreachable; no uncaught error |
| API returns non-200 | Indicator shows unreachable |
| API returns malformed JSON | Indicator shows unreachable |
| Request exceeds the timeout | Indicator shows unreachable |

## 11. Acceptance criteria

- [x] Given the Symfony server is running, when I request `/api/health`, then I get 200 and a JSON body with `status`, `app`, `env` and `time`.
- [x] Given the kernel is booted in a functional test, when the test requests `/api/health`, then it asserts 200, the JSON content type and all four keys.
- [x] Given an unknown `/api` path, when requested, then the response is 404.
- [x] Given the API answers, when the SPA loads, then the indicator reaches the connected state.
- [x] Given the API is down, when the SPA loads, then the indicator reaches the unreachable state and no error escapes to the console as an unhandled rejection.
- [x] Given the frontend test suite, when run, then the client's success, non-200, malformed-body and timeout paths are each covered by a passing test.
- [x] Given the root runner script, when either suite fails, then the script exits non-zero.
- [x] Given both suites pass, when the runner script completes, then it exits zero and reports both suites.

## 12. Verification

Checked on 2026-11-14, beyond the automated suites:

- `curl http://127.0.0.1:8000/api/health` returned 200 `application/json` with all four keys.
- `curl http://127.0.0.1:8000/api/nope` returned 404 `application/json`; `POST /api/health` returned 405 `application/json`.
- `curl http://localhost:5173/api/health` returned the same payload through the Vite proxy, confirming R7 with no CORS headers configured.
- In a real browser at 375x812 the page showed "API connected / roulette / dev", with `scrollWidth == clientWidth` (no horizontal scroll).
- With the API stopped, the same page showed "API unreachable" and the app kept rendering. The only console output was the browser's own failed-resource log, not an unhandled rejection.
- A deliberately failing test made `test-all.ps1` exit 1 and name the failing suite; removing it returned the run to exit 0.

## 13. Open questions

- None. Playwright end-to-end coverage and a CI pipeline are deliberately
  deferred to `ROADMAP.md`.
