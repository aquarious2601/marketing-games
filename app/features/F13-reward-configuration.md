# F13 — Reward configuration

| | |
|---|---|
| **ID** | F13 |
| **Status** | Done |
| **Interface** | Both |
| **Depends on** | [F01](./F01-wheel-prize-configuration.md), [F02](./F02-player-spin.md), [F04](./F04-branding-and-themes.md), [F09](./F09-admin-modules.md), [F12](./F12-multiple-languages.md) |
| **Agreed on** | 2026-11-15 |

## 1. Summary

Prizes stop being just a name. A reward catalogue in its own admin module
defines what is actually given away — a free product, a percentage off, an
amount off, or nothing — each wheel slice points at one, discount rewards are
issued a unique code when they are won, and staff mark them claimed from the
spin log.

## 2. Why

A prize is currently a word and a probability. "10% off your next order" is a
string; nothing in the system knows it is ten per cent, nothing stops the
same discount being given to a thousand people on one code, and nothing
records whether anybody ever collected it.

That is fine while the game is a demo and breaks the moment it runs at a
counter. The three questions a shop asks are *what did we promise*, *how does
this person prove it*, and *did we already give it to them* — and the answer
to all three today is "read the screen and trust each other".

A catalogue answers the first. A unique code per issued discount answers the
second. A claimed flag answers the third, and it is the one that costs real
money when it is missing: a voucher with no record of redemption is a voucher
that can be redeemed twice.

## 3. Actors

| Actor | Role |
|---|---|
| Admin user | Defines the rewards, then builds a wheel from them |
| Staff at the counter | Reads a code off a player's screen and marks it claimed |
| Player | Sees what they won and, for a discount, the code that proves it |

## 4. User stories

- As an **admin user**, I want **to define a reward once and use it on a
  wheel**, so that **"10% off" means ten per cent and not a piece of text**.
- As a **player**, I want **a code for my discount**, so that **I can prove
  what I won after I have put my phone away**.
- As **staff**, I want **to mark a reward claimed**, so that **the same
  voucher is not honoured twice**.
- As an **admin user**, I want **a losing slice when I want one and not when
  I do not**, so that **the wheel matches the campaign I am running**.

## 5. Scope

### In scope

- A `reward` catalogue: name, type, and a value where the type needs one.
- Four types: free product, percent off, amount off, nothing (a losing item).
- A **Rewards** module in the admin — configuration only.
- Every wheel slice pointing at a reward, while keeping its own label.
- A wheel toggle that adds or removes a losing slice.
- A unique code issued at the moment a discount is won.
- The code shown to the player on the result panel.
- A claimed status per spin, set and unset from the Spins module.
- One currency per campaign, beside the branding.
- Four-language wording for all of it (F12).

### Out of scope

- **Stock limits.** How many of a reward may be given away is the **Prize
  stock** roadmap item, and it needs a story for what the wheel does when one
  runs out mid-campaign.
- **Code expiry.** No reward goes stale. Worth having and not asked for.
- **Redeeming against a real till or e-commerce system.** The code is proof
  for a human, not an integration.
- **Rewards shared across campaigns, or more than one wheel.** There is still
  one wheel (F01); the catalogue is built so that stops being a constraint,
  but nothing here adds a second.
- **Exporting codes**, or generating a batch in advance. A code exists
  because somebody won something.
- **Who claimed it.** The row records that it was claimed and when, not which
  member of staff pressed the button. An audit trail is its own feature.
- **Changing a reward's type after it has been won.** Allowed, and harmless,
  because every spin snapshots what it won (R25).

## 6. Rules

### The catalogue

| # | Rule |
|---|---|
| R1 | A reward has a name, a type, and a value where its type needs one. |
| R2 | The types are **free product**, **percent off**, **amount off** and **nothing**. |
| R3 | Percent off carries a whole number from 1 to 100. Amount off carries a whole number above 0. Free product and nothing carry no value, and one supplied is rejected rather than ignored. |
| R4 | A reward name is trimmed, 1–60 characters, and unique in the catalogue. Two rewards with one name is a question nobody can answer from a dropdown. |
| R5 | The catalogue is edited in the Rewards module and nowhere else. |
| R6 | A reward that a wheel slice uses cannot be deleted. The refusal names the slice, so the admin knows what to change first. |

### The wheel

| # | Rule |
|---|---|
| R7 | Every slice points at exactly one reward. |
| R8 | A slice keeps its own label, and that label is what the player sees — not the reward's name. The same reward can read differently on different slices. |
| R9 | A new slice's label defaults to its reward's name, so the common case needs no typing and the two only diverge deliberately. |
| R10 | Everything F01 says about slices still holds: 2–12 of them, probabilities totalling 100, equal sizes, order preserved. |

### The losing item

| # | Rule |
|---|---|
| R11 | The wheel has a toggle: *include a losing item*. |
| R12 | Turning it on adds a slice pointing at the losing reward, labelled **“Maybe next time”**. The admin may rename it and set its odds like any other slice. |
| R13 | Turning it off removes that slice, and its probability has to be redistributed before the wheel will save — the total is still 100 (F01 R8). |
| R14 | A wheel has at most one losing slice. |
| R15 | A losing item is drawn, recorded and logged exactly like any other slice. The only differences are that it is never issued a code and can never be claimed. |

### Codes

| # | Rule |
|---|---|
| R16 | A spin that wins a percent-off or amount-off reward is issued a code at the moment of the spin, in the same transaction that records it (F02 R12). |
| R17 | The code is unique across every spin ever recorded. |
| R18 | The code avoids characters that are misread on a screen or over a counter: no `O`/`0`, no `I`/`L`/`1`. |
| R19 | ~~A free product and a losing item are issued no code. A free product is claimed by showing the screen, as it always was.~~ **Replaced by [F16](./F16-a-code-on-every-win.md) R1, R2**: every win carries a code, and only a losing spin carries none. The screen this rule relied on is cleared by the next player ([F10](./F10-hand-over-to-the-next-player.md) R3). |
| R20 | The player is shown their code on the result panel, where the prize name is. |

### Claiming

| # | Rule |
|---|---|
| R21 | A spin whose reward is claimable is either *not claimed*, or *claimed* with the moment it happened. |
| R22 | Staff mark a reward claimed from its row in the Spins module. |
| R23 | Claiming is reversible. A mis-click at a busy counter must not be permanent. |
| R24 | A losing spin cannot be claimed, and the control is not offered on its row. |
| R25 | A spin snapshots its reward's type and value alongside the prize name and probability it already keeps (F02 R10), so the log still says what was won after the catalogue has moved on. |
| R26 | Claiming requires a signed-in admin (F07 R17). |

### Currency

| # | Rule |
|---|---|
| R27 | One currency per campaign, set beside the branding. |
| R28 | An amount-off reward is shown with that currency everywhere it appears — the admin, the wheel and the result panel. |

### Language

| # | Rule |
|---|---|
| R29 | A reward's name and a slice's label are what the admin typed and are never translated (F12 R10). The type names, the default losing label and every word around them are the application's own and are (F12 R9). |

## 7. Data model

| Entity | Field | Type | Notes |
|---|---|---|---|
| `reward` | `id` | `INT` PK auto | |
| | `name` | `VARCHAR(60)` not null, **unique** | R4 |
| | `type` | `VARCHAR(20)` not null | R2 |
| | `value` | `INT` **nullable** | R3; null for free product and nothing. **Widened from `SMALLINT` 2026-11-17 by [F21](./F21-amounts-that-fit-the-currency.md)** — 32,767 is not a price in đồng |
| | `created_at` | `DATETIME` not null | UTC |
| `prize` | `reward_id` | `INT` FK → `reward.id`, **not null** | R7, `ON DELETE RESTRICT` |
| `wheel` | `includes_losing_slice` | `BOOLEAN` not null, default false | R11 |
| `spin` | `reward_code` | `VARCHAR(12)` nullable, **unique** | R16–R19 |
| | `reward_type` | `VARCHAR(20)` not null | R25 snapshot |
| | `reward_value` | `INT` nullable | R25 snapshot. Widened by [F21](./F21-amounts-that-fit-the-currency.md), which matters more here: this column is written during a spin |
| | `claimed_at` | `DATETIME` nullable | R21 |
| `branding` | `currency` | `VARCHAR(3)` not null, default `VND` | R27 |

`prize.reward_id` is `RESTRICT` rather than `SET NULL`, which is the opposite
of how `spin.prize_id` behaves (F02 R11) and deliberately so. A spin is
history and must survive its prize being deleted; a slice is configuration
and must never exist pointing at nothing.

## 8. API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/rewards` | admin | The catalogue |
| POST | `/api/admin/rewards` | admin | Add one |
| PUT | `/api/admin/rewards/{id}` | admin | Change one |
| DELETE | `/api/admin/rewards/{id}` | admin | Remove one, if unused (R6) |
| PUT | `/api/admin/spins/{id}/claim` | admin | Mark claimed or not (R22, R23) |
| GET | `/api/admin/wheel` | admin | **Changed:** each prize carries `rewardId`; the wheel carries `includesLosingSlice` |
| PUT | `/api/admin/wheel` | admin | **Changed:** accepts both |
| GET | `/api/wheel` | none | **Changed:** carries `currency` in the branding |
| POST | `/api/spin` | player | **Changed:** the result carries `code`, `rewardType` and `rewardValue` |
| GET | `/api/admin/spins` | admin | **Changed:** each row carries the code, the type and the claim |

POST `/api/spin`, `200`:

```json
{
  "prize": { "id": 4, "name": "10% off", "position": 3, "colour": "#B45309" },
  "reward": { "type": "percent_off", "value": 10, "code": "A7K3-M9PX" },
  "spunAt": "2026-11-15T10:12:03+00:00"
}
```

`reward.code` is null for a free product and for a losing item (R19). The
`prize` object is unchanged, and still carries no probability (F02 R2).

PUT `/api/admin/spins/{id}/claim`:

```json
{ "claimed": true }
```

## 9. Interface

### Rewards — `/admin/rewards`

`<h1>Rewards</h1>`, then a table (F11): **Name**, **Type**, **Value**, **Used
on the wheel**, **Added**. A row opens into an editor; a button adds one. The
value field appears only for the two types that take one, and is labelled
with the campaign's currency for amount off.

### Game — `/admin/game`

Two additions:

- A toggle above the prize list: *include a losing item*.
- A reward selector on each prize row, beside its label and percentage.

### Spins — `/admin/spins`

Three columns added to F09's table: **Code**, **Status**, and the claim
control. A losing row shows `—` in all three (R24).

### Player — `/`

The result panel gains the code beneath the prize name, in a monospace face
large enough to read aloud across a counter. Nothing else about the panel
changes, and it still fits a 375px phone without scrolling (F08).

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| A reward name already in the catalogue | `422` against `name` (R4) |
| Percent off with no value, or 0, or 101 | `422` against `value` (R3) |
| Amount off with 0 or a negative | `422` against `value` (R3) |
| Free product or nothing with a value | `422` against `value` — rejected, not ignored (R3) |
| Deleting a reward a slice uses | `422` naming the slice (R6) |
| Saving a slice with no reward | `422` against that slice (R7) |
| Toggling the losing item off without fixing the odds | `422` on the total, as F01 R8 already does |
| A second losing slice | `422` (R14) |
| Claiming a losing spin | `422` (R24) |
| Claiming an already-claimed spin | Accepted and idempotent; the time is not overwritten |
| A code collides on generation | Retried; the unique index is the arbiter |

## 11. Acceptance criteria

- [ ] Given the Rewards module, then the catalogue lists every reward with its type and value.
- [ ] Given a percent-off reward, when 0 or 101 is saved, then it is rejected against `value`.
- [ ] Given a free product, when a value is supplied, then it is rejected.
- [ ] Given a reward used by a slice, when it is deleted, then it is refused and the slice is named.
- [ ] Given a wheel, when the losing toggle is turned on, then a slice labelled “Maybe next time” appears pointing at the losing reward.
- [ ] Given a wheel with a losing slice, then that slice is drawn, recorded and logged like any other.
- [ ] Given a percent-off reward is won, then the spin is issued a code, and the player is shown it.
- [ ] Given a free product or a losing item is won, then no code is issued.
- [ ] Given ten thousand codes, then no two are the same, and none contains `O`, `0`, `I`, `L` or `1`.
- [ ] Given a claimable spin, when staff press Claim, then it records the moment, and pressing again unclaims it.
- [ ] Given a losing spin, then no claim control is offered and the API refuses one.
- [ ] Given a reward's value is changed after it was won, then the spin still reports the value it was won at.
- [ ] Given a campaign currency of `EUR`, then an amount-off reward reads in euros in the admin and on the result panel.
- [ ] Given any of the four languages, then every new key exists in all of them.

## 12. Verification

Built on 2026-11-15.

| Suite | Result |
|---|---|
| PHPUnit | 352 tests, 4,135 assertions — green |
| Vitest | 506 tests, 17 files — green |
| `npm run typecheck` | clean |
| `npm run lint` | clean |

Three things were worth proving rather than asserting:

- **That a code cannot be misread (R18).** Two thousand generated codes are
  checked for `O`, `0`, `I`, `L` and `1`, and ten thousand for a repeat. The
  repeat check does not *prove* uniqueness — the unique index does that, and
  `RewardIssueTest` exercises it through the real database — but it catches a
  generator with far less entropy than it appears to have, which is the
  failure that otherwise surfaces as a collision months later.
- **That the snapshot holds (R25).** A test wins a 10% reward, changes the
  catalogue to 50%, and asserts the log still says 10. Without it the log
  silently rewrites itself whenever somebody edits a dropdown.
- **That a losing item is a slice like any other (R15).** Driven through a
  99%-losing wheel and a real spin rather than by constructing entities,
  because what is being tested is that the draw, the recording and the
  refusal to claim all agree — and only a real request exercises all three.

### Defect found while building this

**Every timestamp in the application was an hour out when it round-tripped.**
Entities construct their times with an explicit UTC zone, but MySQL stores a
naive datetime and Doctrine hydrated it back using PHP's default zone, which
on this machine is `Europe/Berlin`. A claim written at 15:30 UTC read back as
`15:30+01:00` — a different instant, and nothing about the code looked wrong.

Found by F13's claim test, the first in the project to compare a value it had
just written against the same value reloaded. `Kernel::boot()` now sets the
process default to UTC, which makes the write and the read agree. Display is
unaffected: the admin tables render through `toLocaleString` in the browser
(F11 R7), so nobody at a counter reads UTC.

### Not verified

- ~~**No migration path for existing data.**~~ Closed by
  [P02](./P02-database-upgrades.md). The gap was real and it bit the
  development database the day after this feature shipped: both admin
  modules returned 500, one because `reward` did not exist and the other
  because `prize.reward_id` did not. `php bin/console app:upgrade-database`
  now applies this feature's schema to a database that already holds rows,
  and the development database — six prizes, 27 spins, two players — went
  through it with everything intact.
- **The player's side is checked; the admin's is not.** Two real spins were
  played at 375px against the development database after
  [P02](./P02-database-upgrades.md). A free product showed no code, a 5%
  slice showed `NBXS-FB26`, and the result panel with the code on it fits in
  812px with nothing to scroll (`scrollHeight === innerHeight`).

  The admin's Rewards module, the reward selector, the losing toggle and the
  claim control are still covered by unit tests only, because looking at
  them needs an admin account and creating one here was not permitted. The
  375px fit of the widened spin log — six columns now — is the one to check
  first.

## 13. Decisions and risks

**A catalogue, not a type on the prize.** The slice could have carried the
type and value directly, which is less schema and one screen fewer. The
catalogue wins because a reward is a thing the business has — it outlives any
one wheel, it will want a stock count, an expiry and a redemption rule, and
all three belong to the reward rather than to the slice it happened to sit
on. The cost is a join and a second screen to keep in step, paid now so the
roadmap's prize-stock feature is a column rather than a migration.

**The slice keeps its own label (R8).** The catalogue names the reward and
the slice names what the player reads, which means the two can disagree. That
is the point: "10% off your next order" is what the shop is giving away and
"Lucky you!" may be what the wheel should say. The risk is a slice whose
label promises something the reward does not deliver, and nothing can detect
that — R9's default at least makes agreement the starting position.

**The losing item is a reward like any other.** It would have been simpler to
make "losing" a flag on the slice. Making it a type means the draw, the
recording, the log and the snapshot all treat it identically and there is one
place — the claim — that asks what type it is. A flag would have put `if
(!losing)` in five places and missed one.

**Codes are issued per win, not drawn from a pool.** A pre-generated batch
would let the shop print vouchers in advance, and would mean a code exists
before anybody won it — which is exactly the thing a code is supposed to
prove. Generating inside the spin's transaction (R16) means a code that
exists is a code somebody won.

**Claiming is reversible (R23) and anonymous.** Reversible because the
alternative is a counter where one mis-tap costs a customer their voucher and
the shop an argument. Anonymous because recording *which* member of staff
claimed it is an audit trail, and an audit trail that exists for one action
and nothing else is worse than none — it implies a completeness the system
does not have.

**The snapshot grows again (R25).** `spin` now copies the prize name, the
probability, the reward type and the reward value. That is four denormalised
columns and it will look like duplication to whoever reads the schema next.
It is the same decision as F02 R10 for the same reason: the log is a record
of what happened, and a record that changes when somebody edits a dropdown is
not a record. The exception remains the player (F08 R25), who is referenced
rather than copied so that deleting them means something.

**One currency per campaign.** A shop trades in one currency. Per-reward
currency would allow a wheel offering €5 off and ₫50,000 off at once, which
is not a campaign anybody runs and is a bug nobody would catch.

## 14. Open questions

- **Stock.** The first thing a shop will ask after seeing this screen is how
  to give away only twenty of something. It is on the roadmap and it is the
  natural next feature.
- **Expiry.** A code with no end date is a liability the shop carries
  indefinitely.
- **What a free product's code should be, if anything.** Today it has none
  and is claimed by showing the screen. If staff start wanting one for every
  reward, R19 is the rule to revisit.
