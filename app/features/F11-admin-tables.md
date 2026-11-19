# F11 — Admin tables

| | |
|---|---|
| **ID** | F11 |
| **Status** | Agreed |
| **Interface** | Admin |
| **Depends on** | [F08](./F08-player-identification.md), [F09](./F09-admin-modules.md) |
| **Agreed on** | 2026-11-15 |

## 1. Summary

The two admin listings become real tables: a labelled header on every column,
a declared width for every column, numbers aligned as numbers, and one shared
table used by both so a column means the same thing in each.

## 2. Why

Both listings were shipped as a list of flex rows with `justify-between` and
no header. That has two faults, and the second is the serious one.

**Nothing is labelled.** A row reads `Anh Le · 0912345678 · 1994-03-12 ·
15/11/2026 · 2 spins`. Which date is the birthday and which is when they
joined is left to the reader to work out from the values, which fails
completely the first time somebody joined in the year they were born, or the
first time a column is empty.

**Nothing aligns.** `justify-between` distributes each row independently, so
the phone number sits in a different place on every line depending on how
long the name beside it is. Reading down a column — which is the only reason
a listing exists rather than a paragraph per record — is impossible. Scanning
twenty rows for a number ending 5678 means reading twenty rows instead of one
column.

A data listing with labelled, aligned columns is a basic standard, and both
of these fell short of it.

## 3. Actors

| Actor | Role |
|---|---|
| Admin user | Reads down a column to find a record |
| Staff at the counter | Scans the log for a phone number while somebody waits |

## 4. User stories

- As an **admin user**, I want **every column labelled**, so that **I do not
  have to infer what a value is from what it looks like**.
- As **staff at a counter**, I want **a column I can read straight down**, so
  that **finding a number takes one glance and not twenty**.
- As an **admin user**, I want **the same column to mean the same thing in
  both listings**, so that **I learn the admin once**.

## 5. Scope

### In scope

- A shared table component: widths, labels, alignment, the scroll frame.
- The players listing rebuilt on it, with the per-player history.
- The spin log rebuilt on it.
- Numeric alignment and tabular figures.
- A compact, fixed-width date format.

### Out of scope

- **Sorting by column.** The orders are deliberate — players newest first,
  spins newest first (F09 R13) — and a sortable header is a feature with its
  own state, URL and empty cases.
- **Resizable or reorderable columns.** A stall does not need them.
- **A sticky header.** Wanted, and it interacts badly with the horizontal
  scroll frame — see section 14.
- **Pagination.** Still capped and honest about it (F09 R16).
- **Any change to what the API returns.** Presentation only; no backend
  change at all.
- **The player page.** Nothing here is player-facing.

## 6. Rules

### The table

| # | Rule |
|---|---|
| R1 | A listing is a real `<table>` with `<thead>` and `<tbody>`, not a list of flex rows, so every cell is associated with its column for assistive technology. |
| R2 | Every column has a label, in a `<th scope="col">`. No unlabelled column, ever. |
| R3 | Every column has a declared width, and the table is fixed-layout, so a given field is in the same place on every row regardless of what the row beside it contains. |
| R4 | Content too long for its column is truncated with an ellipsis and carries its full value in a `title`. It never reflows the columns. |
| R5 | Text columns are left-aligned. Counts and other numbers are right-aligned. |
| R6 | Anything read as digits — a phone number, a count, a date — is set in tabular figures, so digits line up vertically down the column. |
| R7 | A date is rendered in a compact fixed form in the admin's own locale, never as an ISO string, and never in a format whose width changes from row to row. |
| R8 | The pointer's row is marked on hover. |

### Fitting

| # | Rule |
|---|---|
| R9 | A table never widens its module. Below the width its columns need, the table scrolls horizontally **inside its own card**; the module does not scroll sideways (F09 §9). |
| R10 | No column is hidden to make a table fit. A narrow screen scrolls; it does not lose data. |

### Rows that open

| # | Rule |
|---|---|
| R11 | A player's history (F08 R22) is a row of the same table spanning every column, so the columns stay aligned above and below it. |
| R12 | The control that opens a row is a button in that row's first cell, carrying `aria-expanded`. |

### Consistency

| # | Rule |
|---|---|
| R13 | Both listings use the one shared table, and a column label means the same thing in both. |
| R14 | Loading, failure, empty and capped states sit outside the table and are unchanged by this feature (F09 R16, R19). |

## 7. Data model

Nothing.

## 8. API surface

Nothing. No endpoint changes, and no field added or removed from any
response.

## 9. Interface

### Players — `/admin/players`

| Column | Width | Align |
|---|---|---|
| Name | 28% | left |
| Phone | 20% | left |
| Birthday | 16% | left |
| Joined | 18% | left |
| Spins | 18% | **right** |

The name is the button that opens the row (R12). The history opens as a
spanning row beneath it, itself a two-column table: **Prize** and **Spun**.

### Spins — `/admin/spins`

| Column | Width | Align |
|---|---|---|
| Prize | 30% | left |
| Player | 24% | left |
| Phone | 22% | left |
| Spun | 24% | left |

An anonymous spin (F09 R15) shows `—` in Player and Phone rather than empty
cells: a dash is a stated fact, an empty cell reads as missing data.

### Responsive behaviour

| Width | Layout |
|---|---|
| 375px | The card is full width; the table scrolls horizontally within it (R9). Every column is still there (R10). |
| 768px | The players table fits without scrolling. |
| 1280px | Both fit comfortably inside the content column. |

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| A prize name longer than its column | Truncated with an ellipsis, full name in a `title` (R4) |
| A spin with no player | `—` in Player and Phone (section 9) |
| A player with no spins | `0` in Spins, right-aligned like any other count |
| An unparseable date from the API | The raw value is shown rather than "Invalid Date" |
| Zero rows | The table is not rendered at all; the empty message stands in its place (R14) |

## 11. Acceptance criteria

- [x] Given the players listing, then every column has a `<th scope="col">` label.
- [x] Given the spin log, then every column has a `<th scope="col">` label.
- [x] Given either listing, then every column has a declared width and the table is fixed-layout.
- [x] Given the players listing, then the spin count is right-aligned and its header is too.
- [x] Given rows with names of very different lengths, then the phone column starts at the same place on every row.
- [x] Given a player row is opened, then the history is a row of the same table spanning every column.
- [x] Given a player row, then its opening control is a button in the first cell carrying `aria-expanded`.
- [x] Given an anonymous spin, then Player and Phone show a dash rather than nothing.
- [x] Given a date, then it is rendered compactly and not as an ISO string.
- [x] Given the admin at 375px, then the table scrolls inside its card and the module does not scroll sideways.

## 12. Verification

Built on 2026-11-15.

| Suite | Result |
|---|---|
| PHPUnit | 267 tests, 1,279 assertions — green (unchanged; no backend change) |
| Vitest | 428 tests — green |
| `npm run typecheck` | clean |
| `npm run lint` | clean |

One thing was worth proving rather than asserting:

- **That the columns actually line up (R3).** A test renders two players
  whose names differ in length by twenty characters and asserts the phone
  cell is the same column index in both rows, and that the table is
  fixed-layout with a width declared for every column. Alignment is the
  entire point of the feature and is exactly the property that a later
  "quick fix" to one cell's class would break invisibly.

### Checked by hand in a browser

The fault this feature fixes is a visual one, so it was looked at rather
than only asserted. Both listings were loaded against a seeded database —
three players with names of very different lengths, seven spins including an
anonymous one and a prize name far too long for its column:

- **Desktop.** Headers labelled, every column reading straight down, phone
  numbers in tabular monospace, dates compact, the Spins column and its
  header right-aligned, the long name ellipsised, the history opening as a
  spanning row with its own Prize and Spun headers.
- **375px.** Both tables scroll inside their own card with every column
  intact, and `document.documentElement.scrollWidth` equals `clientWidth` —
  the page itself does not scroll sideways (R9, R10).

The same pass also settled the 375px criteria left open by F08, F09 and F10,
which had been carried unverified across three features: the phone step, the
wheel with the "Playing as" line, the prize panel and the **Next player**
hand-over all fit a 375×812 window with no scrolling, and the three module
tabs sit on one line.

## 13. Decisions and risks

**A shared table rather than two hand-built ones.** The two listings had
already drifted — different hover treatment, different date formatting, one
of them calling a count "2 spins" inside the row and the other not. One
component means a column label, a width and an alignment are declared once
and read the same way in both (R13), and the next listing (prize stock, a
CSV-shaped export view) starts correct instead of starting from whichever of
the two got copied.

**Scrolling the table, not hiding columns (R9, R10).** The obvious
alternative at 375px is to drop Birthday and Joined. It is tempting because
it needs no scroll frame — and it means an admin on a phone is quietly shown
a different, smaller truth than one on a laptop, with nothing on screen
saying so. A table that scrolls inside its card is the standard behaviour for
a data listing, loses nothing, and keeps F09's promise that the *module* does
not scroll sideways.

**Fixed layout and truncation rather than wrapping (R3, R4).** Letting a long
prize name wrap would keep every character visible and would make the row
heights uneven and the columns shift, which is the fault this feature exists
to remove. Truncating with the full value in a `title` keeps the grid and
keeps the data reachable.

**Dashes for an anonymous spin, not blanks.** An empty cell is ambiguous
between "no value" and "we failed to load it". A dash says the question was
asked and the answer is nothing — which, for a spin whose player exercised
their right to be deleted (F08 R19), is exactly the fact.

## 14. Open questions

- **A sticky header.** Genuinely wanted on a 200-row log, and it conflicts
  with the horizontal scroll frame: a container with `overflow-x: auto`
  computes `overflow-y` to `auto` as well, which makes `position: sticky`
  stick to the container rather than the viewport. Solvable, not solved here.
- **Sorting by column.** The first thing somebody will ask for after using
  the log for a week.
