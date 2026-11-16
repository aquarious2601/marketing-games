# Feature Driven Development — how we work

Scope lives in this folder, not in chat. Every piece of behaviour in the
roulette game traces back to a numbered feature file here.

## The loop

1. **You describe** the feature in a sentence or two.
2. **I ask questions** until the behaviour, the data and the edge cases are
   unambiguous. Expect questions about rules you may not have considered
   (what happens when stock runs out, what a returning player sees, and so on).
3. **I write the feature file** — `Fnn-short-name.md`, built from
   [`_TEMPLATE.md`](./_TEMPLATE.md) — with status `Draft`.
4. **You confirm it.** Corrections go into the file, not into a side
   conversation. Status becomes `Agreed`.
5. **I implement it** on a branch named `feature/Fnn-short-name`, and tick off
   the acceptance criteria as they pass.
6. **Status becomes `Done`** when every acceptance criterion in the file holds.

A feature is never implemented while its file is still `Draft`.

## Rules we hold ourselves to

- **One feature, one file, one branch.** If a description needs the word
  "and" twice to explain itself, it is probably two features.
- **Acceptance criteria are testable.** "Looks good on mobile" is not a
  criterion; "the wheel fits within the viewport width at 375px with no
  horizontal scroll" is.
- **Rules are numbered** (R1, R2, …) so we can refer to them precisely later.
- **Scope creep goes in a new file.** Mid-build ideas become the next feature,
  not an extension of the current one.
- **Out of scope is written down.** It is as important as what is in scope.

## Numbering

Two series, so infrastructure never pushes the game features along:

- **P** — platform. Scaffolding, tooling, tests, deployment. Nothing a player
  or an admin ever sees.
- **F** — the game itself. Everything with a user interface or a business rule.

## Status index

| ID | Feature | Interface | Status |
|---|---|---|---|
| [P00](./P00-walking-skeleton.md) | Walking skeleton and regression safety net | Platform | Done |
| [P01](./P01-end-to-end-tests.md) | End-to-end browser tests | Platform | Done |
| [P02](./P02-database-upgrades.md) | Database upgrades | Platform | Done |
| [F01](./F01-wheel-prize-configuration.md) | Wheel prize configuration | Admin | Done |
| [F02](./F02-player-spin.md) | The player's spin | Player | Done |
| [F03](./F03-spin-animation.md) | A wheel that spins like a wheel | Player | Done |
| [F04](./F04-branding-and-themes.md) | Branding and seasonal themes | Both | Done |
| [F05](./F05-svg-logos.md) | SVG logos | Admin | Done |
| [F06](./F06-theme-scenes.md) | Theme scenes | Player | Done |
| [F07](./F07-admin-login.md) | Admin login | Admin | Done |
| [F08](./F08-player-identification.md) | Player identification | Both | Done |
| [F09](./F09-admin-modules.md) | Admin modules | Admin | Done |
| [F10](./F10-hand-over-to-the-next-player.md) | Hand over to the next player | Player | Done |
| [F11](./F11-admin-tables.md) | Admin tables | Admin | Done |
| [F12](./F12-multiple-languages.md) | Multiple languages | Both | Done |
| [F13](./F13-reward-configuration.md) | Reward configuration | Both | Done |
| [F14](./F14-the-losing-slice-in-the-prize-list.md) | The losing slice in the prize list | Admin | Done |
| [F15](./F15-choosing-the-currency.md) | Choosing the currency | Admin | Agreed |
| [F16](./F16-a-code-on-every-win.md) | A code on every win | Both | Agreed |
| [F17](./F17-the-losing-panel.md) | The losing panel | Player | Agreed |
| [F18](./F18-the-campaigns-phone-country.md) | The campaign's phone country | Both | Withdrawn |
| [F19](./F19-one-person-one-number.md) | One person, one number | Both | Agreed |
| [F20](./F20-one-spin-per-identification.md) | One spin per identification | Both | Agreed |

## Running the tests

From the repository root:

```powershell
.	est-all.ps1
```

That runs the fast suites in every game folder and exits non-zero if any
fail. Narrow a run with `-Game roulette`, `-SkipBackend` or `-SkipFrontend`.

**The Playwright end-to-end suite is yours to run, not a gate.** Browser
checking is done by hand (see the repository's `CLAUDE.md`): `-E2E` and
`npm run test:e2e` still work and the specs are kept passing, but no new ones
are written and nothing waits on them. Where a feature's acceptance criteria
can only be answered in a browser, its file says so rather than ticking them
— see [F08 section 11](./F08-player-identification.md).

Individually:

| Suite | Command | From |
|---|---|---|
| Backend | `php vendor/bin/phpunit` | `roulette/backend` |
| Frontend | `npm test` | `roulette/frontend` |
| Frontend (watch) | `npm run test:watch` | `roulette/frontend` |
| Frontend (coverage) | `npm run test:coverage` | `roulette/frontend` |
| Types | `npm run typecheck` | `roulette/frontend` |
| End to end (opt-in) | `npm run test:e2e` | `roulette/frontend` |
| End to end (debug) | `npm run test:e2e:ui` | `roulette/frontend` |
| End to end (report) | `npm run test:e2e:report` | `roulette/frontend` |

Run `.	est-all.ps1` before committing a feature, and `.	est-all.ps1 -E2E`
before calling one `Done`. A feature is not `Done` while any suite is red.

## Candidate features

[`ROADMAP.md`](./ROADMAP.md) holds the features we have thought of but not yet
specified. It is a parking area, not a commitment — nothing there is agreed
until it has its own file.
