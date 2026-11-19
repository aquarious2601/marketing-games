# F02 — The player's spin

| | |
|---|---|
| **ID** | F02 |
| **Status** | Done |
| **Interface** | Player |
| **Depends on** | [F01](./F01-wheel-prize-configuration.md) |
| **Agreed on** | 2026-11-14 |

## 1. Summary

The player opens the page, sees the wheel the admin configured, presses Spin,
watches it turn, and is told what they won. Every spin is recorded.

## 2. Why

This is the game. F01 made the wheel configurable; without this it has never
been played.

Recording each spin costs almost nothing now and cannot be added
retrospectively — spins that happen before the log exists are gone for good,
and the first campaign is exactly the one you will want numbers for.

## 3. Actors

| Actor | Role |
|---|---|
| Player | Opens the page on a phone, tablet or desktop and spins |
| Admin | Does not appear here; they configured the wheel in F01 |

## 4. User stories

- As a **player**, I want **to spin the wheel and see what I won**, so that
  **playing is worth my time**.
- As a **player**, I want **the wheel to stop on the prize I am told I won**,
  so that **the game feels honest**.
- As a **player on a phone**, I want **the whole wheel visible without
  scrolling**, so that **I can play while standing at a stall**.
- As the **business**, I want **every spin recorded**, so that **I know how
  many people played and what went out**.

## 5. Scope

### In scope

- A public endpoint serving the wheel to players, **without the odds**.
- A public endpoint that draws a prize and records the spin.
- The player page: wheel, pointer, Spin button, result, spin again.
- Server-side weighted draw.
- A spin record per play, with the prize snapshotted.
- Respecting a reduced-motion preference.

### Out of scope

- **Any limit on how often someone can play** — a player may spin as often as
  they like. One-spin-per-person needs identification to mean anything, and
  both are their own features.
- **Identification: name, email, phone, receipt codes** — roadmap.
- **Claim codes and redemption** — the result is shown on screen and honoured
  by staff looking at it. Roadmap.
- **Distinguishing a win from a loss programmatically** — a losing slice is
  still just a prize named "Try again" (as in F01).
- **Rate limiting and bot protection** — roadmap, and noted as a risk in
  section 13.
- **Branding, landing copy, terms and conditions** — roadmap.
- **A report of the spin log** — this feature writes the rows; reading them
  back is the admin spin-log feature.

## 6. Rules

### What the player is served

| # | Rule |
|---|---|
| R1 | `GET /api/wheel` returns the prizes in order, each with its name, position and colour. |
| R2 | That response contains **no probabilities**. The odds are never sent to the player, in any field. |
| R3 | If no wheel is stored, the default from F01 R2 is created and served. |

### Drawing a prize

| # | Rule |
|---|---|
| R4 | The winning prize is drawn **on the server**. The browser is never trusted to decide, and never receives what it would need to. |
| R5 | The draw is weighted by each prize's probability. |
| R6 | The draw uses a cryptographically secure random source, so the sequence cannot be predicted from earlier results. |
| R7 | The draw uses the stored total as its bound rather than assuming 100, so a wheel edited outside the app still produces a valid prize. |
| R8 | Over many spins the distribution matches the configured probabilities. |

### Recording

| # | Rule |
|---|---|
| R9 | Every successful spin writes one row. |
| R10 | The row snapshots the prize name and the probability in force at that moment, so history stays truthful after the admin edits the wheel. |
| R11 | Deleting a prize later must not delete or corrupt past spins; the row keeps its snapshot and loses only the link. |
| R12 | A spin that fails to record is not reported to the player as a win. Recording and answering succeed or fail together. |

### Playing

| # | Rule |
|---|---|
| R13 | The wheel animates to the slice the server drew. The result is never read from where the animation stops. |
| R14 | The result is revealed when the animation finishes, not before. |
| R15 | Spin is disabled while a spin is in flight or the wheel is turning. |
| R16 | ~~After a result, the player may spin again.~~ **Superseded by [F10](./F10-hand-over-to-the-next-player.md) R1:** after a result the button hands the device to the next player. The *rule* that anyone may play as often as they like is unchanged (F08 R18) — the page simply offers one spin per identification, because this is a stall's device rather than the player's own phone. |
| R17 | A failed spin shows an error, returns the wheel to rest and allows another attempt. No prize is shown. |
| R18 | ~~Where the player's system asks for reduced motion, the wheel does not spin.~~ **Superseded by F03 R12:** every player gets the same spin. See F03 section 13. |
| R19 | Slices are equal in size, as in F01 R13. |

## 7. Data model

One new table. `wheel` and `prize` are unchanged.

| Entity | Field | Type | Notes |
|---|---|---|---|
| `spin` | `id` | `INT` PK auto | |
| | `prize_id` | `INT` FK to `prize.id`, **nullable** | `ON DELETE SET NULL` (R11) |
| | `prize_name` | `VARCHAR(40)` not null | Snapshot at the moment of the spin (R10) |
| | `prize_probability` | `SMALLINT` not null | Snapshot of the odds in force (R10) |
| | `spun_at` | `DATETIME` not null | UTC |

The snapshot is the point. A spin from last week must still say what was won
and how likely it was, even after the prize has been renamed or deleted.

## 8. API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/wheel` | none | The wheel as a player may see it |
| POST | `/api/spin` | ~~none~~ | Draw a prize and record the spin |

**Amended by [F08](./F08-player-identification.md) R16:** `POST /api/spin`
now requires an identified player and answers `403` without one. The wheel
itself is still open, because the page has to be able to draw before it knows
who is looking at it.

GET `/api/wheel` response `200` — note the absence of `probability`:

```json
{
  "prizes": [
    { "id": 1, "name": "Try again", "position": 0, "colour": "#475569" }
  ]
}
```

POST `/api/spin` response `200`:

```json
{
  "prize": { "id": 4, "name": "Free sample", "position": 3, "colour": "#B45309" },
  "spunAt": "2026-11-14T20:12:03+00:00"
}
```

`position` is what the page animates to (R13).

## 9. Interface

### Player view — route `/`

One screen, no scrolling needed on a phone:

- A short heading.
- The wheel, with a pointer at the top marking the winning slice.
- A **Spin** button beneath it.
- After the wheel stops, a result panel: "You won" and the prize name, with a
  line asking the player to show the screen to a member of staff, and a
  **Spin again** button.

Prize names only — never a percentage (R2).

### States

| State | What is shown |
|---|---|
| Loading | A placeholder wheel; Spin disabled |
| Ready | The wheel at rest; Spin enabled |
| Spinning | The wheel turning; Spin disabled; no result yet |
| Result | The wheel at rest on the winning slice; the result panel |
| Load failed | An error and a retry; no wheel, no Spin |
| Spin failed | An error; the wheel back at rest; Spin enabled again |

### Responsive behaviour

| Width | Layout |
|---|---|
| 375px | Wheel sized to the viewport less the gutter; everything fits without horizontal scroll |
| 768px | Larger wheel, same single column |
| 1280px | Centred column, wheel capped so it does not dominate |

### Motion

The wheel turns, decelerating, through several whole turns before settling on
the drawn slice. F03 replaced this with a three-phase spin and removed the
reduced-motion exception.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| Wheel cannot be loaded | Error with a retry; Spin never offered |
| Spin request fails or times out | Error; wheel returns to rest; the player may try again; no prize shown |
| The admin edits the wheel between load and spin | The drawn position may not match the stale slice list; the page reloads the wheel and shows the result by name |
| Spin pressed twice quickly | The second press is ignored (R15) |
| Stored probabilities do not total 100 | The draw still works, bounded by the actual total (R7) |

## 11. Acceptance criteria

- [x] Given a configured wheel, when the player opens the page, then the prize names appear on equal slices and no percentage is shown anywhere.
- [x] Given the public endpoint, when the wheel is fetched, then the response body contains no probability field for any prize.
- [x] Given the player presses Spin, then the wheel turns and a result appears naming one of the configured prizes.
- [x] Given the server drew a prize, when the wheel stops, then the slice under the pointer is that prize.
- [x] Given a spin, when it completes, then exactly one spin row exists carrying the prize name and probability as a snapshot.
- [x] Given a prize is deleted after it was won, then the earlier spin row survives with its snapshot and a null prize link.
- [x] Given ten thousand draws on a known wheel, then each prize is drawn at a rate close to its configured probability.
- [x] Given the spin request fails, then an error is shown, no prize is announced, and Spin can be pressed again.
- [x] Given a spin is in flight, then Spin is disabled.
- [x] ~~Given the player has a result, when they press Spin again, then a new spin happens.~~ Superseded by [F10](./F10-hand-over-to-the-next-player.md) R1: the button hands over to the next player, and the same number is recognised on the way back in.
- [x] ~~Given a reduced-motion preference, then no spin animation plays.~~ Superseded by F03 R12.
- [x] Given the page at 375px, then the wheel and the Spin button fit with no horizontal scroll.

## 12. Verification

Built and checked on 2026-11-14. Automated coverage across the three suites:
83 PHPUnit tests (384 assertions), 121 Vitest tests, 74 Playwright tests on a
desktop and a phone viewport. All green through `.	est-all.ps1`.

Two things were worth proving rather than asserting:

- **The odds really do match.** A test draws 20,000 times against a 70/25/5
  wheel and checks each prize comes out within three points of its setting.
  Every boundary of the cumulative bands is also checked exactly, because an
  off-by-one there shifts the odds of every prize at once.
- **The wheel really does stop where it says.** The rotation maths is checked
  for every wheel size from 2 to 12 and every position in each, by inverting
  it and asserting the slice under the pointer is the one the server drew.
  The end-to-end suite then reads the resting slice out of the live DOM and
  compares it with the announced prize.

Checked by hand in a real browser as well: the wheel spun for about four
seconds, came to rest with the pointer on the orange slice, announced "Free
sample", and the database recorded one row — `Free sample`, probability 10.

### Defect found while building this

The end-to-end suite had been writing to the development database rather than
its own, despite the configuration appearing to say otherwise. Found by
noticing 49 spin rows in the development database when only a handful of
clicks had been made by hand. Cause and fix are recorded in
[P01 section 12](./P01-end-to-end-tests.md); the isolation is now asserted by
a test rather than assumed.

## 13. Decisions and risks

**The draw happens on the server (R4).** Anything the browser is given, a
player can read and change. If the odds or the drawing were in the page, the
grand prize could be won on demand by anyone willing to open the developer
tools. The browser is told only which prize won, after the fact, and animates
to it.

**Anyone can spin as often as they like, and nothing stops a script.**
`POST /api/spin` is open and unlimited by design in this feature. On a
development machine that is fine. Before any real campaign, this needs a
limit, or the spin log will fill with junk and a scripted player could claim
every prize on the wheel. Rate limiting and identification are both on the
roadmap; neither is in this feature.

> **Half of this was settled by [F08](./F08-player-identification.md).** A
> spin now needs an identified player, so every row has a phone number
> against it and a script has to register before it can play. The *limit* is
> still missing: an identified player may spin as often as they like (F08
> R18), and that is deliberately left to the spin-eligibility feature.

**The equal-slice decision from F01 carries through.** The wheel still shows a
3% prize as the same size as a 40% one, and the player is shown no odds at
all. Where promotional odds must be disclosed, the real percentages belong in
the terms and conditions, which the landing-page feature will carry.

## 14. Open questions

- None.
