# P05 — One app, a folder per game

| | |
|---|---|
| **ID** | P05 |
| **Status** | Agreed |
| **Interface** | Platform |
| **Depends on** | [P00](./P00-walking-skeleton.md), [P03](./P03-deployment.md) |
| **Agreed on** | 2026-11-19 |
| **Amends** | [P03](./P03-deployment.md) R1, R9, R10 (paths only), the repository's `CLAUDE.md`, [README](./README.md) |

## 1. Summary

`roulette/` becomes `app/`, and the code that belongs to one game moves into
a `games/` folder inside the backend and the frontend, so a second game has
somewhere to go.

## 2. Why

The repository was laid out for one game per folder, each with its own
`backend/`, `frontend/` and `features/`. That shape says two games are two
applications with two deployments and two databases.

They are not. [F27](./F27-the-store-and-its-games.md) puts a store above the
games, and the second game shares the store's branding, its reward
catalogue, its players and its admin login. One database, one deployment,
one login — so one application.

Which leaves the folder lying. `roulette/` would hold a game that is not a
roulette wheel, and nothing would mark which files belong to the wheel and
which belong to everything. That boundary matters more than the name: the
wheel's geometry, its animation and its prize editor are the wheel's
business, while the store, the players, the rewards and the spin log are
every game's. A folder is the cheapest way to say so, and the only one that
still says it in a year.

This is a move, not a change. Nothing a player or an admin can see is
different afterwards.

## 3. Actors

| Actor | Role |
|---|---|
| **Developer** | Finds the wheel's code in one place and the shared code in another |
| **CI** | Runs the same four suites from paths that have moved |
| **Deployment** | Builds and ships from the new paths, to the same instance and the same bucket |

## 4. User stories

- As a **developer**, I want **the wheel's code in its own folder**, so that
  **a second game can be added without reading every file to find out whose
  it is**.
- As a **developer**, I want **one application rather than one per game**, so
  that **two games share a store, a login and a database instead of
  pretending to be two products**.

## 5. Scope

### In scope

- `roulette/` → `app/`, with `git mv`, so history follows the files.
- Per-game backend code into `app/backend/src/Games/Wheel/`, and the matching
  namespace change.
- Per-game frontend code into `app/frontend/src/games/wheel/`.
- Every path that names the old folder: the CI workflow, `test-all.ps1`, the
  deploy scripts, [P03](./P03-deployment.md)'s runbook, the repository's
  `CLAUDE.md`, this folder's [README](./README.md) and every feature file
  that quotes a path.
- `features/` moves with the application, to `app/features/`.

### Out of scope

- **Any behaviour change.** Not one rule of any feature is amended; the four
  suites pass with nothing rewritten but imports and paths.
- **Splitting the backend into bundles**, or the frontend into packages. A
  folder and a namespace are enough; a bundle is a build system's worth of
  ceremony for the same separation.
- **Renaming anything outside the repository.** The S3 bucket
  (`marketing-games-roulette-…`), the nginx site, its log files and the
  database name keep the names they have (R9). They are not paths in a
  checkout; they are live infrastructure referenced by an IAM policy, a
  GitHub secret and a running server, and renaming them is a deployment
  change masquerading as a tidy-up.
- **A second game.** This gives it a folder to live in.
  [F28](./F28-the-gift-sheet.md) fills it.
- **Per-game deployment.** One release, one instance, as
  [P03](./P03-deployment.md) has it.

## 6. Rules

### The move

| # | Rule |
|---|---|
| R1 | The folder `roulette/` becomes `app/`. One installation is one application that runs several games, not one game. |
| R2 | The backend's per-game code moves to `src/Games/<Game>/`, and its namespace to `App\Games\<Game>\`. The wheel's folder is `Games/Wheel/`. |
| R3 | The frontend's per-game code moves to `src/games/<game>/`. The wheel's folder is `games/wheel/`. |
| R4 | A file is the game's when it would have to be written again, differently, for a second game. Everything else is shared, including anything *both* games would use unchanged. |
| R5 | `features/` moves to `app/features/`. The specs describe one application, so they live with it rather than beside one of its games. |
| R6 | Tests move with the code they test and keep their names. A moved test's only edit is its imports. |

### What moves and what does not

| # | Rule |
|---|---|
| R7 | Per-game, backend: the `Wheel/` services (the provider, both presenters, the input parser), the `Wheel` and `Prize` entities and their repositories, `Dto/PrizeDraft`, the admin wheel controller, the player wheel and spin endpoints. |
| R8 | Per-game, frontend: `wheel/` (the editor, the preview, the palette), the spin animation and rotation in `player/`, and the admin's prize rows. |
| R9 | Shared, and therefore staying put: the store and its branding, `Player`, `Reward`, `Spin`, `User`, identification, login, the admin shell and its modules, the data table, the reward catalogue, the spin log, the languages, the themes and their scenes, and [P02](./P02-database-upgrades.md)'s upgrade steps — including the steps that create the wheel's own tables, because one ordered list of steps is the whole point of P02. |

### Nothing outside the repository moves

| # | Rule |
|---|---|
| R10 | The S3 bucket, the nginx site and its log files, the systemd units, the database name and the release directories on the instance keep their current names. Only paths inside the checkout change. |
| R11 | The deploy therefore changes in exactly one way: where it builds from. What it uploads, where it uploads it and what it restarts are untouched, so a release built after this move installs over one built before it and rolls back to it ([P03](./P03-deployment.md) R6). |

### Proving it was only a move

| # | Rule |
|---|---|
| R12 | The move is its own commit, containing no edit other than a path, an import, a namespace or a `use` statement. A commit that both moves a file and changes what it does cannot be reviewed, and this one has to be reviewable by eye. |
| R13 | `git log --follow` on a moved file shows the history it had before the move. |
| R14 | The four fast suites pass with the same number of tests and assertions as before the move. A test that had to be rewritten to pass means something changed that should not have. |
| R15 | No path in the repository names `roulette/` afterwards except where it is deliberately historical: a past release, a bucket name, an existing log file, or a sentence about what the layout used to be. |

## 7. Data model

Nothing. No table, column, index or upgrade step is added, dropped or
renamed. [P02](./P02-database-upgrades.md)'s list of steps keeps the order it
has, because a step's order is a fact about databases already upgraded and a
move must not touch it.

## 8. API surface

Unchanged, every route and every payload. A client cannot tell this
happened.

## 9. Interface

No screen changes. No copy changes. No CSS class changes.

The one place a person notices is the editor: the wheel's files are under
`games/wheel/` and the shared ones are not.

### Target layout

```
marketing-games/
  app/
    backend/
      src/
        Entity/           Player, Reward, Spin, User, Store, Game
        Games/
          Wheel/          the wheel: entities, services, controllers, DTOs
        Branding/ Admin/ Schema/ Security/ …   shared
    frontend/
      src/
        games/
          wheel/          editor, preview, palette, spin animation
        admin/ auth/ player/ branding/ i18n/ api/   shared
    features/
    deploy/
  test-all.ps1
  .github/workflows/
```

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| A suite fails after the move | The move is wrong, not the test. Fix the path, never the expectation. |
| CI cannot find a suite | The workflow still names the old folder. Caught on the pull request, before anything is merged. |
| The deploy script cannot find the build | It still names the old folder. Caught by the dry run that [P03](./P03-deployment.md) runs first. |
| An import still points at the old namespace | The backend will not boot and the frontend will not typecheck. Both are suites. |

## 11. Acceptance criteria

- [ ] `app/` exists with `backend/`, `frontend/`, `features/` and `deploy/`; `roulette/` does not exist.
- [ ] `.\test-all.ps1` from the repository root passes, and reports the same test and assertion counts as the commit before the move.
- [ ] `php vendor/bin/phpunit` passes from `app/backend`; `npm test`, `npm run typecheck` and `npm run lint` pass from `app/frontend`.
- [ ] `npm run test:e2e` still passes by hand, with no spec changed other than a path or an import.
- [ ] The wheel's backend code is under `app/backend/src/Games/Wheel/` and its namespace is `App\Games\Wheel\`.
- [ ] The wheel's frontend code is under `app/frontend/src/games/wheel/`.
- [ ] No shared file — store, player, reward, spin, login, admin shell, upgrade steps — sits under a `games/` folder.
- [ ] `git log --follow app/backend/src/Games/Wheel/WheelProvider.php` shows commits from before the move.
- [ ] The CI workflow, `test-all.ps1` and the deploy scripts name `app/` and run green.
- [ ] A release built after the move installs and serves, and the health endpoint answers as it did.
- [ ] `grep -rn "roulette/" --exclude-dir=.git .` returns only deliberately historical mentions (R15), each one of them a sentence about the past, a bucket or a log file.
- [ ] The repository's `CLAUDE.md`, this folder's README and every feature file that quotes a path have been updated.
- [ ] The move commit contains no change other than paths, imports, namespaces and `use` statements.

## 12. Open questions

- **Does the admin's spin log need to say which game a row came from?** It
  will, once there are two. That column is
  [F27](./F27-the-store-and-its-games.md)'s, not this feature's — here the
  log is only a file that does not move.
- **Whether `games/wheel/` should also hold the wheel's feature files.**
  Today every spec is one list in one folder and the status index is one
  table; splitting the index per game would be a second thing to keep in
  step. Left as one folder (R5) until it hurts.
