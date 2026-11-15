# F09 — Admin modules

| | |
|---|---|
| **ID** | F09 |
| **Status** | Agreed |
| **Interface** | Admin |
| **Depends on** | [F01](./F01-wheel-prize-configuration.md), [F04](./F04-branding-and-themes.md), [F07](./F07-admin-login.md), [F08](./F08-player-identification.md) |
| **Agreed on** | 2026-11-15 |

## 1. Summary

The admin becomes three modules behind a tab strip — **Game**, **Players**
and **Spins** — each with its own URL, and the Spins module is new: the whole
spin log, every play by every player, newest first.

## 2. Why

The admin is one page that has been growing a section per feature. F01 put
the prize list on it, F04 added branding, F08 added players, and the result is
a single scroll in which configuring the wheel and reading a customer's
history sit on top of each other. Three unrelated jobs on one page means the
admin scrolls past two of them every time, and every future feature — prize
stock, scheduling, a dashboard — makes that worse.

It also costs requests. Opening the admin to change one prize currently loads
the wheel, the branding *and* every player, because they are all on screen.

And the spin log has nowhere to live. [F08](./F08-player-identification.md)
R22 built a player's history, which answers "what did this person win". It
cannot answer "what went out today", which is the question the business
actually asks at the end of a shift — and the rows are already in the
database.

## 3. Actors

| Actor | Role |
|---|---|
| Admin user | Moves between the three modules; configures in one, reads in two |
| Staff at the counter | Settles a claim from the Spins module, or a person's history from Players |
| Player | Unaffected. Nothing here touches the player page |

## 4. User stories

- As an **admin user**, I want **the configuration and the records kept
  apart**, so that **changing a prize does not mean scrolling past a customer
  list**.
- As an **admin user**, I want **a URL per module**, so that **I can bookmark
  the one I use and send a colleague a link to it**.
- As the **business**, I want **the whole spin log in one place, newest
  first**, so that **I can see what went out today without opening a player
  at a time**.
- As **staff at the counter**, I want **to search the log by phone number**,
  so that **I can settle "I won a voucher an hour ago" in one look**.
- As an **admin user**, I want **a list to tell me when it is not showing me
  everything**, so that **I do not read a capped page as the whole truth**.

## 5. Scope

### In scope

- Three modules — Game, Players, Spins — each at its own URL under `/admin`.
- A tab strip in the admin frame, marking the open module.
- `/admin` opening the Game module, so existing links keep working.
- The Game module: the prize list and the branding, moved as they are.
- The Players module: the F08 list, filter and per-player history, moved as
  they are.
- The Spins module: the whole spin log, newest first, filterable by phone,
  capped and honest about it.
- `GET /api/admin/spins`.
- Correcting the Players list's `total`, which has been reporting the number
  of rows returned rather than the number that match.

### Out of scope

- **Any change to the player page.** Nothing here is player-facing.
- **Changing how the wheel, the branding or the players themselves work.**
  This moves them; it does not touch their rules.
- **CSV export** of the log — the next step for the Spins module, and its own
  feature.
- **Counts, totals and conversion** — spins today, unique players, prizes
  given. That is the **Dashboard** roadmap item, and putting a row of numbers
  at the top of the Spins module now would be building it badly by halves.
- **Sorting the log by anything but time**, or filtering it by prize or date
  range. Newest first and a phone filter answer the questions being asked
  today; the rest waits until somebody asks.
- **Pagination.** The log is capped at the most recent 200 and says so
  (R16). Paging through a stall's history is a feature nobody has asked for.
- **Claim verification** — marking a prize as handed over. Roadmap, and the
  Spins module is where it will land.
- **Deleting or editing anything from the Players or Spins modules.** Both
  are read-only, as F08 left them.
- **A fourth module, or a sidebar.** Tabs are right for three. If this
  reaches six, the navigation is its own decision again.

## 6. Rules

### The modules

| # | Rule |
|---|---|
| R1 | The admin is three modules: **Game**, **Players**, **Spins**. |
| R2 | Each has its own URL: `/admin/game`, `/admin/players`, `/admin/spins`. |
| R3 | `/admin` opens the Game module, so every link, bookmark and test that predates this feature still works. |
| R4 | An unrecognised URL under `/admin` opens the Game module rather than a blank page or a dead end. |
| R5 | A tab strip names the three modules and marks which one is open, visually and to assistive technology. |
| R6 | A module loads only its own data. Opening the admin must not fetch the spin log, and opening the Spins module must not fetch the wheel. |
| R7 | Every module stays behind a session (F07 R22), and the frame around them — who is signed in, Sign out, the session-expired overlay — is identical on all three. |
| R8 | Each module has one `<h1>`, which is the module's name. Everything within it is a section with its own heading. |

### Game

| # | Rule |
|---|---|
| R9 | The Game module holds the wheel prize list (F01) and the branding (F04): the two things that configure the game. |
| R10 | They keep their separate saves (F04 R5). Moving them must not join them together. |

### Players

| # | Rule |
|---|---|
| R11 | The Players module is the F08 list, its phone filter and its per-player history, unchanged. |
| R12 | The per-player history stays even though the Spins module now exists. They answer different questions — "what did this person win" and "what went out today" — and neither is the other with a filter applied. |

### Spins

| # | Rule |
|---|---|
| R13 | The Spins module lists every spin, newest first, whoever made it. |
| R14 | A row shows the prize won, when it was spun, and the player's name and phone number. |
| R15 | A spin with no player — one predating F08, or one whose player has been deleted (F08 R19) — is listed as an anonymous spin, not hidden. The spin happened and the prize went out. |
| R16 | The list is capped at the most recent 200 and states how many of how many it is showing. A capped list must never present itself as the whole. |
| R17 | The prize name comes from the spin's own snapshot (F02 R10), so a prize the admin has since deleted still has a name in the log. |
| R18 | The list can be filtered by phone number, matching any part of it, as in F08 R21. |
| R19 | "Nothing has happened yet" and "nothing matches that filter" are different messages. |
| R20 | `GET /api/admin/spins` requires a signed-in admin (F07 R17). |

### Counts

| # | Rule |
|---|---|
| R21 | A list that reports a total reports the number of records that match, not the number of rows it returned. This corrects the Players list, which has been reporting its own length since F08. |

## 7. Data model

**Nothing new.** Every row the Spins module shows already exists: `spin` from
F02 R9 and its `player_id` from F08 R17. This feature is a rearrangement of
the interface plus one read endpoint.

## 8. API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/spins` | admin | The whole spin log, newest first |
| GET | `/api/admin/players` | admin | **Changed:** `total` is now the true count (R21) |

GET `/api/admin/spins?phone=5678`, `200`:

```json
{
  "spins": [
    {
      "id": 12,
      "prizeName": "Free sample",
      "spunAt": "2026-11-15T10:02:11+00:00",
      "player": { "id": 1, "phone": "0912345678", "firstName": "Anh", "lastName": "Le" }
    },
    {
      "id": 4,
      "prizeName": "Try again",
      "spunAt": "2026-11-14T16:40:02+00:00",
      "player": null
    }
  ],
  "total": 1432
}
```

`player` is null for an anonymous spin (R15). `total` is how many spins match
the filter, which may be far more than the number of rows returned — that
difference is the whole point of R16, and the interface shows it rather than
hiding it.

## 9. Interface

### Admin frame

Unchanged except for the tab strip, which sits between the existing header
bar and the module:

```
  Roulette admin                             tester   [ Sign out ]
 ───────────────────────────────────────────────────────────────────
  [ Game ]   Players   Spins
 ───────────────────────────────────────────────────────────────────
```

### Game — `/admin/game`

`<h1>Game</h1>`, then the two sections that were already there: **Branding**
and **Wheel prizes**, each with its own Save, and the live wheel preview
beside the prize list on a wide screen.

### Players — `/admin/players`

`<h1>Players</h1>`, then the F08 list: the phone filter, a count, a row per
player, and the history opening inside the row.

### Spins — `/admin/spins`

`<h1>Spins</h1>`, then a phone filter and the log. One row per spin: the
prize, the player's name and number, and when. A footer line when the list is
capped: *Showing the most recent 200 of 1,432 spins.*

### Responsive behaviour

| Width | Layout |
|---|---|
| 375px | Tabs stay on one line — three short words fit. Log rows wrap to two lines; the prize and the time never end up on separate screens. |
| 768px | A row per spin on one line. |
| 1280px | As now: the content column is capped so the log does not stretch into an unreadable width. |

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| `/admin` | Opens the Game module (R3) |
| `/admin/nonsense` | Opens the Game module (R4) |
| A module's data cannot be loaded | That module shows its own error and a retry. The tabs and the frame stay usable, so the admin can leave a broken module |
| The session ends while a module is open | The F07 R25 overlay, exactly as before, whichever module it is |
| The spin log is empty | "No spins yet." |
| The filter matches nothing | "No spins from that number." |
| A spin has no player | Listed, with the player shown as anonymous rather than blank (R15) |
| A spin's prize has been deleted | Listed with the snapshotted name (R17) |
| More matches than the cap | The rows, plus a line saying how many of how many (R16) |

## 11. Acceptance criteria

- [x] Given `/admin`, then the Game module opens with the prize list and the branding on it.
- [x] Given `/admin/players`, then the player list opens and the prize list is not on screen.
- [x] Given `/admin/spins`, then the spin log opens, newest first.
- [x] Given `/admin/nonsense`, then the Game module opens.
- [x] Given the Game module is open, then the tab strip marks Game as current and the spin log has not been fetched.
- [x] Given the Spins module is open, then the wheel has not been fetched.
- [x] Given a tab is pressed, then the URL changes and the module changes with it.
- [x] Given two players with spins, when the log is opened, then every spin appears regardless of who made it.
- [x] Given a spin whose player was deleted, when the log is opened, then the spin is listed as anonymous with its prize intact.
- [x] Given a prize deleted after it was won, when the log is opened, then the row still names it.
- [x] Given a phone filter, then only that player's spins are listed.
- [x] Given more spins than the cap, then the list says how many of how many it is showing.
- [x] Given a signed-out visitor, when `/api/admin/spins` is called, then it answers 401.
- [x] Given players matching a filter, then the Players list's total is the number that match.
- [x] Given the admin at 375px, then the three tabs fit on one line and no module scrolls sideways. Checked by hand during [F11](./F11-admin-tables.md) — see that file's section 12.

## 12. Verification

Built on 2026-11-15.

| Suite | Result |
|---|---|
| PHPUnit | 267 tests, 1,279 assertions — green |
| Vitest | 407 tests, 15 files — green |
| `npm run typecheck` | clean |
| `npm run lint` | clean |

As with F08, **no Playwright tests were written** — browser checking is
manual (see `CLAUDE.md`). The existing admin and branding specs were repaired
for the new heading, and they exercise `/admin` through the redirect, which
is the R3 path.

Two things were worth proving rather than asserting:

- **That a module only loads its own data (R6).** Asserted by what is *not*
  called: opening Game and checking the spin log was never fetched, and
  opening Spins and checking the wheel was never fetched. This is the whole
  performance argument for splitting the page, and it is the kind of claim
  that silently stops being true the first time somebody lifts a fetch into a
  shared parent.
- **That a capped list tells the truth (R16, R21).** A test writes more spins
  than the cap and asserts both halves: that the rows are capped, and that
  the total is the real number. The Players list failed exactly this before
  the fix.

### Defect found while building this

The Players list has been reporting `total` as the length of the rows it
returned, not the number of players matching the filter — so with more
players than `PlayerRepository::LIST_LIMIT`, the count would have quietly
read 500 forever. Nobody would have noticed at a stall, which is what makes
it worth fixing before there is a shop with 600 customers and a number that
stops moving. R21 now states the rule for every list in the admin, and the
spin log was built to it.

## 13. Decisions and risks

**Tabs with real URLs, not tab state.** A tab strip holding its state in
React would have been slightly less code and would have cost the two things
that make this worth doing: an admin cannot bookmark the module they live in,
and a reload drops them back on the first one. A URL per module also means
each module mounts and unmounts, which is what makes R6 true by construction
rather than by discipline — a module that is not on screen is not rendered,
so it cannot be fetching.

**`/admin` redirects rather than being a module of its own.** A landing page
listing the three modules was the alternative. It would be one more click on
every visit, in exchange for a page whose entire content is the tab strip
directly above it. The redirect also keeps every link, bookmark and existing
test working (R3), which is the cheapest kind of compatibility there is.

**The Game module keeps two sections rather than becoming two modules.** The
prize list and the branding are both "what the game is", they are usually
changed in the same sitting — new campaign, new theme, new prizes — and they
already sit on one screen. Splitting them would mean a tab strip of four
where two of the tabs are halves of one job. They keep their separate saves
(R10), which is the part that actually matters.

**Both the per-player history and the whole log exist (R12).** This looks
like duplication and is not. "What did this person win" is asked with a
customer standing there, from their number; "what went out today" is asked at
the end of a shift, with no particular person in mind. A single log with a
filter answers the first question worse — the admin has to know to filter,
and the player's own details are not on screen next to it — and the per-player
view answers the second not at all.

**The log is capped at 200 and admits it (R16).** The alternative is
pagination, which is a page of controls for a problem a stall does not have:
200 spins is a very good day. What a cap must never do is lie, which is
exactly what the Players list was doing (see section 12). Stating "the most
recent 200 of 1,432" costs one line and means nobody reads a truncated list
as a complete one. When a shop genuinely needs the 1,432, the answer is CSV
export, not a pager.

**An anonymous spin is listed, not hidden (R15).** It would be tidier to show
only spins with a player attached. But a spin with no player is still a prize
that left the shop — either from before F08 or from a player who exercised
their right to be deleted (F08 R19, R25) — and a log that quietly omits
prizes given away is worse than useless for the one job a log has. The
deletion rule and this one are the same decision seen from two ends: the
person disappears, the spin does not.

**The Spins module deliberately has no totals on it.** A row of counts —
spins today, unique players, prizes given — is the obvious next thing to want
and is on the roadmap as the Dashboard. Putting three of them at the top of
this module now would mean building the dashboard by halves, in the wrong
place, and "unique players" in particular cannot be counted honestly yet:
F08 canonicalises phone numbers loosely, so one person with two spellings is
two rows. A number that is wrong in a way nobody can see is worse than no
number.

## 14. Open questions

- **CSV export of the log.** The clear next step for the Spins module. Worth
  doing before a shop asks for the full 1,432 by hand.
- **Filtering the log by date, or by prize.** Not asked for yet. The phone
  filter was, because it answers a question at the counter.
- **Where claim verification lands.** Almost certainly a column in the Spins
  module, which is a reason not to fill that row with anything else.
