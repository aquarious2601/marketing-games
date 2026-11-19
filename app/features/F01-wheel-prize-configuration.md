# F01 — Wheel prize configuration

| | |
|---|---|
| **ID** | F01 |
| **Status** | Done |
| **Interface** | Admin |
| **Depends on** | [P00](./P00-walking-skeleton.md) |
| **Agreed on** | 2026-11-14 |

## 1. Summary

An admin page where the prizes on the wheel are defined — how many there are,
what each is called, and how likely each is to be won — with the wheel drawn
live beside the form as it is edited.

## 2. Why

Everything else in the game depends on this. The player's spin, the odds, the
prize reveal and every report all read the configuration defined here, so it
is the first thing that has to exist and the first thing that has to be right.

Putting it in an admin screen rather than a config file means a campaign can
be changed by whoever runs the promotion, between one market day and the next,
without a developer.

## 3. Actors

| Actor | Role |
|---|---|
| Admin | Defines the prize list and the odds |

The player does not appear in this feature. They arrive in F02.

## 4. User stories

- As an **admin**, I want **to add, rename, reorder and remove prizes**, so that
  **the wheel matches the promotion I am running**.
- As an **admin**, I want **to set each prize's chance of winning**, so that
  **I control how often the expensive prizes go out**.
- As an **admin**, I want **to be told immediately when the odds do not add up
  to 100**, so that **I cannot save a wheel that is quietly wrong**.
- As an **admin**, I want **to see the wheel as I edit it**, so that **I can
  tell whether the labels fit and the result looks right before saving**.

## 5. Scope

### In scope

- A single wheel configuration, stored in the database.
- Add, edit, reorder and delete prizes.
- Per prize: a name and a whole-number winning percentage.
- Validation, with the running total always visible.
- A live wheel preview that redraws as the form changes, before saving.
- Automatic slice colours.
- An admin route in the SPA, and the API behind it.

### Out of scope

- **The player's spin and the player page** — F02. Nothing here spins, and
  nothing here draws a winner.
- **Admin authentication** — its own feature. See R15: this page is open, and
  the app must not be deployed publicly until that exists.
- **Prize stock and quantity limits** — roadmap. A prize here is unlimited.
- **Marking a slice as a loss programmatically** — a losing slice is simply a
  prize named "Try again". The game does not yet distinguish winning from
  losing outcomes; the feature that reports on prizes given will introduce it.
- **Several wheels or campaigns, scheduling, branding and theming** — roadmap.
- **An audit trail of configuration changes** — roadmap.

## 6. Rules

### Shape of a wheel

| # | Rule |
|---|---|
| R1 | A wheel has at least 2 and at most 12 prizes. |
| R2 | Exactly one wheel exists. If none is stored, the first request creates a default one (see section 7). |
| R3 | Each prize has a name and a probability. |
| R4 | A name is required, is trimmed of surrounding whitespace, and is 1 to 40 characters after trimming. |
| R5 | A probability is a whole number from 1 to 100. Decimals and zero are rejected. |
| R6 | Duplicate prize names are allowed — two identical vouchers on one wheel is a legitimate setup. |
| R7 | Prizes have an explicit order, which the admin controls and which the preview and all later features follow. |

### Saving

| # | Rule |
|---|---|
| R8 | The probabilities of all prizes must total exactly 100 before a configuration can be saved. |
| R9 | A save that does not total 100 is rejected, and the message names the actual total. |
| R10 | A save is atomic: either every change is stored, or none is, and a rejected save leaves the stored wheel untouched. |
| R11 | A prize keeps its identity across a save when it already had one, so that later features can refer to a prize over time. |
| R12 | The API rejects an invalid payload with HTTP 422 and a list of errors identifying the field and the prize position. |

### Appearance

| # | Rule |
|---|---|
| R13 | Every slice is drawn the same size, whatever its probability. This is a deliberate decision — see section 13. |
| R14 | Slice colours are assigned automatically by position from a fixed palette, so neighbouring slices always differ and label text stays legible on every colour. |
| R15 | The admin page requires no login in this feature. It is for local use only until admin authentication exists. |
| R16 | Prize names are rendered as text, never as markup. |

### Editing

| # | Rule |
|---|---|
| R17 | The running total of probabilities is visible at all times while editing, and is shown as invalid whenever it is not 100. |
| R18 | The preview redraws as the form is edited, without saving and without contacting the server. |
| R19 | Adding a 13th prize is refused, and the control to add is disabled at 12. |
| R20 | Deleting the second-to-last prize is refused, and the delete controls are disabled at 2. |
| R21 | Leaving the page with unsaved changes warns the admin first. |

## 7. Data model

Two tables. The wheel row exists so that later features (scheduling, several
campaigns) have something to hang off without reshaping the prize table.

| Entity | Field | Type | Notes |
|---|---|---|---|
| `wheel` | `id` | `INT` PK auto | |
| | `updated_at` | `DATETIME` not null | Set on every successful save |
| `prize` | `id` | `INT` PK auto | Stable across saves (R11) |
| | `wheel_id` | `INT` FK to `wheel.id`, not null | Cascade delete |
| | `name` | `VARCHAR(40)` not null | Trimmed (R4) |
| | `probability` | `SMALLINT` not null | 1–100 (R5) |
| | `position` | `SMALLINT` not null | 0-based, contiguous, unique per wheel |

Colour is **not** stored. It is derived from `position` (R14), so reordering
recolours the wheel and no stale colour can be persisted.

### Default wheel (R2)

Created only when no wheel exists, and chosen to total 100:

| Position | Name | Probability |
|---|---|---|
| 0 | Try again | 40 |
| 1 | 5% off your next order | 25 |
| 2 | 10% off your next order | 15 |
| 3 | Free sample | 10 |
| 4 | Free gift | 7 |
| 5 | Grand prize | 3 |

## 8. API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/wheel` | none (R15) | Read the configuration, creating the default if absent |
| PUT | `/api/admin/wheel` | none (R15) | Replace the configuration as a whole |

GET response `200`:

```json
{
  "id": 1,
  "updatedAt": "2026-11-14T20:00:00+00:00",
  "totalProbability": 100,
  "prizes": [
    { "id": 1, "name": "Try again", "probability": 40, "position": 0, "colour": "#64748B" }
  ]
}
```

PUT request — the full list, in the order wanted. A prize with an `id` is
updated, one without is created, and any stored prize not listed is deleted.

```json
{ "prizes": [ { "id": 1, "name": "Try again", "probability": 40 } ] }
```

PUT responses: `200` with the saved configuration, or `422`:

```json
{
  "error": {
    "status": 422,
    "message": "The wheel configuration is invalid.",
    "violations": [
      { "field": "prizes", "message": "The probabilities must total 100. They currently total 97." },
      { "field": "prizes[2].name", "message": "A prize needs a name." }
    ]
  }
}
```

## 9. Interface

### Admin view — route `/admin`

Two panes. On a wide screen they sit side by side, the form on the left and the
preview on the right; on a narrow screen the preview comes first, above the
form, so the admin can see the effect of a change without scrolling up.

The form is a list of rows, one per prize, each with:

- up and down buttons for order (R7),
- the name field (R4),
- the probability field, a number input (R5),
- a delete button (R20).

Below the list: an **Add prize** button (R19), the **running total** (R17) —
shown plainly when it reads 100 and as an error otherwise — and **Save**, which
is disabled while the configuration is invalid.

The preview is the wheel: equal slices (R13), palette colours (R14), each
labelled with its prize name and, because this is the admin's view, its
percentage.

### Player view

Unchanged. The placeholder from P00 stays until F02.

### Responsive behaviour

| Width | Layout |
|---|---|
| 375px | Preview above the form, single column, wheel sized to the viewport less the gutter |
| 768px | Same single column, larger wheel |
| 1280px | Form and preview side by side, preview sticky while the form scrolls |

### States

| State | What is shown |
|---|---|
| Loading | A skeleton in both panes |
| Loaded | The configuration |
| Saving | Save disabled and showing progress; fields stay readable |
| Saved | A brief confirmation |
| Invalid | The total shown as an error, Save disabled, offending fields marked |
| Load failed | An error with a retry, and no empty form that could be saved over good data |
| Save failed | The error from the server, with the admin's edits still in the form |

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| Name empty or only whitespace | Field error, "A prize needs a name." Save disabled |
| Name longer than 40 characters | Input stops at 40 |
| Probability empty, 0, negative or above 100 | Field error naming the allowed range. Save disabled |
| Probability not a whole number | Rejected; the input accepts digits only |
| Total is not 100 | Total shown as an error with the actual figure. Save disabled |
| Fewer than 2 prizes | Cannot occur through the UI (R20); the API rejects it with 422 |
| More than 12 prizes | Cannot occur through the UI (R19); the API rejects it with 422 |
| Two clients save at once | Last write wins. Acceptable while there is one admin; revisit with authentication |
| Server unreachable while saving | Error shown, edits preserved, nothing lost |

## 11. Acceptance criteria

- [x] Given no wheel is stored, when the admin page loads, then the default six-prize wheel is created and shown, totalling 100.
- [x] Given the admin renames a prize and saves, when the page is reloaded, then the new name is shown.
- [x] Given the admin changes probabilities so they total 97, then the total is shown as an error naming 97 and Save is disabled.
- [x] Given probabilities totalling 97, when a save is forced through the API, then the response is 422 and the stored wheel is unchanged.
- [x] Given a prize with a blank name, then that field shows an error and Save is disabled.
- [x] Given 12 prizes, then the Add prize control is disabled.
- [x] Given 2 prizes, then both delete controls are disabled.
- [x] Given the admin reorders two prizes and saves, when the page is reloaded, then the new order and the recoloured slices persist.
- [x] Given the admin edits a name, then the preview shows the new name before anything is saved.
- [x] Given a wheel of any valid size, then every slice in the preview is the same size.
- [x] Given an existing prize is edited and saved, then its id is unchanged.
- [x] Given a prize is removed and saved, then it is deleted from the database and the remaining positions stay contiguous from 0.
- [x] Given a prize name containing HTML, when the preview and the saved page render it, then it appears as text and no markup is executed.
- [x] Given the admin page at 375px, then there is no horizontal scroll and the wheel fits the viewport.
- [x] Given unsaved changes, when the admin navigates away, then they are warned first.
- [x] Given the server returns an error on save, then the message is shown and the admin's edits remain in the form.

## 12. Verification

Built and checked on 2026-11-14. Automated coverage: 65 PHPUnit tests
(298 assertions), 109 Vitest tests, 54 Playwright tests across a desktop and
a phone viewport. All green through `.	est-all.ps1`.

Checked by hand in a real browser as well:

- The default wheel is created on first load and reads 100%.
- At 1280px the form and preview sit side by side; at 375px the preview is
  above the form and `scrollWidth` equals `clientWidth` — no sideways scroll.
- The preview redraws as a name is typed, with no request to the server.

### Two defects the tests found

**Rapid clicks were being dropped.** The row handlers read the prize list
from the render closure, so two changes landing before a re-render both
applied to the same stale array and one was lost — six clicks on "Add prize"
produced ten rows. Found by the end-to-end suite, fixed by applying every
change to the current state, and now guarded by a unit test that fires clicks
without waiting between them.

**An overlapping load overwrote the admin's edits.** Two loads could be in
flight at once — React's development double-effect reproduces it, and a retry
over a slow connection would too. Both applied, so the later response silently
replaced whatever had been typed in between. Fixed by cancelling a superseded
load and ignoring its result; guarded by a test that renders the page under
`StrictMode` and asserts the stale response never appears.

**One accessibility defect** was caught before any of that: the first palette
had `#0284C7` and `#D97706`, at 4.10:1 and 3.19:1 against white label text,
below the WCAG AA minimum of 4.5:1. The palette is now all AA-compliant and a
test computes the contrast ratio of every colour.

## 13. Decisions and risks

**Equal slices with weighted odds (R13).** The admin chose this over slices
sized to their probability. The wheel therefore shows a 3% grand prize as the
same size as a 40% "Try again", and a player reading the wheel will
over-estimate their chances.

This is a normal choice for promotional wheels and it is the admin's to make.
It is recorded here because it has consequences worth remembering:

- Where promotional odds must be disclosed, the real percentages need to appear
  in the terms and conditions. That belongs to the landing-page feature.
- The spin in F02 must draw by probability, never by slice geometry, and must
  animate to the slice that was drawn rather than deriving the prize from where
  the wheel happens to stop.

**No authentication (R15).** Anyone who can reach `/admin` can rewrite the
prizes and the odds. Acceptable on a development machine, unacceptable in
public. Admin authentication is the next platform feature and must land before
the first deployment.

## 14. Open questions

- None.
