# F23 — A daily spin limit

| | |
|---|---|
| **ID** | F23 |
| **Status** | Agreed |
| **Interface** | Both |
| **Depends on** | [F08](./F08-player-identification.md), [F10](./F10-hand-over-to-the-next-player.md), [F12](./F12-multiple-languages.md), [F19](./F19-one-person-one-number.md), [F20](./F20-one-spin-per-identification.md) |
| **Agreed on** | 2026-11-17 |
| **Amends** | [F10](./F10-hand-over-to-the-next-player.md) R6, [F20](./F20-one-spin-per-identification.md) R11, R12 |

## 1. Summary

A campaign may say how many times one person is allowed to spin in a day,
and the server counts.

## 2. Why

This is the eligibility rule that three features have now deferred to a
fourth. [F08](./F08-player-identification.md) section 13 left it out and said
so. [F20](./F20-one-spin-per-identification.md) R12 is explicit that stopping
a reload is not stopping a person. [`ROADMAP.md`](./ROADMAP.md) has carried
*spin eligibility* since the beginning with a note that it is "the rule about
people, and it is the one that needs a campaign's answer".

It is buildable now and was not before. [F08](./F08-player-identification.md)
made a player a row. [F19](./F19-one-person-one-number.md) made one person
one row, so `+33614856240` and `0614856240` are the same person's day rather
than two. Counting "how many times has this person played today" was not a
question the database could answer until both of those landed.

What it is worth: every prize the wheel gives away costs the shop something,
and today one person may stand at the stall and spin until the good slice
comes up. [F16](./F16-a-code-on-every-win.md) gives every win a real code
that a counter will honour. The limit is the difference between a promotion
and an open till.

## 3. Actors

| Actor | Role |
|---|---|
| **Shop** | Decides how many spins a person gets in a day, and stops paying for the rest |
| **Admin** | Types that number into the Game module, or leaves it blank |
| **Player** | Gets their spins, and is told plainly when they have had them |
| **Operator** | Sets the shop's timezone once, at deploy, so "a day" means the trading day |

## 4. User stories

- As a **shop**, I want **a cap on how often one person may play**, so that
  **one visitor cannot empty the prize budget**.
- As an **admin**, I want **to set that cap without a developer**, so that
  **I can run a generous weekend and a strict Monday**.
- As a **player**, I want **to be told I have already played today**, so
  that **I am not left pressing a button that refuses me**.
- As a **shop**, I want **the cap to follow the person and not the phone in
  their hand**, so that **re-typing a number is not a way around it**.

## 5. Scope

### In scope

- One setting on the campaign: spins per person per day, blank for no limit.
- The server counting a person's spins for the current day and refusing the
  one that goes over.
- The player page showing, instead of the wheel, that they have already
  played today.
- The shop's timezone as a deployment setting, so a day is the trading day.

### Out of scope

- **Any other eligibility rule.** Once ever, once per receipt, once per
  code, a weekly cap, a cap for the whole campaign. Each is a different
  question and this one is the question that was asked.
- **Showing a player how many spins they have left.** The page says "you
  have played today", never "you have two left". A counter on screen is a
  small feature of its own and it changes how the stall behaves — see
  section 13.
- **Telling a player what the limit is.** They are told about their own day,
  not about the campaign's rule (R18).
- **Pausing a campaign.** A limit of zero is refused (R4). Start and end
  dates are *campaign scheduling* in [`ROADMAP.md`](./ROADMAP.md).
- **An admin view of who has hit the limit.** The Spins module already lists
  every spin with a time and a number; counting them per day is a dashboard
  ([`ROADMAP.md`](./ROADMAP.md)).
- **Prize stock.** Still unlimited, still the next feature along.
- **Verified numbers.** A person is a phone number somebody typed. Anybody
  willing to invent a second number gets a second allowance, which is
  [F08](./F08-player-identification.md) section 13 and unchanged here.
- **Changing [F20](./F20-one-spin-per-identification.md).** One
  identification still buys one spin. This sits on top of that and does not
  replace it.

## 6. Rules

### The limit

| # | Rule |
|---|---|
| R1 | A campaign may set how many spins one person gets per day. Blank means no limit, which is how every campaign behaves today and how an upgraded database arrives. |
| R2 | It limits a **person**, not an identification, a session, a browser or a device. One person is one `player` row ([F19](./F19-one-person-one-number.md) R1), so two spellings of one number share one allowance. |
| R3 | It is counted from recorded spins, not from anything in the session. Reloading, handing over, re-identifying, closing the browser or walking to a second stall phone changes nothing. |
| R4 | A valid limit is a whole number from 1 to 99, or blank. Zero is refused: a campaign nobody may play is a mistake rather than a setting, and pausing a campaign is a different feature. |
| R5 | It applies to spins already recorded today, not only to new ones. An admin who lowers the limit at noon may leave somebody already over it; they have nothing left for the rest of the day (R12), and nothing already given away is taken back. |

### What a day is

| # | Rule |
|---|---|
| R6 | A day runs from midnight to midnight in the shop's own timezone. |
| R7 | That timezone is one deployment setting, `APP_TIMEZONE`. The application falls back to `UTC` when it is unset, which is what a development checkout and the test suites run on — but a provisioned instance may not be silent about it: `provision.sh` requires `TIMEZONE` alongside `DOMAIN`, because a default is a guess at the one fact only the shop knows. It is not an admin field: a stall does not move, and a Game module dropdown of four hundred identifiers to carry one string was specified and withdrawn ([F24](./F24-the-campaigns-timezone.md)) — a decision that holds only while one installation serves one shop. |
| R8 | An identifier the runtime does not recognise stops the application from starting rather than quietly becoming UTC. A timezone that is silently wrong is a limit that resets in the middle of the trading day, and nobody would notice for a week — whereas a deploy that will not serve is caught by [P03](./P03-deployment.md) R5's health check and rolled back within the minute. |
| R9 | Spins are still stored in UTC, as every timestamp in this application is. The day's boundary is computed as a UTC instant and compared against the stored column, so no stored data depends on the setting and changing it needs no migration. |

### At the wheel

| # | Rule |
|---|---|
| R10 | `POST /api/spin` is refused with `429 Too Many Requests` when this person has used the day's allowance. Nothing is drawn, nothing is recorded and no code is minted — checked before the draw, exactly as [F20](./F20-one-spin-per-identification.md) R2 is. |
| R11 | `429` rather than [F20](./F20-one-spin-per-identification.md)'s `409`, because the two refusals want two different screens: `409` means "you have spun, here is what you won" and `429` means "come back tomorrow". A page cannot tell them apart from one status. |
| R12 | `GET /api/player/me` reports `spinsLeft`: how many this person has left today, or `null` when the campaign has no limit. |
| R13 | `POST /api/player/identify` and `POST /api/player/register` report the same `spinsLeft`, so the page knows the answer at the moment somebody is identified rather than after drawing a wheel it has to take away again. |

### What the player sees

| # | Rule |
|---|---|
| R14 | A player with no spins left sees, where the wheel would be, that they have already played today and are welcome back tomorrow. No wheel, no Spin button anywhere in the document. |
| R15 | It says nothing else about their day: not what they won, not their reward code, not how many times they played. Anybody may type anybody's number into a stall phone — see section 13. |
| R16 | **Next player** is on that screen, so the stall can move on to the person behind them ([F10](./F10-hand-over-to-the-next-player.md) R3). |
| R17 | The message is shown in the language the player has chosen ([F12](./F12-multiple-languages.md) R1), in all four. |
| R18 | Nothing on the player page states the limit. A player is told about their own day, never that the shop allows three. |
| R19 | A player who still has spins left sees exactly what they see today. Nothing is added to the ordinary screen. |

### The admin's side

| # | Rule |
|---|---|
| R20 | The campaign section of the Game module gains the field, beneath the currency: a number, blank for no limit, with the hint saying so. |
| R21 | It is saved by the same `PUT` as the rest of that section, and an invalid value comes back as a violation against that field ([F01](./F01-wheel-prize-configuration.md) R12) rather than as a failed save. |
| R22 | The limit is in the admin's branding payload only. It is not in the public one the player page loads with the wheel, because the player page has no use for it (R18) and anything sent there is readable by anybody. |

## 7. Data model

One nullable column on the campaign's record.

| Entity | Field | Type | Notes |
|---|---|---|---|
| `Branding` | `daily_spin_limit` | `SMALLINT NULL`, default `NULL` | Null means no limit (R1). Capped at 99 by R4 before it reaches the column |

A [P02](./P02-database-upgrades.md) upgrade step adds the column. There is no
backfill: null is the correct value for every existing row and is the
behaviour those campaigns have today.

`SMALLINT` after [F21](./F21-amounts-that-fit-the-currency.md) is a question
worth answering rather than assuming. It is safe here because R4 validates
the value to 1–99 before it is ever written, which is exactly what F21's
reward value did not have — that column took whatever an admin typed.

Nothing else is stored. "How many times has this person played today" is a
count over `spin`, which already has `player_id` and an indexed `spun_at`.

## 8. API surface

No new endpoints.

| Endpoint | Change |
|---|---|
| `GET /api/player/me` | Gains `spinsLeft: int \| null` (R12) |
| `POST /api/player/identify` | Gains `spinsLeft: int \| null` on a known number (R13) |
| `POST /api/player/register` | Gains `spinsLeft: int \| null` (R13) |
| `POST /api/spin` | Refuses with `429` when the day is used up (R10). Its successful response is unchanged |
| `GET /api/admin/branding` | Gains `dailySpinLimit: int \| null` (R22) |
| `PUT /api/admin/branding` | Accepts `dailySpinLimit` (R20, R21) |
| `GET /api/wheel` | **Unchanged.** The public branding payload does not carry the limit (R22) |

`spinsLeft` is `null` for an unlimited campaign and for an unidentified
visitor, who has no day to count. It is never negative: somebody left over
the limit by R5 reads as `0`.

## 9. Interface

### Player view

A fourth state for the page, beside the phone step, the wheel and the result
panel: **already played**. Same card, same branding, same theme scene. A
short line of copy where the wheel sits, and **Next player** beneath it.

Copy, in all four languages (R17), to the effect of *"You have already played
today. Come back tomorrow."* No prize, no code, no count.

### Admin view

In the Game module's campaign section, under the currency selector:

- **Spins per player per day** — a number input.
- Hint: *"Leave blank for no limit."*
- A violation under the field when it is not a whole number from 1 to 99.

### Responsive behaviour

The already-played state is one line of text and one button, so it is the
smallest screen the player page has. At 375px it fits without scrolling, as
the repository's `CLAUDE.md` requires of every player screen.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| No limit set | Everything behaves as today; `spinsLeft` is null |
| Limit set, spins left | The wheel and the Spin button, as today (R19) |
| Limit set, none left | The already-played screen (R14), `spinsLeft` is `0` |
| `POST /api/spin` with none left | `429`, nothing drawn, nothing recorded, no code (R10) |
| A stale tab pressing Spin after the day is used | It re-asks `/api/player/me` and shows the already-played screen |
| The same person, a second identification | Counted against the same day (R2, R3) |
| The same number typed differently | The same person, one allowance ([F19](./F19-one-person-one-number.md)) |
| A brand-new registration | Has spun nothing, so has the whole allowance |
| Nobody identified | `403` as today ([F08](./F08-player-identification.md) R16); eligibility is not asked before identity |
| An identification that has already spun | `409` as today ([F20](./F20-one-spin-per-identification.md) R2). F20 is checked first: it is about this session, not about the day |
| The limit lowered below what somebody has already had | `spinsLeft` is `0`, nothing is reclaimed (R5) |
| `dailySpinLimit` of 0, or 100, or "three" | `422` with a violation on the field (R4, R21) |
| `APP_TIMEZONE` unset | `UTC` (R7) |
| `APP_TIMEZONE` misspelled | The application refuses to start (R8) |
| Midnight passes while a player is standing there | Their next request is counted against the new day |

## 11. Acceptance criteria

- [x] Given no limit set, when a person spins repeatedly across several
      identifications, then every spin is drawn, as today.
- [x] Given a limit of 1 and a person who has spun today, when they identify
      again and `POST /api/spin`, then it is refused with `429` and no spin
      row is written.
- [x] Given the same, then no reward code is minted.
- [x] Given a limit of 3 and a person who has spun twice today, when they
      identify again, then `spinsLeft` is 1 and the spin is drawn.
- [x] Given a limit of 2 and a person whose two spins were made yesterday in
      the shop's timezone, then `spinsLeft` is 2 and they may spin.
- [x] Given a spin recorded at 23:30 local on the day before, when the limit
      is 1, then the player may spin today — proving the boundary is local
      and not UTC.
- [x] Given a person who spun as `0614856240`, when they identify as
      `+33614856240`, then the day's count includes that spin.
- [x] Given a limit of 1 and a person who has used it, when the page loads,
      then the already-played message is shown and there is no spin control
      in the document.
- [x] Given that screen, then neither the prize they won nor their reward
      code appears anywhere in the document.
- [x] Given that screen, when **Next player** is pressed, then the phone step
      is shown.
- [x] Given that screen in each of the four languages, then the message is in
      that language.
- [x] Given a limit set, when `GET /api/wheel` is read, then the limit is not
      in the response.
- [x] Given the admin saves a limit of 0, 100 or a word, then the save is
      refused with a violation on that field and the stored value is
      unchanged.
- [x] Given the admin clears the field, then the campaign has no limit and
      every person may spin freely again.
- [x] Given `APP_TIMEZONE=Europe/Paris`, then the day's boundary is Paris
      midnight.
- [x] Given `APP_TIMEZONE=Not/APlace`, then the application does not serve.
- [x] Given a limit and a person with spins left, then the player page is
      unchanged from today.

## 12. Verification

`php vendor/bin/phpunit` — 583 tests, 38 of them new.

- `CampaignDayTest` is where the feature actually lives. Seven cases on one
  instant: UTC, Paris an hour ahead, Ho Chi Minh City seven, the half hour
  after local midnight when UTC still says yesterday, that the answer always
  comes back in UTC, and that a misspelled or empty `APP_TIMEZONE` refuses to
  be constructed (R6-R9).
- `DailySpinLimitTest` covers the rule end to end (R1-R3, R5, R10-R13, R18):
  unlimited behaves as before; the second spin of the day is a `429` that
  records nothing and mints no code; the count comes down 3, 2, 1, 0;
  lowering the limit leaves somebody at zero rather than in debt; a spin a
  minute before the day began does not count and one at its first second
  does; `+84912345678` and `0912345678` share one allowance; one person's day
  does not touch another's; the session's conflict still wins over the day's
  refusal, and an unidentified visitor still gets a `403`.
- `BrandingControllerTest` covers the setting (R4, R20-R22): saved as a
  number and as a string, cleared by null and by an empty string, left alone
  when the key is absent, and refused for 0, 100, "three", "3.5", -1, 2.5 and
  `true` — with nothing else in the request saved behind a bad one.
- `DatabaseUpgradeTest` covers the column: added nullable, left null on a
  campaign that predates it, untouched on a second run.

One existing test had to change and it is worth naming. F08's
"the player page is never told the last name" searched the raw response body
for `Le`, and `spinsLeft` contains it. The assertion now walks the decoded
values instead of the envelope, which is what F08 R11 was ever about — a
test of what leaks had quietly become a test of how the keys are spelled.

`npm test` — 577 tests. `PlayerPage.test.tsx` covers the fourth screen
(R14-R16, R19): it replaces the wheel, leaves no spin control in the
document, shows neither the prize nor the code nor a count, hands over to the
next player, appears the moment an exhausted person identifies, and recovers
from a `429` on a stale tab — and gives way to a result won in this session,
which is the one case where F20 R6 outranks it. `BrandingSection.test.tsx`
covers the field and its violation. `i18n.test.ts` now fails if any of the
three new phrases is still English in French, Vietnamese or Chinese (R17).

`npm run typecheck`, `npm run lint` — clean. The lint warnings printed are
the fourteen this repository already had.

**Looked at in a browser at 375px**, which is where F22 taught us the suites
cannot see. With a limit of 2 against a number with eleven spins already
recorded today: the already-played screen replaced the wheel — no spin
control in the document, no digit anywhere on the page, nothing to scroll,
and **Next player** beneath it. Switched to Vietnamese and it was
Vietnamese. `POST /api/spin` by hand answered `429` and recorded nothing
(eleven spins before, eleven after). Raised the limit to 20 and the wheel
came back, with nine left.

**Not checked by eye: the admin field.** The Game module needs an admin
session, and the tests above are what stands behind it until the manual pass.

The end-to-end specs were read and left alone: not one of them sets a limit,
so every one is an unlimited campaign behaving exactly as before. **Not
run** — that is the user's, per the repository's `CLAUDE.md`.

## 13. Decisions and risks

- **The timezone is a deployment setting, not an admin field.** The
  alternative was a dropdown beside the currency, which is more discoverable
  and would have been a second feature's worth of work for a value that is
  set once and never touched again: the stall does not move between
  countries. Making it an env var keeps this feature one thing. The cost is
  that it is invisible to the shop, which is why R8 makes a wrong one loud
  instead of letting it rot.
- **Why not simply count in UTC.** It would have worked by accident. Midnight
  UTC is 1am in Paris and 7am in Ho Chi Minh City, and a stall is shut at
  both. It breaks the first time a shop stays open late, or opens early, or
  the campaign runs anywhere further west — and it breaks silently, as a
  player who is refused at 00:30 local and allowed again an hour later.
  Accepting a known-wrong boundary because today's two timezones happen to
  forgive it is how the [F18](./F18-the-campaigns-phone-country.md) mistake
  started.
- **Why not a rolling 24 hours.** It needs no timezone at all, which is
  genuinely attractive. It was rejected because it does not mean what people
  mean: a player who spun at 7pm on Monday and is refused at 11am on Tuesday
  has been told "once a day" and is being refused on the next day. The
  support conversation that follows is worse than an env var.
- **Nothing about the earlier spin is shown (R15).** Re-showing today's prize
  and code would be kind to a player who lost their code, and it was the
  first thing considered. It is a hole: anybody may type anybody's number
  into the stall phone, so the page would print a stranger's voucher code to
  whoever guesses a number. [F20](./F20-one-spin-per-identification.md) shows
  a result only to the session that won it, which is the line this keeps. A
  player who has lost their code asks staff, who have the Spins module and
  its filter ([F16](./F16-a-code-on-every-win.md) R7).
- **Why `429` rather than `409`.** Covered by R11, and worth spelling out:
  [F20](./F20-one-spin-per-identification.md) chose `409` over `403` for
  exactly this reason — the status is how the page knows which screen to
  draw. A third condition wants a third status, and `429 Too Many Requests`
  is what this is.
- **The limit lives on the `branding` row, which is not what that table is
  called.** `branding` is already the campaign's single record in practice:
  [F13](./F13-reward-configuration.md) R27 put the currency there on the
  grounds that a campaign has one. A spins-per-day rule is the same kind of
  fact. The alternative is a third one-row table for one nullable integer.
  It is a naming debt and it is written down here so that whoever eventually
  adds campaign scheduling renames the thing rather than adding a fourth
  home for campaign-level settings.
- **Risk: the count and the insert are not one transaction.** Two requests
  arriving together can both read "one spin left" and both spin, exactly as
  [F20](./F20-one-spin-per-identification.md) accepted for its session key.
  The window is milliseconds and the cost is one extra prize at a stall with
  one phone. Closing it means locking the player row for every spin, which
  is a real cost on every play to prevent something that needs two
  simultaneous taps by one person. Accepted, and recorded.
- **Risk: a person is still a phone number somebody typed.** Anybody willing
  to invent a number gets another allowance. That is
  [F08](./F08-player-identification.md) section 13's open cost, and it is
  what *verifying the number* on [`ROADMAP.md`](./ROADMAP.md) is for. The
  limit stops the honest repeat visitor and the bored one, not a determined
  cheat.
- **What this amends.** [F10](./F10-hand-over-to-the-next-player.md) R6 and
  [F20](./F20-one-spin-per-identification.md) R11 say a number that has just
  played may type itself in and play again. That stays true, and is now
  bounded: it may, while they have spins left. F20 R12's "the honest limit is
  once a day or once ever per player, and it is still an open decision" is
  this file.

## 14. Open questions

- None. The three decisions that needed an answer — what a day is, what the
  default is, and what the player sees — were taken before this was written
  and are R6, R1 and R14.
