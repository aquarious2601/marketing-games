# Working in this repository

One application, `app/`, serving several marketing games to one store:
`backend/` (Symfony + Doctrine), `frontend/` (React + TypeScript + Tailwind
+ Vite) and `features/` (one markdown file per feature).

A game's own code lives in a folder of its own — `backend/src/Games/<Game>/`
and `frontend/src/games/<game>/` — and everything the games share (the store,
the players, the reward catalogue, the admin, the login) lives outside those
folders. [`P05`](./app/features/P05-one-app-a-folder-per-game.md) R4 is the
test for which a file is: it belongs to a game when a second game would have
to write it again, differently.

How features are specified and numbered is in
[`app/features/README.md`](./app/features/README.md). Read it before
adding behaviour: scope lives in a numbered `Fnn-*.md` file, the tests cite
its rule numbers, and a feature is not implemented while its file says
`Draft`.

## Tests

**Do not write or run the Playwright end-to-end suite.** End-to-end checking
is done by hand. `npm run test:e2e` is still there and still works, but it is
the user's to run, not a suite to extend or to gate a change on.

A change is covered by:

| Suite | Command | From |
|---|---|---|
| Backend | `php vendor/bin/phpunit` | `<game>/backend` |
| Frontend | `npm test` | `<game>/frontend` |
| Types | `npm run typecheck` | `<game>/frontend` |
| Lint | `npm run lint` | `<game>/frontend` |

`.\test-all.ps1` from the repository root runs all of those and exits
non-zero if any fail. Do not pass `-E2E`.

Where an existing end-to-end spec would be left broken by a change, fix the
spec so the manual run still passes — but add no new ones.

## Code

- Comments explain **why** a decision was made, not what the code does.
- The player page is phone-first: it must never need scrolling to reach the
  Spin button or the prize, at 375px.
- The server decides the prize; the animation is computed from that result,
  never the other way round. The player is never shown the odds.
