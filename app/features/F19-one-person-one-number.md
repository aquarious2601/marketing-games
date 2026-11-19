# F19 — One person, one number

| | |
|---|---|
| **ID** | F19 |
| **Status** | Agreed |
| **Interface** | Both |
| **Depends on** | [F08](./F08-player-identification.md), [P02](./P02-database-upgrades.md) |
| **Agreed on** | 2026-11-17 |
| **Replaces** | [F18](./F18-the-campaigns-phone-country.md) |

## 1. Summary

Two numbers are the same person when one is the tail of the other once a
trunk `0` is off, so `0614856240` and `+33614856240` are one player. The
number is still stored exactly as it was typed, and nothing has to be
configured.

## 2. Why

[F08](./F08-player-identification.md) stores a number as typed and looks it
up as a string, so one person who writes their number two ways is two
players. It said so in writing and left the fix open. The report:

> if the campagne is running in France, if a client tapes +33123456789,
> it's must be the same with 0123456789

[F18](./F18-the-campaigns-phone-country.md) answered this by rewriting every
number into international form against a country chosen on the campaign. It
was built and then withdrawn, because against real data the shape was wrong
in three ways its own tests could not see:

- **It needed a setting before it worked at all.** With no country chosen the
  upgrade step refused to run, so the stored table kept its national numbers
  while new registrations were stored as `+33…` — and the returning player
  with nineteen spins stopped being recognised. The feature's default state
  was worse than not having it.
- **It rewrote the player's number.** That makes the upgrade a destructive
  step, and it makes the admin list disagree with the receipt in somebody's
  hand, which then needed the filter widened to compensate.
- **It guessed wrong when it guessed.** An English page read `0614856240` as
  `+10614856240`: the United States has no trunk zero, so the zero was kept
  and `+1` glued in front of it. A number that can never be matched again.

The lesson is that the question is not *what is this number in international
form* — that needs a country, and a country is a guess. The question is only
*are these two strings the same person*, and the strings answer it
themselves.

## 3. Actors

| Actor | Role |
|---|---|
| **Player** | Types their number however they write it, and is the same person either way |
| **Admin** | Sees one row per person, each number as that person typed it |

## 4. User stories

- As a **player**, I want **to type my number the way I write it**, so that
  **I am recognised whichever way I typed it last time**.
- As an **admin**, I want **one row per person**, so that **the player list
  is a list of people**.
- As an **admin**, I want **to set nothing up**, so that **this is right on a
  campaign nobody has configured**.

## 5. Scope

### In scope

- A rule for when two numbers are the same person.
- Identification and registration finding a player by that rule.
- A short derived column so that lookup is an index read rather than a table
  scan.
- The rule applied to the rows already stored, merging the duplicates it
  finds.

### Out of scope

- **A country setting.** [F18](./F18-the-campaigns-phone-country.md)'s whole
  apparatus — the country list, the picker, the per-language default — is
  dropped. Nothing here needs to know which country a number is from.
- **Rewriting a stored number.** `Player.phone` keeps what was typed,
  always. F08's canonicalisation is untouched.
- **Changing the admin filters.** They match the stored number as typed,
  exactly as they do today. Staff type what is on the receipt, and the
  receipt is what is in the column.
- **Showing the derived column anywhere.** It is an index, not information.
  No API reports it and no screen displays it.
- **Validating that a number exists**, and **verifying it by SMS**. Both
  still out, for [F08 section 13](./F08-player-identification.md)'s reasons.
- **Formatting a number for display.** Shown as typed.
- **Telling apart two numbers that genuinely end the same way.** See section
  13; it needs more than the number to do that.

## 6. Rules

### When two numbers are one person

| # | Rule |
|---|---|
| R1 | A player's row holds the number as typed (F08 R3, unchanged). Whether another number is the same person is decided by comparing, never by rewriting. |
| R2 | Take the digits of each, discard a leading `00` or a single leading trunk `0`, and they are one person when the two are equal, or when one ends the other. |
| R3 | A suffix counts only from eight digits up. Below that, only equality counts: [F08](./F08-player-identification.md) R4 accepts a number as short as six digits, and a six-digit number is the end of a great many longer ones. |
| R4 | The last six digits are stored beside the number so a lookup reads an index rather than the table. Six is below R3's eight on purpose: two numbers that match share at least eight digits of their end, so they certainly share six, and no match can hide from it. It narrows a lookup; it never decides one. It is **not** unique — two different people may share it. |
| R5 | The stored tail is derived, so it is recomputed rather than edited: it is set from the number and never by a request. |

### Why that works without a country

| # | Rule |
|---|---|
| R6 | A trunk `0`, a dialling code and a `00` are all *prefixes*. What distinguishes one person's number from another's is at the end, so a suffix comparison removes whichever prefix is there without knowing what it was. |
| R7 | So `0614856240`, `614856240`, `+33614856240`, `0033614856240`, `33614856240`, `+33 6 14 85 62 40` and `06.14.85.62.40` are one player. |
| R8 | And two numbers of the same length are never a suffix of one another, so `0614856240` and `0714856240` — two French mobile prefixes — stay two people. This is the half a fixed-length key gets wrong: the last nine digits of those two are identical. |

### Identification

| # | Rule |
|---|---|
| R9 | The identify step finds the player by R2, so a returning player is found however they typed it this time, and their spins stay on one row. |
| R10 | Registration looks for that player first and hands back the one who holds the number, which is F08 R7 unchanged — the row's name is not overwritten by the new submission. |
| R11 | The number shown back to the player is the one stored on their row, not the one they just typed, so "Not you?" names the identity the system is actually holding. |

### The existing table

| # | Rule |
|---|---|
| R12 | [P02](./P02-database-upgrades.md) gains three steps: add the column, fill it from each row's number, then make it required and index it. |
| R13 | They need no setting and so can never refuse to run. This is the point of the feature. |
| R14 | Where two rows are one person by R2, they are merged: the earliest registration survives with its own number, the later rows' spins move onto it, and those rows are deleted. |
| R15 | The step says how many rows it filled and how many players it merged, and a second run is a no-op. |

## 7. Data model

| Entity | Field | Type | Notes |
|---|---|---|---|
| `Player` | `phone` | unchanged | Still what was typed, still unique |
| `Player` | `phoneTail` | `varchar(6)`, not null, indexed, **not** unique | Derived (R4, R5) |

`Player.phone` keeps its unique constraint, which still stops the same
spelling being stored twice. Nothing in the database enforces R2 — see
section 13.

## 8. API surface

No new endpoints and no new fields. `POST /api/player/identify`, `/register`
and `/me` keep their shapes; what changes is which row the first two find.

## 9. Interface

### Player view

Unchanged, down to the markup. One box, typed however they type it. R11
already held — the page shows the player returned by the lookup, not the
number it sent — so no frontend code changes in this feature at all.

### Admin view

Unchanged. The list shows each number as its owner typed it, and the filter
works as it does today. That is a result rather than an omission: it is what
not rewriting the numbers buys.

### Responsive behaviour

Nothing changes.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| A number shorter than F08's minimum | F08's existing message, unchanged |
| A number of six or seven digits | Matches only an equal one (R3) |
| Two numbers that genuinely end the same way | One person — see section 13 |
| Two spellings of one number registered in the same instant | Two rows, repaired by the upgrade step — see section 13 |
| The upgrade step on a table with no duplicates | Fills every row, merges nobody |
| The upgrade step run twice | The second run finds nothing to do (R15) |

## 11. Acceptance criteria

- [x] Given a player registered as `0614856240`, when somebody identifies
      with `+33614856240`, then it is that player.
- [x] Given the same, then `0033614856240`, `614856240`, `33614856240` and
      `+33 6 14 85 62 40` also find them.
- [x] Given that player, then the number stored on their row is still
      `0614856240`, and that is the number the page is shown.
- [x] Given a registration with `+33614856240` for a number already held as
      `0614856240`, then no row is added and the held name is unchanged.
- [x] Given a player registered as `0614856240`, when somebody registers
      `0714856240`, then they are two players.
- [x] Given a spin under each spelling, then both spins are on one player.
- [x] Given staff filtering the players list by `0614`, then the player
      stored as `0614856240` is listed.
- [x] Given a table holding `0614856240` with two spins and `+33614856240`
      with one, when the upgrade command runs, then one player remains
      holding three spins, stored as `0614856240`, and the report says one
      merge.
- [x] Given a table with no duplicates and nothing configured anywhere, when
      the upgrade command runs, then every row is filled and nothing is
      merged.
- [x] Given the upgrade command run twice, then the second run changes
      nothing.

## 12. Verification

`php vendor/bin/phpunit` — 525 tests.

- `PhoneMatchTest` covers R2–R8 directly, and has two halves that pull
  against each other: every spelling of the reported number is one person,
  and every pair that is two people stays two. The second half is the one
  that rejected the first design — a key of the last nine digits — because it
  merges two French mobile prefixes and two American area codes. One case
  walks eleven countries and asserts each national form matches its own
  international one, which is how Singapore's eight-digit number was caught
  rejecting a nine-digit key. Another asserts that any two numbers which
  match also share a tail, which is the property R4's lookup depends on.
- `IdentityControllerTest` covers R7, R9, R10, R11 and R8 through the
  kernel, the session and the real database — because what was broken was a
  lookup, not a comparison. Including that a spin under each spelling lands
  on one player.
- `PlayerControllerTest` covers the criterion that nothing was taken away:
  `0614` still finds `0614856240` in the admin list.
- `DatabaseUpgradeTest` covers R12–R15 against a real database: the column
  added, indexed and required, every number filled, two spellings merged with
  the earliest registration surviving and all three spins moved, two
  lookalike numbers left as two people, a run against a database where
  nothing at all is configured, a second run finding nothing, and a dry run
  merging nobody.

`npm test`, `npm run typecheck`, `npm run lint` — unchanged and green. This
feature touches no frontend file.

**Not looked at in a browser.** The player flow and the admin list still need
a pass by hand.

## 13. Decisions and risks

- **Why a comparison rather than a canonical number.** Comparing is additive:
  the column is new, nothing already stored is touched, and the upgrade
  cannot corrupt a number because it never writes one. F18 rewrote the
  numbers, which is why it needed a country to rewrite them against, an
  upgrade step that deletes rows, and a filter widened to find them
  afterwards. One decision caused all three.
- **Why not a fixed-length key.** The first attempt at this feature keyed on
  the last nine digits, which is simpler and was wrong twice over. Nine
  digits is longer than a whole Singaporean, Hong Kong or Danish national
  number, so those countries split one person in two; and it is shorter than
  a French or American national number, so `0614856240`/`0714856240` and
  `650 555 1234`/`250 555 1234` merge two people into one. No single length
  avoids both: a shorter key merges more, a longer one splits more. A suffix
  comparison has no length to get wrong.
- **Why eight digits of overlap (R3).** Eight is the shortest national number
  in use anywhere this is likely to run, and F08 accepts six digits, so
  without a floor a six-digit number would be the suffix of half the table.
  The cost is that a genuinely six- or seven-digit number matches only
  exactly, which is the safe direction to fail.
- **Risk: two different people whose numbers end the same way.** R2 cannot
  see the difference between `+33 6 14 85 62 40` and a number from somewhere
  else that happens to end `614856240` and is longer. It needs one number to
  be a strict suffix of the other, so both of F18's collision shapes are
  gone, but a short national number inside a longer foreign one would still
  merge. Judged acceptable: it needs two people at one stall whose numbers
  agree in eight or more trailing digits and differ in length. The direction
  of this risk is the bad one — one person shown as another — so if it ever
  happens it is a bug report, not a tuning exercise, and the answer is more
  information per row rather than a longer suffix.
- **Risk: nothing in the database enforces R2.** A unique index cannot
  express a suffix, so the single-row guarantee is the lookup's, not the
  schema's. The hole is the race F08 section 13 already describes, narrowed:
  two devices submitting *different spellings* of one number in the same
  instant both insert. Identical spellings are still caught by `phone`'s
  unique index, which is the realistic case. The exotic one is repaired by
  the upgrade step rather than by a lock held across every registration at a
  stall.
- **Risk: R14 deletes rows.** It is the only step in [P02](./P02-database-upgrades.md)
  that does. It fires only on rows that are the same person by R2, it keeps
  the earliest registration rather than choosing arbitrarily, and the spins
  move before the row goes, so nothing a shop gave away loses the player it
  was given to. A dry run shows what it would do first.
- **What this gives up from F18.** Nothing that was asked for. A stored
  number is not normalised, so the player table holds a mixture of spellings
  — which is what it holds today, and what the receipt in someone's hand
  holds. If uniform display is ever wanted, that is a display concern and can
  be done without touching a row.

## 14. Open questions

- None.
