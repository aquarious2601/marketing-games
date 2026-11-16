# P02 — Database upgrades

| | |
|---|---|
| **ID** | P02 |
| **Status** | Agreed |
| **Interface** | Platform |
| **Depends on** | [P00](./P00-walking-skeleton.md), [F13](./F13-reward-configuration.md) |
| **Agreed on** | 2026-11-16 |

## 1. Summary

One command that brings a database holding real data up to the current
schema, including the data a new `NOT NULL` column needs in order to exist.

## 2. Why

[F13](./F13-reward-configuration.md) made every slice point at a reward:
`prize.reward_id` is `NOT NULL` with a foreign key. Until F13 this project
applied its schema with `doctrine:schema:update --force --complete` and
`migrations/` was empty, which worked because every change so far had either
been additive-and-nullable or arrived before there was anything to lose.

`schema:update` cannot make this change. It emits
`ALTER TABLE prize ADD reward_id INT NOT NULL` followed by the foreign key,
and against a table with six rows MariaDB fills them with `0` and then the
key fails — there is no reward 0. F13 shipped with that gap written down
(F13 section 12) and the first database it met was the development one:

> the Game and Reward tab is not working

Both admin modules were returning 500, one because `reward` did not exist
and the other because `prize.reward_id` did not. The data was never at risk,
but the application was unusable against its own database, and every
database that ever holds a spin will hit this.

What is needed is not a general migration framework — this is one game with
one schema and no deployments yet — but a repeatable, honest upgrade that
can be run twice without harm.

## 3. Actors

| Actor | Role |
|---|---|
| **Operator** | Whoever has server access: runs the command after pulling a new version. The same person who runs `app:create-admin`. |

## 4. User stories

- As an **operator**, I want **one command that upgrades the database**, so
  that **pulling a new version does not mean reading a schema diff and
  writing SQL by hand**.
- As an **operator**, I want **the upgrade to keep the spins and players
  already recorded**, so that **a campaign in progress is not lost to a
  software update**.
- As an **operator**, I want **to be told what the upgrade guessed**, so that
  **I know which rewards to go and check**.

## 5. Scope

### In scope

- A console command that applies the structural changes F13 introduced, in
  an order a populated database can survive, together with the data each one
  needs.
- Inventing a reward for every existing prize, and saying how many were
  recognised and how many were guessed at.
- Typing every spin already recorded, so the spin log reads correctly for
  plays that happened before rewards existed.
- Running twice, or against an already-current database, as a no-op.

### Out of scope

- **Doctrine Migrations.** The bundle is installed and `migrations/` stays
  empty. Adopting it would fork the schema story in two — `schema:update`
  for a fresh database and the version table for an existing one — and the
  two drift the moment a migration expresses something `schema:update`
  cannot. Revisited if this game is ever deployed more than once; see
  section 13.
- **Going backwards.** There is no `down`. See section 13.
- **Upgrading the frontend or the uploaded logos.** Only the database.

## 6. Rules

| # | Rule |
|---|---|
| R1 | `php bin/console app:upgrade-database` brings the database from the shape it had before [F13](./F13-reward-configuration.md) to the current one, keeping every row already in it. |
| R2 | The command is a sequence of named steps. Each step decides for itself whether it still has anything to do, by looking at the database rather than at a version number. |
| R3 | Running the command against an already-current database changes nothing and succeeds. Running it twice in a row is the same as running it once. |
| R4 | The command prints each step and whether it did anything, and ends with a summary of what it changed. |
| R5 | Each step that writes *data* runs in a transaction. The steps that change *structure* are single statements, which MySQL commits implicitly whatever we ask of it — so a failure can leave a column added and empty. That is why structure and the data it needs are separate steps (R8): the command says what stands, and running it again resumes from there rather than starting over. |
| R6 | The `reward` table is created if it is absent, with the shape [F13](./F13-reward-configuration.md) specifies. |
| R7 | If the catalogue is empty, the six default rewards are created, exactly as a first run of the application would create them (F13 R1). |
| R8 | `prize.reward_id` is added nullable, filled in, and only then made `NOT NULL` with its foreign key. The three are separate steps so a half-finished upgrade can be resumed. |
| R9 | A prize whose name matches one of the default reward names, in any supported language, is pointed at that reward. This is the wheel nobody has edited yet, and it is matched exactly rather than approximately. |
| R10 | A prize whose name matches the default *losing slice* label, in any supported language, is pointed at the losing reward — the slice's label and its reward's name differ by design (F13 R8), so "Try again" must find "Maybe next time". |
| R11 | Any other prize gets a new reward of its own, named after the prize and typed **free product**. A free product is the only type that can be invented without inventing data too: it needs no value and no code (F13 R3, R19). |
| R12 | R11 never guesses a type from a prize's name. A slice called "10% off" becomes a free product, and the summary says so, because a wrong 10 in the database is worse than a visible blank. |
| R13 | Two slices with the same name share one reward. They are the same thing; two identical catalogue rows would be an upgrade artefact for the admin to find and delete. Names differing only in case or surrounding space count as the same name. A name is shortened to `Reward::NAME_MAX_LENGTH` rather than refused. |
| R14 | `wheel.includes_losing_slice` is set to true if and only if the wheel ended up with a slice pointing at a reward of type `nothing` (F13 R11, R14). |
| R15 | `spin.reward_type` and `spin.reward_value` are filled from the reward the spin's prize now points at, so a spin recorded before F13 reads in the log as what it actually was. |
| R16 | A spin whose prize has since been deleted — `prize_id` is null — is typed **free product** with no value. Nothing survives that says what it was, and free product is the type that claims by presence rather than by a code. |
| R17 | `spin.reward_code` stays null for every spin the upgrade touches, whatever its type. A code is something a player was shown (F13 R19); minting one now would create a code nobody has ever seen and make the log claim otherwise. |
| R18 | A spin with a null `reward_code` is still claimable if its type is (F13 R24). The code is how a player proves a claim, not what permits one. |
| R19 | `branding.currency` is added **nullable and left null**. Amended 2026-11-16 by [F15](./F15-choosing-the-currency.md) R4, which made null mean *nobody has chosen*: a campaign that predates the column has indeed never chosen one, and seeding it would be the upgrade deciding what a shop trades in. |
| R20 | The command refuses to run if the database holds no `wheel` table at all. That is an uninitialised database, which `schema:update --force --complete` should create instead. |
| R21 | A `branding.currency` of `VND` is set back to null, unless some reward is counted in money. Added 2026-11-16: R19's first version wrote that value itself, before [F15](./F15-choosing-the-currency.md) R4 made null mean *nobody has chosen*, so every database upgraded in between claims a choice this command made. Only `VND` is taken back, because it is the only value that step ever wrote. |
| R22 | `player.phone_tail` is added nullable, then filled, then made `NOT NULL` and indexed — the same three moves as `prize.reward_id` (R8), for the same reason. Added 2026-11-17 by [F19](./F19-one-person-one-number.md) R12. |
| R23 | Every stored number gets its tail. The step needs **nothing configured**: there is no setting to read and nothing to guess, so it cannot be skipped on the database that needs it. See section 13. |
| R24 | Where two rows hold one person's number in different spellings ([F19](./F19-one-person-one-number.md) R2), they are merged: the earliest registration survives with its own number, the later rows' spins are moved onto it, and those rows are deleted. The step says how many tails it filled and how many players it merged. |
| R25 | The index on `player.phone_tail` is deliberately **not** unique: two different people can share a tail, and [F19](./F19-one-person-one-number.md) R4 is what tells them apart. |

## 7. Data model

No new entities. The command applies what [F13 section 7](./F13-reward-configuration.md)
already specifies, and fills in:

| Table | Column | Filled with |
|---|---|---|
| `prize` | `reward_id` | R9, R10, R11 |
| `spin` | `reward_type` | R15, R16 |
| `spin` | `reward_value` | R15 |
| `spin` | `reward_code` | null (R17) |
| `spin` | `claimed_at` | null — nothing already recorded has been claimed |
| `wheel` | `includes_losing_slice` | R14 |
| `branding` | `currency` | null — unchosen (R19), and set back to null where an earlier run chose for you (R21) |
| `player` | `phone_tail` | R23, from the number already in the row (never the other way round) |

## 8. API surface

None. This is a console command.

```
php bin/console app:upgrade-database [--dry-run]
```

`--dry-run` prints what each step would do and changes nothing, so an
operator can read the plan before touching a database with a campaign in it.

## 9. Interface

Console only, through `SymfonyStyle`: one line per step, then a summary.
Nothing in the browser changes — except that the Game and Rewards modules
start working again, which is the point.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| The database is already current | Every step reports nothing to do; exit 0 (R3) |
| No `wheel` table | Error naming `doctrine:schema:update --force --complete`; exit 1 (R20) |
| A data step fails | It is rolled back, the failure is printed, later steps do not run, and the command says that what ran before it stands; exit 1 (R5) |
| A prize name matches no default | A free-product reward is invented and counted in the summary (R11, R12) |
| Some reward is counted in money | R21 leaves the stored currency alone and says why |
| Two player rows hold one number | They are merged and counted in the summary (R24) |
| Two player rows hold numbers that merely look alike | Left as two players (R25) |
| `--dry-run` | Nothing is written; the plan is printed |

## 11. Acceptance criteria

- [x] Given a database in the pre-F13 shape holding the default six-slice
      wheel, when the command runs, then every prize points at the matching
      default reward and the losing slice points at the `nothing` one.
- [x] Given a prize with a name of the admin's own, when the command runs,
      then it gets a free-product reward named after it, and the summary says
      one reward was guessed.
- [x] Given two prizes with the same name, when the command runs, then one
      reward is created and both slices point at it.
- [x] Given 27 spins recorded before F13, when the command runs, then each
      reads in the log with the type of the reward its prize now points at,
      and none has a code.
- [x] Given a spin whose prize was deleted, when the command runs, then it is
      typed free product rather than failing the `NOT NULL`.
- [x] Given a database upgraded before R21 existed, when the command runs,
      then its unchosen `VND` is taken back and its language decides again.
- [x] Given the same database with an amount-off reward in it, then the
      currency is left exactly as it was.
- [x] Given a database holding `0614856240` with two spins and
      `+33614856240` with one, when the command runs, then one player
      remains, stored as `0614856240`, holding all three spins, and the
      summary says one merge.
- [x] Given a database holding `0614856240` and `0714856240`, when the
      command runs, then they are still two players.
- [x] Given a database with no branding row and nothing configured, when the
      command runs, then every player still gets their tail.
- [x] Given an already-upgraded database, when the command runs again, then
      nothing changes and it exits 0.
- [x] Given an upgraded database, when `doctrine:schema:update --dump-sql`
      runs, then it reports no remaining difference.
- [x] Given an upgraded database, when the admin opens the Game and Rewards
      modules, then both load.

## 12. Verification

`php vendor/bin/phpunit` — `tests/Schema/DatabaseUpgradeTest.php` builds a
throwaway database in the pre-F13 shape, fills it, upgrades it and asserts
the result. It uses its own database rather than the suite's, because the
rest of the suite needs the current schema and a test that dismantles it
would take everything after it down on a failure.

The pre-F13 `CREATE TABLE` statements are written out in that test by hand.
They are a copy of a shape that will never change again, which is the only
honest way to test an upgrade: generating them from today's entities would
test the upgrade against the schema it produces.

Checked by hand against the development database — six prizes, 27 spins, two
players — and both admin modules opened afterwards.

The phone steps (R22–R25) are covered against the same throwaway database:
the column added and indexed, every number given its tail, two spellings of
one number merged with the earliest registration surviving and its spins
moved, two lookalike numbers left as two people, a run with nothing
configured anywhere, a second run finding nothing, and a dry run merging
nobody.

## 13. Decisions and risks

- **A step that needs configuration is a step that does not run (R23).**
  Learned the hard way. [F18](./F18-the-campaigns-phone-country.md) added a
  phone step that first had to be told which country the campaign was in, and
  refused to run until somebody chose one — which nobody had. New
  registrations were rewritten while the stored rows were not, and the
  returning player with nineteen spins stopped being recognised: the feature's
  default state was worse than its absence. It was abandoned and replaced by
  [F19](./F19-one-person-one-number.md), whose step has nothing to be told.
  Any future step here that wants an answer from an admin before it can act
  should be read against that.
- **R24 is the only step that deletes a row.** It is narrow by construction:
  it fires only on rows that are the same person by
  [F19](./F19-one-person-one-number.md) R2, it keeps the earliest
  registration rather than choosing arbitrarily, and it moves the spins
  before the row goes, so nothing a shop gave away loses the player it was
  given to. A dry run is the way to see what it would do.
- **A command rather than Doctrine Migrations.** The bundle is already
  installed, and a `Version…php` file is the idiomatic home for this. It was
  rejected for now because the version table has no baseline: every table in
  every existing database was created by `schema:update`, so the first
  `migrate` would try to create them again. Fixing that means either marking
  migrations applied by hand on each database, or keeping two schema stories
  — `schema:update --complete` for a fresh or test database and migrations
  for an existing one — and the two drift silently. A command that
  introspects needs no bookkeeping at all and cannot drift, because it asks
  the database what is true. The cost is that it must be written to be
  idempotent by hand, and that there is no `down`.
- **No `down`.** Reversing this upgrade means deleting the rewards and the
  spin types, which is data loss, not a rollback. Restoring a backup is the
  honest reverse and this command does not pretend otherwise.
- **The upgrade guesses, and says it guessed.** R11 invents a free product
  for a prize it does not recognise, rather than reading "10% off your next
  order" and inferring `percent_off` with a value of 10. A regular expression
  over the admin's own words would be right often enough to be trusted and
  wrong often enough to matter, and a wrong discount is money. The summary
  names what it guessed so the operator can go and fix it in two clicks.
- **The matching in R9 and R10 is by name across all four languages.** A
  Vietnamese shop's untouched wheel matches as cleanly as an English one.
  This is possible only because a console command can reach the translator;
  a Doctrine migration conventionally cannot, which is a second reason the
  decision above falls the way it does.
- **Risk: a wheel edited just enough.** An admin who renamed "Free sample" to
  "Free sample (50ml)" gets a free product named "Free sample (50ml)" beside
  the default "Free sample" nobody now uses. Harmless and visible — the
  Rewards tab shows the unused one as "Not used" and it can be deleted — but
  it means the catalogue after an upgrade may need a tidy.
- **R21 takes something back, which no other step does.** Every other step
  moves a database forward; this one undoes a decision an earlier version of
  this same command made. That is uncomfortable, and the alternative was
  worse: leaving a French shop looking at a Vietnamese currency it never
  chose, with nothing to tell it where that came from. It is narrow on
  purpose — one value, and only while no amount exists — so the worst it can
  do is make an admin pick a currency they were going to have to pick anyway.
- **Risk: R21 can unchoose a real choice.** A shop that genuinely picked
  `VND`, and has no amount-off reward yet, is unchosen too — there is no way
  to tell their `VND` from the one this command wrote. For a Vietnamese
  admin the picker then opens on `VND` regardless, so nothing visible
  changes; for anyone else it opens on their own language and they choose
  again before the first amount exists.
- **Risk: this command has one job and a general name.** It is named for what
  an operator wants (`app:upgrade-database`), not for F13, so the next
  schema change that needs data appends a step to it. The steps are a list
  for that reason. If that list ever grows past the point where reading it
  tells you the order, that is the signal to adopt migrations properly.

## 14. Open questions

- Should `schema:update --force --complete` stay the documented way to build
  a *fresh* database, or should the upgrade command be able to build one from
  nothing too? Today they are two paths and R20 keeps them apart deliberately.
