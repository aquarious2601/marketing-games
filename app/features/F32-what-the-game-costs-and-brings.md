# F32 — What the game costs and brings

| | |
|---|---|
| **ID** | F32 |
| **Status** | Agreed |
| **Interface** | Admin |
| **Depends on** | [F13](./F13-reward-configuration.md), [F15](./F15-choosing-the-currency.md), [F19](./F19-one-person-one-number.md), [F21](./F21-amounts-that-fit-the-currency.md), [F27](./F27-the-store-and-its-games.md), [F31](./F31-claiming-at-the-counter.md) |
| **Amends** | [F09](./F09-admin-modules.md) §9 |
| **Agreed on** | 2026-11-19 |

## 1. Summary

A Stats module that answers, per day and per game, how many customers played,
how many came back to collect what they won, and what the shop actually spent
handing it over.

## 2. Why

[F31](./F31-claiming-at-the-counter.md) takes the spins that won nothing off
the screen. That is right for a counter and it leaves a real question
unanswered: those spins are most of what happened, and an owner deciding
whether to run the promotion again needs to know what all of it came to.

Three questions, and today the admin answers none of them.

**What does this cost me?** Nobody knows. A *percent off* reward stores a
percentage, an *amount off* stores money, and a **free product stores
nothing at all** — no price, no cost, no value. The one place money appears
is a discount's face value, which is not the same as what the shop spent.
So the cost of a campaign is currently a thing the owner reconstructs from
the till.

**What does it bring?** The system knows how many people played and, since
[F19](./F19-one-person-one-number.md), knows them as people rather than as
spellings of a phone number. It has never shown that number anywhere.

**Do they come back?** This is the one the owner actually asked for, and it
is the only one the data already answers completely: a win has a moment it
was issued and, since [F13](./F13-reward-configuration.md), a moment it was
collected. The share of wins that get collected is the promotion's whole
point measured in one figure — a prize nobody comes back for brought the
shop nothing.

[F09](./F09-admin-modules.md) section 13 refused to put three of these at the
top of the Spins module, on the grounds that it would be building this
feature by halves in the wrong place, and that unique customers could not be
counted honestly yet. The second objection is gone. This is the right place.

## 3. Actors

| Actor | Role |
|---|---|
| **Owner** | Reads the module to decide whether the promotion is worth running, and what to put on the wheel next time |
| **Staff** | Fills in what a reward costs, once, in the Rewards catalogue |

## 4. User stories

- As an **owner**, I want **the number of customers who played each day**, so
  that **I know whether the promotion brings people in**.
- As an **owner**, I want **to know how many of them came back to collect**,
  so that **I know whether a prize turns into a visit**.
- As an **owner**, I want **what I spent each day**, so that **the promotion
  has a cost I can put against what it brought**.
- As an **owner**, I want **new customers told apart from returning ones**,
  so that **I know whether I am reaching anybody new**.
- As an **owner**, I want **each game's numbers separately**, so that **I can
  tell the wheel and the gift sheet apart**.

## 5. Scope

### In scope

- A cost on each reward in the catalogue, and an average basket on the store,
  which together are what makes a cost calculable at all.
- The cost snapshotted onto a spin when it is won, so a day's figures do not
  move afterwards.
- A Stats module: a summary for a chosen stretch of days, and one row per day.
- Customers, new and returning, plays, wins, collections, the collection rate
  and the typical delay before a collection.
- What was spent, and what is still owed.
- Every figure per game as well as across all of them.

### Out of scope

- **Revenue.** The system does not know what anybody bought. The one figure
  it could multiply is the average basket the owner typed, and
  customers × basket is a made-up number wearing a currency symbol. See
  section 13.
- **Charts.** Rows first. A sparkline is worth having once somebody has read
  the rows for a week and said which shape they wanted.
- **CSV export.** Still the roadmap's, still the honest answer for more rows
  than a page should hold, and it belongs to the spin log rather than here.
- **Stock.** What a reward costs is not how many are left. Stock is the
  roadmap's and [F28](./F28-the-gift-sheet.md) is what asks for it first.
- **Per-staff figures.** [F31](./F31-claiming-at-the-counter.md) R19 records
  who handed a prize over; counting hand-overs per member of staff is a
  different conversation about a shop than this one.
- **Comparing two stretches.** "Last week against the week before" is a
  second range on every query and a second column in every row. Worth
  wanting; not in the first version.
- **Changing the day a figure counted in retrospectively.** The day is the
  store's day (R18) and the store's timezone is a setting that can change.
  Nothing recounts history when it does.

## 6. Rules

### What a reward costs

| # | Rule |
|---|---|
| R1 | A reward in the catalogue carries a **cost** — what handing one over costs the shop — in the store's currency ([F15](./F15-choosing-the-currency.md)), optional, for every reward type including a free product. |
| R2 | The cost is independent of the reward's `value`. A *20% off* has a value of 20 and a cost of whatever 20% of a basket comes to; a *free coffee* has no value at all and a cost of what the coffee costs. Two different facts, two columns. |
| R3 | A cost is a whole amount in the currency's minor units, bounded as [F21](./F21-amounts-that-fit-the-currency.md) bounds an amount, and never negative. |
| R4 | The losing reward ([F13](./F13-reward-configuration.md) R12) takes no cost. Nothing is handed over, so nothing is spent. |
| R5 | The store carries an **average basket**: what a customer typically spends, in the store's currency, optional. It exists for one purpose — pricing a percentage — and the field says so. |
| R6 | A percentage reward's cost is its percentage of the average basket. With no average basket set, a percentage reward has **no cost**, and is counted as unpriced rather than as free. |
| R7 | A cost left empty is **unpriced**, which is not zero. A reward that costs nothing to give away is a cost of zero, typed deliberately. |

### The snapshot

| # | Rule |
|---|---|
| R8 | When a spin wins something, the cost worked out at that moment is written onto the spin, beside the reward type and value it already snapshots ([F02](./F02-player-spin.md) R10). |
| R9 | Editing a reward's cost, or the average basket, changes what **later** spins cost and never restates a spin already recorded. A figure an owner read last week must still be that figure next week. |
| R10 | A spin whose reward had no cost at the time is snapshotted as unpriced, and stays unpriced even if a cost is filled in afterwards. The alternative is a cost that appears retrospectively on a prize already handed over. |
| R11 | The upgrade prices the spins already recorded, once, from the catalogue as it stands when it runs ([P02](./P02-database-upgrades.md)). Spins whose reward no longer exists, or has no cost, stay unpriced. This is a best effort and the module says how many rows it could not price. |

### What is counted

| # | Rule |
|---|---|
| R12 | **Customers**: how many distinct people played, counted as people ([F19](./F19-one-person-one-number.md)) and not as spins. |
| R13 | **New** is a customer whose first play ever falls in the day being counted; **returning** is everybody else who played that day. The two add up to the customers of R12. |
| R14 | **Plays** is spins, **wins** is the spins that won something, and the difference is stated rather than left to subtraction. |
| R15 | **Issued** is what the wins that day were worth — the shop's liability for that day. **Collected** is what was handed over, counted on **the day it was handed over**, because that is the day the shop spent it. The two are different columns and are never added together. |
| R16 | **The collection rate** is, of the wins issued on a day, the share collected **as of now**. The module says *as of now* on screen: yesterday's rate will be higher tomorrow, and a figure that quietly changes is a figure nobody can trust. |
| R17 | **The delay** is the median time between a win and its collection, over the wins of the chosen stretch that have been collected. The median rather than the mean, because one voucher collected after three months would otherwise rewrite the afternoon. |
| R18 | A day is the **store's** day ([F27](./F27-the-store-and-its-games.md) R15), the same day a spin is counted in ([F23](./F23-a-daily-spin-limit.md) R6) — not the day in the browser of whoever is reading. |
| R19 | Every figure can be read for one game or for all of them ([F27](./F27-the-store-and-its-games.md)). A customer who played both games in a day is one customer in the total and one in each game. |
| R20 | Where a stretch holds unpriced wins, the money figures say how many they are. A total that silently omits rows is worse than no total. |
| R21 | A figure with nothing behind it reads as nothing — a dash or a zero with the reason — never as `NaN`, `0%` from an empty division, or a blank cell. |

### The module

| # | Rule |
|---|---|
| R22 | The Stats module is the sixth in the admin's tab strip, with its own URL `/admin/stats`, and loads only its own data ([F09](./F09-admin-modules.md) R2, R6). |
| R23 | It opens on the last 7 days, and offers today, the last 7 and the last 30. A promotion is read by the week. |
| R24 | It shows a summary for the whole stretch and one row per day, newest day first. |
| R25 | A day on which nothing happened is a row of zeros, not a missing row. A gap in a table of days is read as a mistake. |
| R26 | Money is shown in the store's currency with the symbol it already uses ([F15](./F15-choosing-the-currency.md)). |
| R27 | Every figure is aggregated by the database, not by counting rows in PHP. The spin log is the one table in this application that grows without limit. |
| R28 | Every label and every figure's name exists in all four languages ([F12](./F12-multiple-languages.md)). |
| R29 | The module is readable at 375px: the per-day table may scroll sideways as the admin's tables do ([F11](./F11-admin-tables.md)), and the summary must not. |
| R30 | The module stays behind a session ([F07](./F07-admin-login.md) R17). |

## 7. Data model

| Entity | Field | Type | Notes |
|---|---|---|---|
| `reward` | `cost` | int, null | Minor units of the store's currency. Null is unpriced (R7), not zero. Any reward type (R1) |
| `store` | `average_basket` | int, null | Minor units. Null means a percentage cannot be priced (R6) |
| `spin` | `reward_cost` | int, null | The snapshot of R8. Null is unpriced |

Three columns, three [P02](./P02-database-upgrades.md) steps: add each one,
then one more that prices the spins already recorded (R11). Each asks the
database what it already has, as every step does.

Indexing: the per-day aggregation groups spins by date and game, so `spin`
gains an index on `(spun_at)` if it has none that serves it — decided against
the real query plan when the feature is built, not guessed here.

## 8. API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/admin/stats?from=&to=&game=` | session | The summary and the per-day rows |
| `PUT` | `/api/admin/rewards/{id}` | session | Gains `cost` |
| `POST` | `/api/admin/rewards` | session | Gains `cost` |
| `PUT` | `/api/admin/store` | session | Gains `averageBasket` |
| `GET` | `/api/admin/store` | session | Gains `averageBasket` |

The stats response carries, for the stretch and for each day: customers, new,
returning, plays, wins, nothing, issued, collected, outstanding, the
collection rate, the median delay, and the count of unpriced wins. The day is
a date in the store's zone (R18), not a timestamp.

`from` and `to` are dates in the store's zone. A missing pair is the last 7
days; a `to` before its `from`, or a stretch longer than a year, is refused
with a field-level `422` rather than silently clamped.

**Corrected while building (R1 beside R6).** R1 gives every reward type a
cost and R6 says a percentage's cost *is* its percentage of the average
basket, which taken together leaves a field the form offers and the system
ignores. A typed cost wins, and the basket is the fallback: a shop that has
worked out what a fifth of its own baskets comes to knows better than an
average does, and the hint under the field says so. With nothing typed and
no basket, the win is unpriced (R6), which is the case R20 reports.

**Also while building: the page asks for a number of days.** §8 names
`from` and `to`, and both still work. But the days are the store's (R18) and
a browser does not know which zone that is, so a page asking for "the last
30 days" would have to guess at the shop's today to name a first date. The
endpoint takes `days` as well, the half that holds the timezone works the
dates out, and the module sends only that.

**Corrected while building: the tab strip wraps.** F09 planned the admin at
375px around three tabs on one line, and said that at six the navigation
would become a decision of its own. R22 makes it six, and six do not fit a
phone: the strip measured 441px in a 393px viewport, which the admin's own
end-to-end check caught. Of the two ways out, a strip that scrolls sideways
hides whichever tabs fall off the edge — an admin who cannot see Stats does
not go looking for it — so it wraps to two rows instead. F09 §9 is what
survives unchanged, and is the rule that matters: no module scrolls sideways.
A seventh tab is still where grouping has to happen.

## 9. Interface

### Admin view

**Rewards** gains one field per reward: **What it costs you**, beside the
value, with the currency's symbol and a hint saying it is what the shop
spends rather than what the customer saves. Empty is allowed and shows as
*unpriced* in the list.

**Store** gains **Average basket**, with a hint saying what it is for: it
prices percentage rewards and nothing else.

**Stats** is a summary block — customers, new and returning, plays, wins,
collected, the rate, what was spent, what is still owed — above a table with
one row per day. A game selector sits at the top, as the Spins module's
does. Where anything is unpriced, a line under the money figures says how
many.

### Responsive behaviour

The summary is a grid of figures: one column at 375px, two at 768px, four at
1280px. The per-day table scrolls sideways on a phone like the admin's other
tables.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| A cost with more precision than the currency allows | Refused, field-level `422`, as [F21](./F21-amounts-that-fit-the-currency.md) refuses a value |
| A negative cost | Refused (R3) |
| A cost on the losing reward | Refused (R4) |
| An average basket of zero | Allowed and meaningless, so every percentage prices at zero. The hint says what the field is for; a shop that types zero has said its basket is zero |
| A percentage reward with no average basket | The win is unpriced (R6) and counted as such |
| A stretch in which nobody played | Every row zero, the rate a dash (R21) |
| A stretch whose wins are all unpriced | The money figures are dashes with the count beside them, not zeros |
| `to` before `from`, or a stretch over a year | `422` with the field named |
| A game id that does not exist | `404`, as the other per-game endpoints answer |

## 11. Acceptance criteria

- [x] Given a free product costing 25,000 ₫ and a win of it, when it is
      collected, then the day's collected figure is 25,000 ₫.
- [x] Given a 20% reward and an average basket of 200,000 ₫, when it is won,
      then the win is priced at 40,000 ₫.
- [x] Given a 20% reward and no average basket, when it is won, then the win
      is unpriced and the module says one win could not be priced.
- [x] Given a win priced at 25,000 ₫, when the reward's cost is then changed
      to 30,000 ₫, then that win is still 25,000 ₫ and the next win of it is
      30,000 ₫.
- [x] Given a win issued on Monday and collected on Wednesday, then Monday's
      issued figure holds it and Wednesday's collected figure holds it.
- [x] Given three wins on a day of which one is collected, then that day's
      collection rate is 33%.
- [x] Given a customer who played for the first time today, then today counts
      one new customer; given they play again tomorrow, then tomorrow counts
      one returning customer and no new one.
- [x] Given one customer who spun four times in a day, then that day counts
      one customer and four plays.
- [x] Given a day with six spins of which two won, then the row reads six
      plays, two wins and four that won nothing.
- [x] Given a customer who played both games in a day, then each game's row
      counts them once and the total counts them once.
- [x] Given a store in `Asia/Ho_Chi_Minh` and a spin at 23:30 local time,
      then the spin counts in that local day whatever zone the admin's
      browser is in.
- [x] Given a stretch in which nothing happened, then every day is a row of
      zeros and no figure reads `NaN`.
- [x] Given three wins collected after different waits, then the delay shown
      is the middle one. (Stated in days when it was written; the test uses
      one, two and a hundred hours, which is the same rule at a scale a test
      can set up without inventing a week.)
- [x] Given a database of spins recorded before this feature, when the
      upgrade runs, then the wins whose rewards have a cost are priced and
      the rest are reported as unpriced.
- [x] Given the upgrade runs twice, then the second run prices nothing again
      and changes nothing.
- [ ] Given the Stats module at 375px, then the summary needs no horizontal
      scroll.
- [x] Every label this feature adds exists in English, French, Chinese and
      Vietnamese.
- [x] The four fast suites pass.
- [ ] Checked by hand: a week's rows against what the shop believes happened.

## 12. Verification

`php vendor/bin/phpunit` — 698 tests. `StatsControllerTest` covers R12 to
R21 and R23 to R25 against the real database, with the spins written rather
than played for: every figure here is about *when* something happened, and a
real spin happens now, so a test that could only produce "today" could not
check a day boundary, a collection two days later, or a median delay. It is
also what lets R18 be checked properly — a win at 00:30 and one at 23:30 in
`Asia/Ho_Chi_Minh`, both landing in the shop's day whatever zone the test
host is in. `RewardCostTest` covers R1 to R7 including the correction above.
`RewardIssueTest` covers R8 to R10 through real spins, which is the only way
to exercise that the cost is snapshotted as the spin is recorded — and that
correcting a price afterwards moves the next win and not the last one.
`DatabaseUpgradeTest` covers R11: the three columns, the one-time pricing,
and that a second run prices nothing again.

`npm test` — 691 tests. `StatsModule.test.tsx` covers R15 to R21 and R23 to
R25 — the two halves of the summary, the rate with its "as of now", the
dash where there is nothing to divide, the typical wait in hours and in
days, the unpriced count, and a quiet day as a row of zeros.
`RewardsModule.test.tsx` covers the cost field including R7's unpriced
against zero and R4's absence on the losing item; `StoreModule.test.tsx`
covers the average basket, including that emptying it clears the figure.
`npm run typecheck` and `npm run lint` are clean.

`npm run test:e2e` — 150 tests, run on the user's word. It is what found the
tab strip above: `admin.spec.ts`'s "fits the viewport with no horizontal
scroll" failed at 393px with six tabs, and passes with the strip wrapping.

**Not looked at in a browser.** Every screen here is behind the admin login,
and the account's password is not this session's to type. So R29 — the
summary readable at 375px without horizontal scroll — is left unticked
rather than assumed, as is the pass against what the shop believes happened.

## 13. Decisions and risks

- **Cost is a column, not a calculation.** The tempting shortcut is to treat
  a discount's face value as its cost and leave free products out. It would
  have needed no new field and would have been wrong in the direction that
  matters: a free coffee is the cheapest thing on a wheel to promise and the
  only one that costs real stock. An owner who can see what each prize costs
  can design a wheel; one who cannot is guessing.
- **The average basket prices percentages and nothing else (R5, R6).** It is
  the only way a percentage becomes money. It is also exactly the figure
  somebody would be tempted to multiply by footfall to produce "revenue
  brought in", which is why this feature states that it does not: the shop's
  sales are not in this database, and a plausible number nobody can check is
  worse than an absent one. What the module claims to measure is customers
  and cost, both of which it holds.
- **Snapshot, not recompute (R8, R9).** Recomputing from the catalogue would
  mean a figure the owner read on Monday had changed by Friday because
  somebody corrected a price. Snapshots cost one column and make every past
  day a fact. The cost is that a price typed in wrongly stays wrong for the
  spins it priced; correcting those is a database job, deliberately, because
  rewriting history should be hard.
- **The collection rate is explicitly *as of now* (R16).** A cohort figure
  that keeps rising is confusing exactly once — the first time somebody
  notices yesterday's number went up. Saying so on screen costs a few words
  and turns a bug report into a fact about promotions.
- **Collected counts on the day it was collected (R15).** The alternative is
  attributing a collection back to the day the prize was won, which gives a
  cleaner per-campaign total and answers the wrong question for a shop
  wondering what today cost. Both are available: issued is the campaign
  view, collected is the cash view, and they sit in separate columns because
  a reader who adds them has misunderstood.
- **Six tabs.** [F09](./F09-admin-modules.md) said three was right for three
  and that six would make the navigation its own decision. This is the
  sixth, and the strip is still one row of short words, ordered as it already
  is — the shop and its games first, the things read every day after. A
  seventh needs the grouping F09 warned about, and this feature deliberately
  does not start it. `/admin` keeps opening Games
  ([F27](./F27-the-store-and-its-games.md) R36); making the numbers the front
  door is a change worth making on purpose, with the owner watching.
- **Risk: the backfill is a best effort (R11).** It prices what it can from
  today's catalogue, which means a reward whose price has changed since, or
  which has been deleted, is priced wrongly or not at all. The module states
  how many rows it could not price. The honest alternative — leaving every
  existing spin unpriced — makes the module useless on the day it ships, for
  a shop that has been running the game for weeks.
- **Risk: the figures invite a decision they cannot support alone.** A
  collection rate of 30% might mean the prize is wrong, the code is hard to
  use, or the shop is a long walk away. The module measures; it does not
  explain.

## 14. Open questions

- None.
