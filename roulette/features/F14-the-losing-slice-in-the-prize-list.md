# F14 — The losing slice in the prize list

| | |
|---|---|
| **ID** | F14 |
| **Status** | Agreed |
| **Interface** | Admin |
| **Depends on** | [F01](./F01-wheel-prize-configuration.md), [F11](./F11-admin-tables.md), [F13](./F13-reward-configuration.md) |
| **Agreed on** | 2026-11-16 |

## 1. Summary

The losing slice is shown as what it is — the one row on the wheel that gives
nothing — instead of as an ordinary prize with a reward to choose.

## 2. Why

[F13](./F13-reward-configuration.md) gave every slice a reward and a
dropdown to choose it with, and then gave the losing slice the same row as
all the others. Seen on a real wheel for the first time, that is wrong in
three ways:

- The losing slice looks exactly like a prize. The one row an admin most
  needs to pick out at a glance is the one that blends in.
- It has a **Gives away** dropdown listing *Free gift*, *Grand prize* and the
  rest. Choosing any of them is meaningless: the losing slice exists because
  the toggle above is on (F13 R11), and its reward is the losing reward by
  definition. The control's only possible use is to break that.
- The reward column's label sits above its select while the name and
  percentage fields have no visible label at all, so the three controls on a
  row do not line up — the thing [F11](./F11-admin-tables.md) was written to
  stop happening in the tables, happening in the form instead.

In the user's words: *"display lost item differently with other items. Don't
need to display reward category on lost item, it's nonsense. Align better
the item for column reward catalog, the label and the select box is not in
the same line."*

## 3. Actors

| Actor | Role |
|---|---|
| **Admin** | Configures the wheel on the Game tab |

## 4. User stories

- As an **admin**, I want **the losing slice to look different from the
  prizes**, so that **I can see at a glance what the wheel gives away and
  what it does not**.
- As an **admin**, I want **no reward to choose on the losing slice**, so
  that **I am not offered a choice that cannot mean anything**.
- As an **admin**, I want **every field on a row to line up**, so that **I
  can read down a column instead of hunting across a row**.

## 5. Scope

### In scope

- Marking the losing slice in the prize list and setting it apart.
- Replacing its reward selector with a statement of what it gives away.
- Keeping the losing toggle and the prize list from contradicting each other.
- Lining up the three fields on every row, with a visible label on each.

### Out of scope

- **Marking the losing slice on the player's wheel.** It is drawn exactly
  like any other there, and must be: a player who could see which slice was
  the losing one before spinning is being told the odds (F02 R2). R5 does
  move it to the first position on the player's wheel as well, because the
  order is one order — but first is not a position a player can read
  anything into.
- **More than one losing slice.** Still refused by the server (F13 R14).
- **The Rewards tab.** The catalogue already shows a reward's type in its own
  column (F13 R5).

## 6. Rules

| # | Rule |
|---|---|
| R1 | A slice whose reward is of type `nothing` is the losing slice, and the prize list shows it as such — set apart from the rows around it and carrying a visible mark naming it. |
| R2 | The losing slice has no reward selector. |
| R3 | In its place the row says, in words, that this slice gives nothing away. The space is not left blank: a missing control reads as a bug, and a sentence reads as a decision. |
| R4 | The losing slice keeps its name field and its percentage field. The label is the admin's to write (F13 R8) and the percentage is the whole point of having the row. |
| R5 | While the toggle is on, the losing slice is the **first** slice. It is moved there when the toggle adds it, when a wheel is loaded with it elsewhere, and when an ordinary slice is pointed at the losing reward. |
| R5a | Neither arrow that would unpin it is offered: the losing row has no ↓, and the row directly under it has no ↑. Both are disabled rather than silently ignored. |
| R5b | Loading a wheel whose losing slice is not first reorders the list but does **not** mark it unsaved. The reordered list is the baseline, so the page does not open dirty over a change the admin did not make. |
| R6 | Removing the losing slice with its × turns the losing toggle off, in the same action. The toggle and the list are two views of one fact and may never disagree. |
| R7 | Every field in a prize row carries a visible label, and the three controls on a row share one baseline. |
| R8 | The labels sit above their controls on a phone, where the fields stack, and the row keeps the stacked order name, percentage, reward. |
| R9 | A prize that is not the losing slice is unchanged: it keeps its selector, and nothing about it is marked. |

## 7. Data model

Unchanged. Which slice is the losing one is derived from the reward it points
at, never stored on the prize — see section 13.

## 8. API surface

Unchanged.

## 9. Interface

### Admin view

With the toggle on, the losing slice is the first row and cannot be moved
off it (R5). Each row in the prize list is: a colour swatch, then three labelled fields —
**Prize name**, **Percentage**, **Gives away** — then the move and remove
buttons. The labels are one size, one colour and one position, so the three
controls line up.

The losing row is the same shape with three differences: a muted background
and a dashed border rather than a solid one, a small **Losing item** mark
beside its swatch, and, where the dropdown would be, the sentence
"Nothing — this is the losing item."

### Responsive behaviour

At 375px the three fields stack, each under its own label, in the order
above. The losing row's mark and sentence stack with them.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| The catalogue has no losing reward | The toggle is already disabled (F13); no row can be the losing one, and every row is ordinary |
| The losing slice is removed with × | It goes, and the toggle goes off with it (R6) |
| The losing toggle is switched off | The row goes, as it already did (F13 R13) |
| A prize's reward is changed *to* the losing reward from the dropdown | It becomes the losing row on the next render. The server still refuses a second one (F13 R14) |

## 11. Acceptance criteria

- [x] Given a wheel with the toggle on, when the Game tab loads, then exactly
      one row is marked as the losing item and the others are not.
- [x] Given the losing row, then it has no reward selector and says it gives
      nothing away.
- [x] Given the losing row, then its name and percentage fields still work.
- [x] Given the losing row, when × is pressed, then both the row and the
      toggle go.
- [x] Given an ordinary row, then it still has its selector and no mark.
- [x] Given the toggle is switched on, then the losing row appears first.
- [x] Given a saved wheel whose losing slice is third, when the Game tab
      loads, then it is shown first and the page is not marked unsaved.
- [x] Given an ordinary slice pointed at the losing reward, then it moves to
      the first position.
- [x] Given the losing row is first, then it has no ↓ and the row under it
      has no ↑.
- [x] Given any row, then each of its three fields has a visible label.

## 12. Verification

`npm test` — `GameModule.test.tsx` covers R1, R2, R3, R6 and R9 against a
wheel with a losing slice and one without.

`npx playwright test` — the full end-to-end suite passes, 148 tests across
the desktop and phone projects. Two of its specs were adjusted for R5 rather
than the behaviour being changed to suit them: the reorder spec moved row 0,
which is now the pinned losing slice with a deliberately disabled ↓, and the
removal spec took the first row, which would now switch the toggle off too
(R6).

**Not looked at in a browser.** Seeing the Game tab needs an admin account,
and creating one was not permitted in this session, so the marking, the
sentence in place of the selector, the alignment and the pinning are covered
by unit and end-to-end tests only. The 375px stack in particular is
unverified by eye.

## 13. Decisions and risks

- **One function, re-asserted after every change (R5).** A slice becomes the
  losing one three ways: the toggle adds it, a load brings one back, or an
  admin points an ordinary slice at the losing reward. `pinLosingFirst` runs
  on all three rather than each of them doing its own reordering, because
  three implementations of one rule is two chances to miss a case — and the
  third way is the one that would have been missed.

- **The losing row is derived, not flagged.** Nothing on `Prize` says "this
  is the losing one"; it is the row whose reward has type `nothing`. That is
  the same decision F13 made for the same reason — a flag is a second fact
  that can disagree with the first, and here it would disagree the moment an
  admin pointed a slice at the losing reward from the dropdown.
- **R6 rather than disabling the ×.** A disabled remove button on one row and
  not the others is a puzzle to solve, not an answer. Removing the row and
  turning the toggle off are the same intention expressed two ways, so both
  do both.
- **A sentence rather than an empty cell (R3).** The first draft simply left
  the column empty on the losing row, and it read as something failing to
  render.
- **Visible labels on every field, rather than one header row above the
  list.** A header row lines the columns up more strictly and is what
  [F11](./F11-admin-tables.md) did for the tables, but these rows stack at
  375px and a header that stops matching its columns is worse than no
  header. Per-field labels cost vertical space and survive the stack.
- **Risk: the prize list is taller.** Three labels per row where there were
  none. The player page is the one with a hard no-scroll rule (not this
  one), and an admin configuring a wheel is at a desk, so the trade was
  taken knowingly.

## 14. Open questions

- None.
