# F21 — Amounts that fit the currency

| | |
|---|---|
| **ID** | F21 |
| **Status** | Agreed |
| **Interface** | Admin |
| **Depends on** | [F13](./F13-reward-configuration.md), [F15](./F15-choosing-the-currency.md), [P02](./P02-database-upgrades.md) |
| **Agreed on** | 2026-11-17 |
| **Amends** | [F13](./F13-reward-configuration.md) R4 |

## 1. Summary

An amount-off reward is stored in a column that stops at 32,767, which is
not a price in đồng. The column widens and the admin is told when a number
is too big, rather than having it quietly reduced.

## 2. Why

`reward.value` has been a `SMALLINT` since [F13](./F13-reward-configuration.md),
and [`RewardInputParser`](../backend/src/Dto/RewardInputParser.php) checks a
minimum for an amount-off and no maximum. So 50,000 — an ordinary Vietnamese
promotion, about €1.80 — does not fit.

What happens then depends on the database's `sql_mode`, which is the part
that makes this worth a feature rather than a one-line patch:

| Where | `sql_mode` | What an admin saving "50,000 ₫ off" gets |
|---|---|---|
| The development machine | not strict | Silently stored as **32,767** |
| CI, and Ubuntu's MariaDB | strict | **500**, and nothing saved |

Neither is acceptable, and the first is worse: a shop would advertise a
50,000 ₫ discount and hand out 32,767 ₫, with no error anywhere and no way
to notice except by reading the row.

It was found by the continuous integration added in
[P03](./P03-deployment.md), on its first run, because CI runs the database
version production will run and the development machine does not. That is
the entire argument for CI in one bug.

The game ships Vietnamese ([F12](./F12-multiple-languages.md)) and lets a
campaign choose its currency ([F15](./F15-choosing-the-currency.md)). A
currency it cannot express a normal price in is not a currency it supports.

## 3. Actors

| Actor | Role |
|---|---|
| **Admin** | Enters an amount in their own currency and is believed, or told why not |
| **Player** | Is shown the discount that was actually configured |

## 4. User stories

- As an **admin**, I want **to enter a price in my own currency**, so that
  **the prize is the one I meant to give away**.
- As an **admin**, I want **to be told when a number is impossible**, so
  that **I am not corrected silently**.

## 5. Scope

### In scope

- Widening `reward.value` so an amount in any offered currency fits.
- An upper bound on an amount-off, with a message.
- A [P02](./P02-database-upgrades.md) step widening the column on databases
  that already exist.

### Out of scope

- **A per-currency limit.** The cap is one number for every currency. A
  limit that changes with the campaign's currency would have to re-validate
  every stored reward whenever the currency changes ([F15](./F15-choosing-the-currency.md)
  lets it change), and would make the rule different for each shop. See
  section 13.
- **Decimal amounts.** Values stay whole numbers ([F13](./F13-reward-configuration.md)
  R4). Nothing here introduces cents.
- **Percentages.** `MIN_PERCENT`/`MAX_PERCENT` are unchanged and already
  correct: 1 to 100.
- **Repairing values an earlier save truncated.** A row holding 32,767 may
  be what somebody meant. Section 13.

## 6. Rules

| # | Rule |
|---|---|
| R1 | `reward.value` **and** `spin.reward_value` are 32-bit integers. The second matters more: it is written while a player is at the wheel, so a value it cannot hold is a 500 in front of a customer rather than on an admin screen. |
| R2 | An amount-off is between `MIN_AMOUNT` (1) and `MAX_AMOUNT` (100,000,000) inclusive. |
| R3 | Above `MAX_AMOUNT` is a `422` against the `value` field with its own message, never a truncation and never a 500. |
| R4 | 100,000,000 is chosen to hold any realistic promotion in any currency the game offers — about €3,600 at the weakest of them — while still refusing a number with fifteen digits in it, which is a typo rather than a prize. |
| R5 | Percentages are untouched: 1 to 100, as [F13](./F13-reward-configuration.md) R4 already had them. |
| R6 | [P02](./P02-database-upgrades.md) widens the column where it is still `SMALLINT`. It changes no value. |
| R7 | A stored value that an earlier save truncated to 32,767 stays 32,767. Nothing can tell it apart from an admin who meant 32,767. |

## 7. Data model

| Entity | Field | Was | Is |
|---|---|---|---|
| `Reward` | `value` | `smallint`, nullable | `integer`, nullable |
| `Spin` | `rewardValue` | `smallint`, nullable | `integer`, nullable |

Still nullable, and still null for a type that carries no value
([F13](./F13-reward-configuration.md) R3). Nothing else changes.

## 8. API surface

No new endpoints and no new fields. `PUT`/`POST` on the reward routes accept
a larger `value` and answer `422` above the cap, exactly as they already do
below the floor.

## 9. Interface

### Admin view

Unchanged, apart from the message an out-of-range amount produces. The
amount field already shows the campaign's currency symbol
([F15](./F15-choosing-the-currency.md)).

### Player view

Unchanged — except that a discount of 50,000 now reads as 50,000 rather
than as 32,767.

### Responsive behaviour

Unchanged.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| An amount of 1 to 100,000,000 | Accepted (R2) |
| An amount above 100,000,000 | `422` on `value`, with the limit in the message (R3) |
| An amount below 1 | `422`, as today |
| A percentage outside 1–100 | `422`, as today (R5) |
| A value on a type that takes none | `422`, as today |
| The column is still `SMALLINT` | Widened by the upgrade command (R6) |

## 11. Acceptance criteria

- [x] Given an amount-off reward, when an admin saves 50,000, then 50,000 is
      stored and read back.
- [x] Given the same, when they save 100,000,000, then it is accepted.
- [x] Given the same, when they save 100,000,001, then it is refused with a
      message naming the limit, and nothing is stored.
- [x] Given a database whose `reward.value` is still `SMALLINT`, when the
      upgrade command runs, then the column is an integer and every value is
      unchanged.
- [x] Given a database whose `spin.reward_value` is still `SMALLINT`, then
      it is widened too.
- [x] Given that upgraded database, when the command runs again, then it
      reports nothing to do.
- [x] Given a strict `sql_mode`, when 50,000 is saved, then there is no
      error — which is the bug this closes.

## 12. Verification

`php vendor/bin/phpunit` — 545 tests.

- `RewardControllerTest` covers R2, R3 and R5 through the kernel: 50,000 and
  200,000 are stored and read back as entered, 32,768 — one past the old
  ceiling — is accepted, the cap itself is accepted, one past it is refused
  with the limit named in the message, nothing is stored when it is refused,
  and the percentage limits are untouched.
- `DatabaseUpgradeTest` covers R6 and R7 against a real database: a
  catalogue created from now on has both columns right, a pre-F21 catalogue
  is widened with its values untouched — including a row holding exactly
  32,767, which stays 32,767 — the spin log's own column is widened too, a
  50,000 amount then fits, and a second run reports nothing to do.
- The test that found this, `testItLeavesTheCurrencyAloneOnceSomethingIsCountedInIt`,
  passes unchanged. It was always inserting 50,000 and always right to; the
  column was wrong.

`npm test`, `npm run typecheck`, `npm run lint` — unchanged and green. The
admin form has no client-side limit on the amount and does not need one: the
server's `422` is what the page renders, as it does for every other field.

**Not seen in a browser.** The admin reward form still needs a pass by hand
with a large amount.

## 13. Decisions and risks

- **One cap, not one per currency.** A limit that depended on the campaign's
  currency would have to be re-checked against every stored reward each time
  [F15](./F15-choosing-the-currency.md)'s setting changed, and would make a
  perfectly valid reward become invalid because somebody switched from đồng
  to euro. One generous number applies the same rule to everybody; the cost
  is that it does not stop an admin entering a euro amount in the thousands.
  Catching that needs the shop's judgement, not the column's.
- **Why not `BIGINT`.** 32 bits hold two billion, which is beyond any
  promotion in any currency here. A wider column would only buy room for
  numbers that are certainly mistakes.
- **R7 leaves truncated values alone.** A row holding exactly 32,767 is
  either a truncated 50,000 or an admin who typed 32,767; nothing stored can
  tell which, and guessing would change a prize somebody is honouring.
  Worth saying out loud because the upgrade could have "fixed" them and
  would have been wrong to.
- **Risk: this was invisible on the development machine.** XAMPP's MariaDB
  runs without `STRICT_TRANS_TABLES`, so out-of-range values are truncated
  rather than refused, and no test caught it for eight features. The lasting
  mitigation is [P03](./P03-deployment.md)'s CI, which runs the database
  version production runs. The remaining gap is that development still runs
  a looser database than production, so the next bug of this shape is also
  found by CI rather than before the push.

## 14. Open questions

- **Whether the development machine should run strict mode too.** It would
  move this class of bug from CI to the laptop. It would also change what
  every existing test does on a machine nobody else uses, so it is a
  decision rather than a tidy-up.
