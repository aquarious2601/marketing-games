# F08 — Player identification

| | |
|---|---|
| **ID** | F08 |
| **Status** | Agreed |
| **Interface** | Both |
| **Depends on** | [F02](./F02-player-spin.md), [F04](./F04-branding-and-themes.md), [F07](./F07-admin-login.md) |
| **Agreed on** | 2026-11-15 |

## 1. Summary

A phone-number step in front of the wheel: the player gives their number, a
returning number goes straight to the wheel, a new number is asked for a
first name, last name and birthday first. Nothing spins until we know who is
spinning, and the admin can see who played and what each of them won.

## 2. Why

Every spin so far is anonymous. The spin log says a Free sample went out at
20:12 and nothing more, so the business has a game and no customers: nobody
to send the next offer to, no way to tell one player from twenty spins by the
same person, and nothing to check a claim against when someone comes back an
hour later saying they won the grand prize.

A phone number is the right identity for a stall. It is the one thing a
person at a counter can give accurately in five seconds, it is what the shop
would use to reach them afterwards, and it is already how a till or a loyalty
scheme knows them.

This also makes [spin eligibility](./ROADMAP.md) possible for the first time.
It does not implement it — see R18 and section 13 — but "one spin per person"
cannot mean anything until a person is a thing the system knows.

## 3. Actors

| Actor | Role |
|---|---|
| Player | Gives a phone number, and name and birthday the first time, then spins |
| Returning player | Gives the same number and goes straight to the wheel |
| Admin user | Looks through the players and each one's spin history |
| Staff at the stall | Unaffected; they still read the prize off the screen |

## 4. User stories

- As a **player**, I want **to type my number and start playing**, so that
  **the game costs me five seconds, not a form**.
- As a **returning player**, I want **to be recognised by my number**, so that
  **I am not asked my name every time I come back to the stall**.
- As the **business**, I want **every spin attached to a person**, so that
  **the prizes that went out have names against them**.
- As an **admin user**, I want **to find a player by phone number and see
  what they have won**, so that **I can settle a question at the counter**.
- As a **player**, I want **to be asked for as little as possible**, so that
  **giving my details to a prize wheel is a small decision**.

## 5. Scope

### In scope

- A phone-number step on the player page, before the wheel.
- A name-and-birthday step, shown only for a number we have not seen.
- A `player` table keyed on a canonical phone number.
- `POST /api/player/identify`, `POST /api/player/register`,
  `GET /api/player/me`, `POST /api/player/forget`.
- `POST /api/spin` refusing an unidentified request.
- The player recorded against every spin.
- An admin player list with a phone-number filter, and a per-player spin
  history.

### Out of scope

- **Any limit on how often an identified player may spin.** Unlimited, as in
  F02 R16. Now that a player exists, limiting them is the **Spin
  eligibility** roadmap feature — see section 13.
- **Verifying the number.** No SMS code, no one-time password. A player may
  type a number that is not theirs, and will be believed. See section 13.
- **Email, address, gender, postcode, marketing consent.** Not collected. The
  three facts in R8 are the whole of it.
- **Editing or deleting a player from the admin.** Read-only here. A deletion
  request is served from the console; a management screen is its own feature.
- **CSV export of players or spins** — the **Spin log** roadmap feature.
- **A dashboard** — counts, unique players, conversion. Roadmap.
- **Rate limiting and bot protection.** Still open, still on the roadmap, and
  now slightly narrower: a script must at least post a phone number first.
- **A terms-and-conditions or privacy notice on the page.** The copy belongs
  with the **Landing page** roadmap feature; this feature keeps the
  collection minimal so that notice stays short.
- **A minimum age.** See section 14.

## 6. Rules

### Identifying

| # | Rule |
|---|---|
| R1 | The player page asks for a phone number before the wheel is shown. The wheel and the Spin button do not exist on the page until the player is identified. |
| R2 | The phone number **is** the player's identity. One number is one player; there is no other id a player ever gives. |
| R3 | A submitted number is canonicalised before it is looked up or stored: every character but the digits and a single leading `+` is discarded. `0912 345 678`, `(091) 234-5678` and `091.234.5678` are all `0912345678`. |
| R4 | A canonical number with fewer than 6 or more than 20 digits is rejected with a message, and nothing is stored. |
| R5 | If the canonical number is already stored, the player is identified immediately and asked nothing further. |
| R6 | If it is not, the player is asked for a first name, a last name and a birthday; on submission the player is created and identified. |
| R7 | Registering a number that has come into existence in the meantime identifies that existing player instead of failing, and does not overwrite their stored details. |

### What is kept

| # | Rule |
|---|---|
| R8 | A player row holds the canonical phone number, a first name, a last name, a birthday, and when the row was created. Nothing else. |
| R9 | The phone number is unique across players. |
| R10 | First and last name are trimmed and 1–40 characters. A birthday is a real calendar date, not in the future and not before 1900. |
| R11 | The player page is told only the first name and the phone number. The last name and the birthday never travel back to a browser. |

### The session

| # | Rule |
|---|---|
| R12 | Identification is held in the server session, carried by a cookie the page cannot read. The page asks the server who it is talking to rather than remembering it itself. |
| R13 | A reload, or a return to the page in the same browser session, does not ask again. |
| R14 | The page offers a way to stop being that player, which clears the session and returns to the phone step. |
| R15 | A session naming a player who no longer exists is treated as unidentified, and the session is cleared. |

### Spinning

| # | Rule |
|---|---|
| R16 | `POST /api/spin` requires an identified session. An unidentified request is refused with `403`, draws nothing and records nothing. |
| R17 | Every spin row records which player spun it. |
| R18 | An identified *person* may spin as often as they like, and nothing here is an eligibility rule. **Amended 2026-11-17 by [F20](./F20-one-spin-per-identification.md) R1, R2:** one identification now buys one spin and the server refuses a second, because the page-level version of this rule ([F10](./F10-hand-over-to-the-next-player.md) R1, R7) was page state and a reload threw it away. The same person may still identify again and play again (F20 R11), so this is still not a limit on a person. |
| R19 | Deleting a player must not delete or corrupt past spins. The row keeps its prize snapshot and loses only the player link. |

### Admin

| # | Rule |
|---|---|
| R20 | The admin can list the players: phone number, name, birthday, when they registered and how many times they spun. |
| R21 | The list can be filtered by phone number, matching any part of the stored number. |
| R22 | Opening one player shows their spin history, most recent first, with what was won and when. |
| R23 | Both admin player routes require a signed-in admin (F07 R17). |

### Personal data

| # | Rule |
|---|---|
| R24 | The step asks for nothing the game does not need. A first name to greet the player, a last name to tell two Anhs apart at the counter, a birthday for a birthday offer, and the number itself. No email, no address, no marketing checkbox. |
| R25 | The player's name is **not** snapshotted onto the spin row. Unlike the prize snapshot (F02 R10), personal data must actually disappear when the player is deleted, and a copy on every spin would mean it never did. |

## 7. Data model

One new table, and one new column on `spin`.

| Entity | Field | Type | Notes |
|---|---|---|---|
| `player` | `id` | `INT` PK auto | |
| | `phone` | `VARCHAR(24)` not null, **unique** | The canonical form (R3, R9) |
| | `first_name` | `VARCHAR(40)` not null | |
| | `last_name` | `VARCHAR(40)` not null | |
| | `birthday` | `DATE` not null | No time, no timezone — a birthday is a calendar date |
| | `created_at` | `DATETIME` not null | UTC |
| `spin` | `player_id` | `INT` FK to `player.id`, **nullable** | `ON DELETE SET NULL` (R19) |

`spin.player_id` is nullable for two reasons, and only one of them is
history: the rows written before this feature existed have no player, and
deleting a player has to leave the spin counted but anonymous (R19, R25).

The schema is applied with `doctrine:schema:update`, as everything in this
project still is — `migrations/` is empty and the end-to-end setup and
`DatabaseWebTestCase` both build the schema from the entities.

## 8. API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/player/identify` | none | Look a number up, and identify if known |
| POST | `/api/player/register` | none | Create a player and identify them |
| GET | `/api/player/me` | none | Who the page is talking to, or nobody |
| POST | `/api/player/forget` | none | Stop being that player |
| POST | `/api/spin` | **identified player** | Changed by R16 |
| GET | `/api/admin/players` | admin | The list, with an optional `phone` filter |
| GET | `/api/admin/players/{id}` | admin | One player and their spins |

POST `/api/player/identify` request and a **known** number, `200`:

```json
{ "phone": "0912345678" }
```

```json
{ "known": true, "phone": "0912345678", "player": { "firstName": "Anh", "phone": "0912345678" } }
```

An **unknown** number, `200` — no session is established, and `player` is
null rather than absent so the page has one shape to read:

```json
{ "known": false, "phone": "0912345678", "player": null }
```

POST `/api/player/register` request, and `201`:

```json
{ "phone": "0912345678", "firstName": "Anh", "lastName": "Le", "birthday": "1994-03-12" }
```

```json
{ "player": { "firstName": "Anh", "phone": "0912345678" } }
```

GET `/api/player/me`, `200` either way:

```json
{ "player": null }
```

**It is a 200 and not a 401 on purpose.** `/api/me` answers 401 when nobody
is signed in (F07 R15), and the API client turns every 401 into an
application-wide "your session has gone" signal for the admin. The player
page asking an ordinary question about an ordinary visitor must not fire
that. Not knowing who the player is, is the normal state of this endpoint.

POST `/api/spin` with no identified session, `403`:

```json
{ "error": { "status": 403, "message": "Tell us who you are before you spin." } }
```

GET `/api/admin/players?phone=345`, `200`:

```json
{
  "players": [
    {
      "id": 1,
      "phone": "0912345678",
      "firstName": "Anh",
      "lastName": "Le",
      "birthday": "1994-03-12",
      "createdAt": "2026-11-15T09:30:00+00:00",
      "spinCount": 3
    }
  ],
  "total": 1
}
```

> **Corrected by [F09](./F09-admin-modules.md) R21:** `total` was the length
> of the returned list, which is capped, so a shop with more players than
> `PlayerRepository::LIST_LIMIT` would have read the cap forever. It is now
> the number of players that match the filter.

GET `/api/admin/players/1`, `200`:

```json
{
  "player": { "id": 1, "phone": "0912345678", "firstName": "Anh", "lastName": "Le",
              "birthday": "1994-03-12", "createdAt": "2026-11-15T09:30:00+00:00", "spinCount": 3 },
  "spins": [
    { "id": 9, "prizeName": "Free sample", "spunAt": "2026-11-15T10:02:11+00:00" }
  ]
}
```

A validation failure on either player route is the `422` envelope with
`violations`, exactly as F01 R12 defines it, addressed to `phone`,
`firstName`, `lastName` or `birthday`.

## 9. Interface

### Player view — route `/`

The same themed card, the same header, the same button. One of three things
inside it:

**The phone step.** A short line of copy, one `tel` input, one button.

> **Enter your phone number**
> We use it to know who is playing. — `[ 0912 345 678 ]` — **Continue**

**The details step**, for a number we have not seen. Three inputs and a
button, with the number being registered shown above them so a mistyped
number is visible before a name is attached to it.

> **Nice to meet you** — First name, Last name, Birthday — **Start playing**
> A **Change number** link back to the phone step.

**The wheel**, exactly as F02 and F03 left it, with one new line beneath the
Spin button:

> Playing as Anh · **Not you?**

### Admin view — route `/admin`

A **Players** section beneath the branding section: a phone filter, a count,
and a table of players. One row per player, clickable. The open row shows
that player's spin history as a short list beneath it, so the admin never
leaves the page they were on.

> **Moved by [F09](./F09-admin-modules.md) R11:** this is its own module at
> `/admin/players` now, rather than a section under the branding. The list,
> the filter and the per-player history are unchanged — F09 R12 says why the
> per-player history stays now that a whole spin log exists.

### Responsive behaviour

| Width | Layout |
|---|---|
| 375px | One column. The phone step, the details step and the wheel each fit with no scrolling and no horizontal scroll. Inputs are full width, 16px text so iOS does not zoom on focus. |
| 768px | The same single column, wider card and wheel. |
| 1280px | Centred column. The admin table gains its columns back. |

The card's height budget (`--wheel-chrome` in `index.css`) grows by the
height of the "Playing as" line, so the wheel shrinks on a short window
rather than the page acquiring a scrollbar.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| Empty phone number | "Enter your phone number." Nothing is sent. |
| Phone number with fewer than 6 digits | "That does not look like a phone number." Nothing is stored (R4). |
| Phone number with more than 20 digits | The same message. |
| Phone number with spaces, dots, dashes, brackets | Accepted; canonicalised (R3). |
| Two spellings of the same number | Two players, if they canonicalise differently. Accepted cost — see section 13. |
| Empty first or last name | A message against that field; nothing is stored. |
| Name longer than 40 characters | A message against that field. |
| Birthday missing, unparseable, in the future, or before 1900 | A message against the field (R10). |
| `identify` or `register` request fails or times out | An error on the step, the typed values kept, and the player may try again. |
| `register` for a number created a moment ago by another device | That player is identified; no error (R7). |
| Spin with no session | `403`, no draw, no row (R16). The page returns to the phone step and says the game needs to know who is playing. |
| Session naming a deleted player | Treated as unidentified; the phone step is shown (R15). |
| Admin opens a player who has never spun | The history is shown as empty, not as an error. |
| Admin filter matching nothing | An empty table and a "no players match" line. |

## 11. Acceptance criteria

- [x] Given a fresh page, then a phone number is asked for and there is no Spin button anywhere on it.
- [x] Given a phone number that is already stored, when it is submitted, then the wheel appears and no name is asked for.
- [x] Given a phone number that is not stored, when it is submitted, then a first name, last name and birthday are asked for.
- [x] Given those details, when they are submitted, then one player row exists with the canonical number and the wheel appears.
- [x] Given `0912 345 678` and `(091) 234-5678`, then both identify the same player.
- [x] Given a number of three digits, when it is submitted, then it is rejected and no player row is created.
- [x] Given an identified player, when the page is reloaded, then the wheel is shown without asking again.
- [x] Given an identified player, when "Not you?" is pressed, then the phone step returns and a spin is refused again.
- [x] Given no identified session, when `POST /api/spin` is called, then it answers 403 and no spin row is written.
- [x] Given an identified player, when they spin, then the spin row names them.
- [x] Given an identified player with a result, when they press Spin again, then a second spin happens and a second row names them.
- [x] Given a player is deleted, then their spins survive with the prize snapshot and a null player link.
- [x] Given a signed-in admin, then the player list shows each player with their spin count, and filtering by part of a number narrows it.
- [x] Given a signed-out visitor, when the admin player routes are called, then they answer 401.
- [x] Given a signed-in admin opens a player, then that player's spins are listed most recent first.
- [x] Given the page at 375px, then the phone step, the details step and the wheel each fit with no horizontal scroll and no scrolling to reach the button. Checked by hand in a 375×812 window during [F11](./F11-admin-tables.md) — see that file's section 12.

## 12. Verification

Built on 2026-11-15. Automated coverage in the two fast suites:

| Suite | Result |
|---|---|
| PHPUnit | 250 tests, 1,125 assertions — green |
| Vitest | 374 tests — green |
| `npm run typecheck` | clean |
| `npm run lint` | clean |

**The end-to-end suite is not part of this feature's evidence.** Browser
checking is done by hand now (see `CLAUDE.md`), so no Playwright tests were
written for F08. What was done instead: the existing specs were repaired so a
manual `npm run test:e2e` still passes — `e2e/player.ts` identifies through
the API before the wheel specs run, `auth.spec.ts` asserts the new 403 before
identifying, and the end-to-end setup now empties the `player` table between
runs. The acceptance criteria in section 11 that are about the browser — the
375px fit, the reload, "Not you?" — are therefore **checked by hand, not by a
test**, and will stay that way until the suite is extended.

Two things were worth proving rather than asserting:

- **The canonical form really is one key.** The normaliser is tested over the
  spellings a person actually types — spaces, dots, dashes, brackets, a
  non-breaking space pasted from a message — and the controller test submits
  two different spellings and asserts that exactly one player row exists.
- **The spin really is shut.** A test calls `POST /api/spin` with no session
  and asserts both halves: the 403, and that the `spin` table is still
  empty. A refusal that still drew a prize would be invisible to a test that
  only read the status code.

### Defect found while building this

The frontend suite had been **exiting non-zero since F07**, while reporting
every test as passing. `SessionContext`'s `signOut` wrapped the request in a
`try`/`finally` with no `catch`, so a failed sign-out cleared the local state
and then let the rejection carry on out of a click handler with nowhere to put
it. Vitest counted that as an unhandled error and failed the run; in a browser
it was an unhandled rejection in the console every time somebody signed out
while offline.

Found because F08 is the first feature since to run `npm test` and look at the
exit code rather than the summary line. The `catch` is now there, with the
reason written against it. Nothing about F08 caused it and nothing about F08
depends on it — but the project's own rule is that a feature is not done while
a suite is red, and that suite was red.

## 13. Decisions and risks

**The number is canonicalised loosely, not per country.** Digits and a
leading `+`, 6 to 20 of them, and no country rules at all. Vietnamese and
French numbers both go in untouched, which is the point: the game is meant to
travel between shops without a configuration step, and a strict validator
that rejects a legitimate foreign number at a stall is worse than a loose one
that accepts a typo.

The cost was real and accepted: `0912345678` and `+84912345678` are the same
human and two players. A player who gave their number one way on Monday and
the other way on Friday was asked their name twice and appeared twice in the
admin list.

**Resolved by [F19](./F19-one-person-one-number.md)** on 2026-11-17, the
first time that cost showed up. Not by the country setting predicted here —
[F18](./F18-the-campaigns-phone-country.md) built that, and it was the wrong
shape for the reasons in F19 section 2 — but by leaving this canonicalisation
exactly as it is and comparing numbers instead of strings
(`App\Player\PhoneMatch`). Everything this section says about storing a
number loosely still holds: the row keeps what was typed, and nothing
rewrites it.

**The number is not verified.** Nobody is sent a code. A player can type
anyone's number, or a number that does not exist, and the game will believe
them. For a prize wheel at a counter this is the right trade: an SMS gate
costs money, needs a provider, and would turn a five-second step into a
two-minute one at the exact moment a passer-by decides whether to bother.
What it means is that the player list is a list of what people typed, not a
verified contact list, and it must not be treated as one — including when
someone eventually wants to text every player an offer.

**Identification is a server session, not a token in the page.** The same
mechanism as the admin login: an httpOnly cookie, the identity held
server-side. The page cannot claim to be a player by editing anything it
holds, which matters because this is the thing that now guards the spin. A
value in `localStorage` would have been one line shorter and would have let
anyone spin as anyone.

It lasts the browser session, which for a phone at a stall is as long as the
tab is open — the right length for a shared device, where the next person in
the queue must not inherit the last one's identity. "Not you?" (R14) is there
for when they do.

**Spinning stays unlimited (R18).** Amended by
[F20](./F20-one-spin-per-identification.md): one identification buys one
spin. What is written below is still true of a *person* — they may type their
number in again — and the reasoning is unchanged, because the screen for
somebody who has already played is still unbuilt and still the whole of the
eligibility feature. What F20 closed was narrower and not a campaign
decision at all: a reload was drawing a fresh prize and, since
[F16](./F16-a-code-on-every-win.md), minting a fresh code with it.

It is tempting to close it here, since
the only thing that ever stopped "one spin per person" was not knowing who a
person was. It stays out because one spin per person, one per day and one per
receipt are three different campaigns with three different screens for the
player who has already played, and that screen — "you already spun on
Tuesday and won a free sample" — is the whole of the feature. Guessing at it
here would mean building the wrong one. What this feature does is make it
possible: the guard on `/api/spin` is in place and every spin names a player,
so the eligibility feature is a rule, not a rewrite.

Until then the risk from F02 section 13 is reduced but not gone: a script now
has to post a phone number before it can spin, which costs it one request and
leaves a row with a traceable number on it. It can still spin forever.

**The player's name is deliberately not snapshotted (R25).** This is the
opposite decision from the prize snapshot in F02 R10, for the opposite
reason. A prize name must survive the prize being deleted, because the record
of what went out is the point. A person's name must *not* survive the person
being deleted, because then "delete my data" would be a lie — the name would
sit on every spin they ever made. So the spin keeps the prize by value and
the player by reference.

**Collecting a birthday is a choice with a cost.** It is the one field here
that is not needed to play, and it is the one most likely to be challenged:
it exists so the shop can send a birthday offer, which is the single most
valuable thing a small shop does with a date. It is stored as a calendar date
with no time and no timezone, it is never sent back to a browser (R11), and
if the birthday offer never gets built, this column should be dropped rather
than kept in case. The whole collection is three facts and a number; that is
the shortest list the stated purposes justify, and the privacy notice the
landing-page feature will carry can be correspondingly short.

**There is no age gate.** Nothing stops a fourteen-year-old typing a number
and a birthday. A prize wheel at a shop counter is operated in front of
staff, which is a real control but not a technical one, and inventing a
minimum age — and what the page says to someone below it — is a decision for
whoever runs the campaign, not for this feature. Recorded in section 14
rather than quietly resolved.

## 14. Open questions

- **A minimum age.** Should the page refuse a birthday under some age, and if
  so, what does it say? Needs the campaign's answer, not a guess.
- ~~**Country canonicalisation.**~~ Answered by
  [F19](./F19-one-person-one-number.md): two spellings of one number are one
  player, and it needed no country setting after all. See F19 section 2 for
  why the setting this question expected was built, measured and thrown
  away.
- **Deleting a player.** Served from the console today. Does the admin need a
  button, and should it anonymise the spins or remove them?
