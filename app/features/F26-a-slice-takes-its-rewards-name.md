# F26 — A slice takes its reward's name

| | |
|---|---|
| **ID** | F26 |
| **Status** | Agreed |
| **Interface** | Both |
| **Depends on** | [F01](./F01-wheel-prize-configuration.md), [F13](./F13-reward-configuration.md), [F14](./F14-the-losing-slice-in-the-prize-list.md), [P02](./P02-database-upgrades.md) |
| **Agreed on** | 2026-11-17 |
| **Amends** | [F01](./F01-wheel-prize-configuration.md) R3, R4, R6, [F13](./F13-reward-configuration.md) R4, R6, R8, R9, R12, [F14](./F14-the-losing-slice-in-the-prize-list.md) R4, R7, R8 |

## 1. Summary

A wheel slice stops having a label of its own and shows the name of the
reward it gives. The prize list then fills the page, and the wheel preview
moves below it.

## 2. Why

Every slice is named twice today. The reward is called *Bon d'achat 10€* in
the catalogue, the slice pointing at it is called *Bon d'achat 10€* in the
editor, and [F13](./F13-reward-configuration.md) R9 already copies the first
into the second when a slice is created. The second name exists so that the
two can diverge — [F13](./F13-reward-configuration.md) R8 says so outright:
*"The same reward can read differently on different slices."*

That was a reasonable guess and it has not earned its keep. What it buys is
a wheel that can lie about what it gives, and a field the admin has to fill
in, check and keep in step with the catalogue for no benefit anybody has
asked for. What it costs is a row with three controls where two will do, and
a label the player sees that no longer matches the prize in the Rewards
module.

Removing it also makes the editor narrower by one field, which is what makes
the second half of this feature worth doing in the same breath: with the
name gone the prize list is a short row that does not need to share a page
with the preview, so the list takes the full width and the preview goes
underneath it.

## 3. Actors

| Actor | Role |
|---|---|
| **Admin** | Names a prize once, in the catalogue, and picks it on a slice |
| **Player** | Sees the name of the thing they actually win |

## 4. User stories

- As an **admin**, I want **to name a prize once**, so that **the wheel and
  the catalogue cannot disagree about what a slice gives**.
- As an **admin**, I want **one field fewer on every slice**, so that
  **building a wheel is picking rewards and setting odds, nothing else**.
- As an **admin**, I want **the prize list to use the whole page**, so that
  **twelve rows are readable without a column of wasted space**.

## 5. Scope

### In scope

- A slice's label is its reward's name, everywhere: the player's wheel, the
  result, the editor and the preview.
- `prize.name` is dropped, with a [P02](./P02-database-upgrades.md) step that
  reports any slice whose label will change.
- The prize row loses its name field.
- The losing slice shows its reward's name as text.
- The Game module becomes one column: prize list full width, preview after
  it.

### Out of scope

- **Renaming a reward from the Game module.** A label is edited where it
  lives, in the Rewards module. The losing row shows its name and does not
  offer to change it.
- **Shortening reward names to fit a slice.** The opposite, in fact: the cap
  goes up to 256 (R25), and the wheel wraps and truncates what will not fit
  ([section 13](#13-decisions-and-risks)).
- **Telling two slices of the same reward apart.** They now read alike by
  design; their order and their odds are what distinguish them.
- **What the spin log shows.** It keeps its own snapshot and is not touched
  (R6).

## 6. Rules

### The label

| # | Rule |
|---|---|
| R1 | A slice has no name of its own. Its label is the name of the reward it points at, and there is no way to make the two differ. This reverses [F13](./F13-reward-configuration.md) R8 and makes R9's copy unnecessary. |
| R2 | The label is the reward's name as the admin typed it, never translated, exactly as [F13](./F13-reward-configuration.md) R29 already holds for reward names. |
| R3 | Every slice must point at a reward, as it already must. There is no labelled-but-rewardless slice, so a slice can no longer be half-configured. |
| R4 | Two slices pointing at one reward read identically. That remains legitimate — two slices of the same voucher is how a wheel gives better odds on it ([F01](./F01-wheel-prize-configuration.md) R6's intent, now achieved by pointing twice rather than by typing twice). |
| R5 | The losing slice is no exception: its label is the name of the losing reward. Changing that wording means renaming that reward in the Rewards module. This amends [F14](./F14-the-losing-slice-in-the-prize-list.md) R4 and [F13](./F13-reward-configuration.md) R12, whose *Maybe next time* is now the reward's name rather than the slice's. |
| R6 | A spin keeps its own `prize_name`, written when it happened ([F02](./F02-player-spin.md) R10, [F13](./F13-reward-configuration.md) R25). Renaming a reward, or this feature landing at all, changes no past spin: the log still says what the player was told. |

### The data

| # | Rule |
|---|---|
| R7 | `prize.name` is dropped. A column nothing reads is a trap, and the reward it duplicated is already on the row. |
| R8 | The [P02](./P02-database-upgrades.md) step is idempotent: it drops the column when it is there and does nothing when it is not. |
| R9 | Before dropping it, the step counts the slices whose name differs from their reward's name and reports them, because those are the labels a player will see change. The report names them rather than only counting, and `--dry-run` shows it before anything is dropped — which is how [P03](./P03-deployment.md)'s deploy sees it first. |
| R10 | No validation replaces the old name rules. [F01](./F01-wheel-prize-configuration.md) R4's 1–40 and its violation disappear from the server and the browser; a save can no longer fail because of a label. |

### What each side is sent

| # | Rule |
|---|---|
| R11 | `GET /api/wheel` still carries a `name` on every prize — it is what the player's wheel draws — and that name is now the reward's. The player payload does not change shape, so the player page needs no change at all. |
| R12 | `GET /api/admin/wheel` no longer carries a prize name. The page already loads the reward catalogue to fill its selector, so it resolves the label from the reward id it already has. One source of truth in the payload, not two. |
| R13 | `PUT /api/admin/wheel` no longer reads a prize name. A `name` key is ignored rather than refused, so an admin holding yesterday's page is not locked out until they reload. |

### The editor

| # | Rule |
|---|---|
| R14 | A prize row has two controls: the reward it gives and its percentage. The name field is gone. This amends [F14](./F14-the-losing-slice-in-the-prize-list.md) R7's three controls. |
| R15 | The reward selector comes first, because it is now what identifies the row. Stacked on a phone the order is reward, then percentage — amending [F14](./F14-the-losing-slice-in-the-prize-list.md) R8's *name, percentage, reward*. |
| R16 | The losing row keeps [F14](./F14-the-losing-slice-in-the-prize-list.md) R3's sentence where its selector would be, and shows its reward's name as text beside it, so the admin can read what the player will read. |
| R17 | Every control still carries a visible label and the row still shares one baseline ([F14](./F14-the-losing-slice-in-the-prize-list.md) R7's intent, with one control fewer). |
| R18 | Labels are still rendered as text and never as markup ([F01](./F01-wheel-prize-configuration.md) R16), now of the reward's name. |

### The page

| # | Rule |
|---|---|
| R19 | The Game module is one column at every width. The prize list is first and takes the full width of the page. |
| R20 | The wheel preview follows the list, after the save controls, centred. It is not sticky and shares no row with anything. |
| R21 | The preview is capped at the width it already uses on a phone, so it looks the same on a laptop as on a phone and a 1,600-pixel window does not draw a wheel nobody needs that big. |
| R22 | The preview still shows the odds, as it does today. |
| R23 | At 375px the only change is the order: the preview was first and is now last, which also means the admin edits a row and scrolls down to the result rather than scrolling past the wheel to reach the rows. |

### Found while building it

Two consequences this file did not foresee, written down where the code can
cite them.

| # | Rule |
|---|---|
| R24 | Anything that used to name a slice by its label now names it by its **position**, counted from 1 as an admin counts the rows: the Rewards module's *On the wheel* column, and the refusal to delete a reward a slice uses ([F13](./F13-reward-configuration.md) R6). A label there would be the reward's own name, so "Free coffee is used by Free coffee" was the best it could have said. Rendered as `#1`, `#1, #4`. |
| R25 | A reward name is **1–256 characters**, amending [F13](./F13-reward-configuration.md) R4's 1–60, and `spin.prize_name` is widened from 40 to match it. One name now serves the catalogue, the wheel and the spin log, so the cap has no reason to be tighter than what it must hold — and 60 was chosen when this was only an admin's private word for a prize. Unfixed, the narrow snapshot is the fault [F21](./F21-amounts-that-fit-the-currency.md) had in the other direction: a strict database refuses the insert at the moment somebody spins, a lenient one truncates the record of what they won. One [P02](./P02-database-upgrades.md) step widens both columns, **before** the label column is dropped, so an interrupted upgrade is never narrower than what it is about to store. |
| R26 | Nothing enforces a shorter name for the wheel's sake. `WheelPreview` already wraps a label across lines and truncates with an ellipsis, so a name too long to draw degrades instead of being refused — the limit is about what can be stored, not about what fits on a slice. |

## 7. Data model

| Table | Change |
|---|---|
| `prize` | `name` (`VARCHAR(40)`, not null) is **dropped**. `wheel_id`, `reward_id`, `probability` and `position` are unchanged |
| `spin` | `prize_name` stays — it is a snapshot, not a reference (R6) — and is widened from `VARCHAR(40)` to `VARCHAR(256)` to match a reward name (R25) |
| `reward` | `name` is widened from `VARCHAR(60)` to `VARCHAR(256)` and stays unique (R25) |

`Prize::NAME_MAX_LENGTH`, `Prize::getName()` and `Prize::setName()` go with
the column, as does `NAME_MAX_LENGTH` and its validation in the browser's
`wheel/editor.ts`.

## 8. API surface

| Method | Path | Auth | Change |
|---|---|---|---|
| `GET` | `/api/wheel` | — | None in shape. `prizes[].name` is now the reward's name (R11) |
| `GET` | `/api/admin/wheel` | Admin | `prizes[].name` removed (R12) |
| `PUT` | `/api/admin/wheel` | Admin | `prizes[].name` no longer read; ignored if sent (R13) |

## 9. Interface

### Player view

Unchanged. The wheel, the result panel and the spin history all draw the
name they are sent, and they are sent the reward's.

### Admin view

```
Prizes                                        [ + Add a prize ]

  Reward                              Percentage
  [ Bon d'achat 10€            ▾ ]    [ 20 ] %     ↑ ↓ ×
  [ Abib Sun Stick             ▾ ]    [ 15 ] %     ↑ ↓ ×
  — this slice gives nothing away —   [ 40 ] %     ↑ ↓ ×
    Maybe next time

                                        Total 100%
  [ Save ]

              ( the wheel preview, centred )
```

The losing row's sentence stays where its selector would be, with its
reward's name under it as text.

### Responsive behaviour

One column at 375, 768 and 1280. The rows stack their two controls on a
phone and sit on one line from the tablet width up. The preview is the same
size at every width.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| A slice with no reward | Refused, as today |
| A reward renamed in the catalogue | Every slice using it reads the new name at once, and no past spin changes (R6) |
| A reward name longer than fits a slice | The wheel wraps it and truncates with an ellipsis, as it already does |
| A `name` sent in a `PUT` | Ignored (R13) |
| Two slices on one reward | Allowed (R4) |
| The upgrade run twice | The second run does nothing (R8) |
| A slice whose name differed from its reward's | Its label becomes the reward's name, and the upgrade's report named it (R9) |

## 11. Acceptance criteria

- [ ] Given a slice pointing at *Bon d'achat 10€*, then `GET /api/wheel`
      reports that prize's name as `Bon d'achat 10€`.
- [ ] Given that reward renamed to *Bon d'achat 15€*, then the wheel reports
      the new name without the wheel being saved.
- [ ] Given a spin won before the rename, then the spin log still shows the
      old name (R6).
- [ ] `GET /api/admin/wheel` contains no prize name.
- [ ] `PUT /api/admin/wheel` with a `name` on each prize saves and ignores
      it.
- [ ] `PUT /api/admin/wheel` with no `name` anywhere saves.
- [ ] A prize row renders no name input.
- [ ] A prize row renders the reward selector before the percentage.
- [ ] The losing row renders its reward's name as text and no selector.
- [ ] Given two slices pointing at one reward, both save and both read the
      same.
- [ ] The prize list renders before the preview in the document, at every
      width.
- [ ] The preview is not sticky and the page has no two-column layout.
- [ ] Given `app:upgrade-database` on a database with `prize.name`, then the
      column is dropped and the report names any slice whose label differed.
- [ ] Given it runs again, nothing changes.
- [ ] No suite references a prize name as something an admin can set.
- [ ] Given a reward used by the first slice, then deleting it is refused and
      the message says `#1` (R24).
- [ ] Given that reward in the catalogue listing, then its `usedBy` is `[1]`
      (R24).
- [ ] A 256-character reward name is accepted and a 257-character one is
      refused (R25).
- [ ] Given a 256-character reward name, then a spin of that slice records it
      whole (R25).
- [ ] Given `app:upgrade-database`, then both `reward.name` and
      `spin.prize_name` hold 256 characters, and a second run leaves them
      alone (R25).

## 12. Verification

By the suites:

- **`WheelControllerTest`** — the admin payload has no name, a `PUT` with and
  without one both save, and the public payload carries the reward's name.
- **`DatabaseUpgradeTest`** — the column dropped once, the report's wording
  when labels differ, and a second run that is a no-op.
- **`GameModule.test.tsx`** — no name input, the control order, the losing
  row's text, and that the list precedes the preview in the DOM.
- **`editor.test.ts`** — the name validation is gone and nothing else moved.
- **`WheelPreview.test.tsx`** — unchanged; it already takes labels as given.

By hand, because no suite can answer them:

- The Game module at 1280 and at 375, with twelve rows.
- A long reward name on a narrow slice, to see the truncation is tolerable
  rather than merely correct.

## 13. Decisions and risks

**Why both halves are one feature.** The row loses a field and the page
re-flows around it; doing the layout separately would mean laying the row out
twice. The connection is real rather than convenient — with the name gone, a
prize row is a selector and a number, which is what makes a full-width
single column worth having instead of a 60/40 split.

**What is actually being given up.** [F13](./F13-reward-configuration.md) R8
was a deliberate choice, not an oversight: one reward could read *Bon
d'achat 10€* on one slice and *Offre de bienvenue* on another. Nobody has
used it, and the cost of keeping the door open is a field on every row
forever. If it is ever wanted back, the answer is two rewards with the same
type and value rather than a label on a slice — and that answer is better,
because the Rewards module would then show both.

**Why the cap goes up rather than down, and why 256.** There were two limits
for one thing: a slice's 40, guessed from how much text fits on a wheel, and
a reward's 60, from when the catalogue name was an admin's private word for a
prize. Merging them could have taken the smaller — and it would have been the
wrong direction, because the wheel already copes with more than either:
`WheelPreview` wraps a label across lines and truncates with an ellipsis, and
its code carries a note about the naive `slice(0, 15)` it replaced. So the
drawing keeps the truncating and the column stops being the constraint.

256 four-byte characters is a 1,024-byte unique index on `reward.name`,
inside InnoDB's 3,072-byte limit for a `DYNAMIC` table — MariaDB's default
row format, and what both databases here use. On an older `COMPACT` table the
767-byte limit would refuse the `ALTER`, which is the right failure: loud, at
upgrade time, rather than at the counter.

**Why the admin payload drops the name rather than sending a resolved one.**
Sending it would be a smaller change in the browser, and it would put a field
in the payload that `PUT` ignores — the same shape that makes the currency
confusing. The page already holds the catalogue, so it can join.

**Why a `name` in a `PUT` is ignored rather than refused.** The admin page is
served from the same release as the API, but a browser holds the bundle it
loaded. Refusing would lock an admin out of saving until they reload, to
enforce a rule that costs nothing to ignore.

**The one thing a player will notice, and it is not hypothetical.** Any slice
whose label was edited away from its reward's name reads differently after
the upgrade. The development database has two of six:

| The slice says | Its reward is called |
|---|---|
| Try again | Maybe next time |
| Grand prize | bon d'achat 20€ |

So the divergence [F13](./F13-reward-configuration.md) R8 allowed is in use,
and the second row shows what for: a slice that reads aspirationally while
the reward it gives is prosaic. That is the capability being removed, with
eyes open — the answer afterwards is to call the reward *Grand prize* if that
is what the wheel should say, since the catalogue is then the only place the
wording lives.

R9 therefore reports rather than counts, and the deploy runs `--dry-run`
before the real step ([P03](./P03-deployment.md)), so the list is in the
deploy log before the column is gone. **What the live campaign holds is not
known from here** — its reward names need an admin session to read — so the
dry-run is the thing that will say, not a guess in this file.

**The preview stops being sticky**, so the admin no longer watches the wheel
change while editing a row halfway down the list. That is the trade in moving
it, and it is the right one for twelve rows on a laptop; if it turns out to
matter, the preview can be made to follow the viewport again without moving
it back into a column.

**On the number.** This is F26 and not F25: [P04](./P04-many-shops-in-one-installation.md)
and [`ROADMAP.md`](./ROADMAP.md) both already promise F25 to the admin
screens for shops and games. A documented gap is cheaper than a committed
cross-reference that has become wrong.

## 14. Open questions

- **Nothing blocking.** One to revisit after the first wheel built this way:
  whether the editor needs any way to tell two slices of the same reward
  apart, beyond their order and their odds.
