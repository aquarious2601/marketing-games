# Feature Driven Development — how we work

Scope lives in this folder, not in chat. Every piece of behaviour in this
application traces back to a numbered feature file here.

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
6. **I open a pull request** into the current sprint branch. CI runs the four
   fast suites on it.
7. **You test it by hand.** The automated suites cannot answer every
   criterion — anything that needs a browser is yours (see *Running the
   tests*).
8. **Status becomes `Done`** when every acceptance criterion holds, your pass
   included.
9. **On your word, I merge the pull request** into the sprint branch.

A feature is never implemented while its file is still `Draft`, and never
merged while it is still `Agreed`.

## Branches

```
feature/Fnn-short-name  ──PR──▶  next-1.1  ──end of sprint──▶  main  ──▶  deployed
```

| Branch | What it is |
|---|---|
| `main` | What is deployed. Every push to it deploys ([P03](./P03-deployment.md)). Nothing is committed to it directly. |
| `next-<major>.<minor>` | The sprint branch: roughly a week of work. Finished features land here first, so main only ever receives work that has been together for a while. |
| `feature/Fnn-short-name` | One feature, cut from the sprint branch. One file, one branch ([above](#rules-we-hold-ourselves-to)). |

Versions are `<major>.<minor>`; a sprint is a minor. A major is a decision
you make about the product, never one that happens by accident because
twelve sprints went by.

### Starting a feature

```bash
git switch next-1.1 && git pull
git switch -c feature/F21-spin-eligibility
```

### Finishing one

Push the branch and open a pull request into the sprint branch. Without the
[GitHub CLI](https://cli.github.com/) installed, the push prints a link that
opens the form; with it:

```bash
gh pr create --base next-1.1 --fill
```

CI must then be green and your manual pass must be done — in that order,
because there is no sense testing by hand what the suites already reject.
Then, on your word, the merge button on the pull request, or:

```bash
gh pr merge --merge --delete-branch
```

`--merge` on purpose, rather than `--squash` or `--rebase`: it is the one
that writes a merge commit, and that commit is the record of when a feature
landed and what it brought. The others scatter a feature's commits into the
sprint's history with nothing tying them together, or flatten them into one
and lose the shape of the work.

Until sprint 1.4 this line read `--no-ff`, which is `git merge`'s spelling
of the same intent, not the CLI's — `gh` answers `unknown flag` and merges
nothing.

### Ending a sprint

On your word, and not before — this is the step that reaches customers:

```bash
git switch main && git pull
git merge --no-ff next-1.1
git tag -a v1.1.0 -m "Sprint 1.1"
git push origin main --follow-tags          # this deploys
git switch -c next-1.2 && git push -u origin next-1.2
```

The tag is what makes "roll back to the last release" a thing you can say
rather than a SHA you have to find. The deploy itself is per-commit and
rolls back by symlink ([P03](./P03-deployment.md) R6); the tag is for
people.

### When production breaks

A fix for something already deployed is cut from `main`, not from the sprint
branch — otherwise shipping it means shipping the whole unfinished sprint
with it:

```bash
git switch main && git pull
git switch -c fix/whatever-broke
# then: PR into main, merge, and merge main back into the sprint branch
```

Merging `main` back into `next-*` afterwards is the step that is easy to
forget and causes the next sprint's merge to conflict with itself.

### Making it stick

Nothing above stops anybody pushing to `main` — it is a convention until
GitHub is told otherwise. In Settings → Branches, a rule on `main` that
requires a pull request and a passing **CI / tests** check turns the
convention into something the repository enforces, including against me.
Worth doing before the first sprint rather than after the first accident.

### The one exception on record

F15 to F20 and P03 were committed straight to `main` before this workflow
existed, as was the commit that introduced the workflow itself — there was
no sprint branch to put it on yet. They are marked `Agreed` rather than
`Done` and close once the first deployment has been tested by hand.

That deployment now exists: sprint 1.2 (`v1.2.0`) is live, so what each of
those features needs is no longer a deployment but a look at the running
site. [P03](./P03-deployment.md) itself needs one thing more than a look —
its rollback has never been exercised, which its section 12 now says in as
many words.

Everything after that goes through a branch.

## Rules we hold ourselves to

- **One feature, one file, one branch, one pull request.** If a description
  needs the word "and" twice to explain itself, it is probably two features.
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

A number belongs to a feature when its file is written, so the index can have
a gap: **F25** is spoken for by [P04](./P04-many-shops-in-one-installation.md)
and [`ROADMAP.md`](./ROADMAP.md) — the admin screens for shops and games —
before anybody has written it. A gap is cheaper than renumbering a promise
that is already committed.

F25 stays P04's. [F27](./F27-the-store-and-its-games.md) builds the store and
its games for **one** store, which is the level a second game needed; F25 is
what those screens become once several owners share an installation.

## Status index

| ID | Feature | Interface | Status |
|---|---|---|---|
| [P00](./P00-walking-skeleton.md) | Walking skeleton and regression safety net | Platform | Done |
| [P01](./P01-end-to-end-tests.md) | End-to-end browser tests | Platform | Done |
| [P02](./P02-database-upgrades.md) | Database upgrades | Platform | Done |
| [P03](./P03-deployment.md) | Deployment | Platform | Agreed |
| [P04](./P04-many-shops-in-one-installation.md) | Many shops in one installation | Platform | Draft |
| [P05](./P05-one-app-a-folder-per-game.md) | One app, a folder per game | Platform | Agreed |
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
| [F21](./F21-amounts-that-fit-the-currency.md) | Amounts that fit the currency | Admin | Agreed |
| [F22](./F22-a-celebration-on-the-result.md) | A celebration on the result | Player | Agreed |
| [F23](./F23-a-daily-spin-limit.md) | A daily spin limit | Both | Agreed |
| [F24](./F24-the-campaigns-timezone.md) | The campaign's timezone | Admin | Withdrawn |
| [F26](./F26-a-slice-takes-its-rewards-name.md) | A slice takes its reward's name | Both | Agreed |
| [F27](./F27-the-store-and-its-games.md) | The store and its games | Both | Agreed |
| [F28](./F28-the-gift-sheet.md) | The gift sheet | Both | Agreed |
| [F29](./F29-the-next-customer.md) | The next customer | Player | Agreed |
| [F30](./F30-the-theme-belongs-to-the-game.md) | The theme belongs to the game | Both | Agreed |
| [F31](./F31-claiming-at-the-counter.md) | Claiming at the counter | Admin | Agreed |
| [F32](./F32-what-the-game-costs-and-brings.md) | What the game costs and brings | Admin | Agreed |
| [F33](./F33-a-barcode-the-counter-can-scan.md) | A barcode the counter can scan | Both | Agreed |
| [F34](./F34-the-customers-own-card.md) | The customer's own card | Both | Agreed |
| [F35](./F35-a-background-of-your-own.md) | A background of your own | Both | Agreed |
| [F36](./F36-each-game-keeps-its-own-customer.md) | Each game keeps its own customer | Player | Agreed |
| [F37](./F37-deleting-a-game.md) | Deleting a game | Admin | Agreed |
| [F38](./F38-a-birthday-without-a-year.md) | A birthday without a year | Both | Agreed |

## Running the tests

From the repository root:

```powershell
.\test-all.ps1
```

That runs the fast suites in every game folder and exits non-zero if any
fail. Narrow a run with `-App app`, `-SkipBackend` or `-SkipFrontend`.

**The Playwright end-to-end suite is yours to run, not a gate.** Browser
checking is done by hand (see the repository's `CLAUDE.md`): `-E2E` and
`npm run test:e2e` still work and the specs are kept passing, but no new ones
are written and nothing waits on them. Where a feature's acceptance criteria
can only be answered in a browser, its file says so rather than ticking them
— see [F08 section 11](./F08-player-identification.md).

Individually:

| Suite | Command | From |
|---|---|---|
| Backend | `php vendor/bin/phpunit` | `app/backend` |
| Frontend | `npm test` | `app/frontend` |
| Frontend (watch) | `npm run test:watch` | `app/frontend` |
| Frontend (coverage) | `npm run test:coverage` | `app/frontend` |
| Types | `npm run typecheck` | `app/frontend` |
| End to end (opt-in) | `npm run test:e2e` | `app/frontend` |
| End to end (debug) | `npm run test:e2e:ui` | `app/frontend` |
| End to end (report) | `npm run test:e2e:report` | `app/frontend` |

Run `.\test-all.ps1` before pushing a feature branch. CI runs the same four
suites on every pull request, so a red one is caught either way.

`Done` needs more than green suites: it needs the manual pass that the
automated ones cannot make (step 7 of the loop). A feature is not `Done`
while any suite is red, and not `Done` because they are all green.

## Candidate features

[`ROADMAP.md`](./ROADMAP.md) holds the features we have thought of but not yet
specified. It is a parking area, not a commitment — nothing there is agreed
until it has its own file.
