# F20 — One spin per identification

| | |
|---|---|
| **ID** | F20 |
| **Status** | Agreed |
| **Interface** | Both |
| **Depends on** | [F08](./F08-player-identification.md), [F10](./F10-hand-over-to-the-next-player.md), [F13](./F13-reward-configuration.md), [F16](./F16-a-code-on-every-win.md) |
| **Agreed on** | 2026-11-17 |
| **Amends** | [F08](./F08-player-identification.md) R18, [F10](./F10-hand-over-to-the-next-player.md) R5, R7 |

## 1. Summary

An identification buys one spin. The server knows it has been used, so
reloading the page shows the result that was won rather than a working Spin
button.

## 2. Why

The report:

> when I finished a spin, a reward is given, then I refresh the playing page
> and I can still play again without filling the form

This is not a defect against the specification — it is the specification.
[F10](./F10-hand-over-to-the-next-player.md) R7 says so in as many words:

> This is a hand-over, not a limit. The page offers one spin per
> identification; `POST /api/spin` still accepts repeat spins from one
> session.

One spin per identification was page state, and a reload throws page state
away. Reproduced against the running server in three requests: one
identification, three spins, three prizes.

What makes it worth fixing now rather than leaving to the eligibility feature
is [F16](./F16-a-code-on-every-win.md). Every win is issued a reward code, so
a reload is not merely a replayed spin — it is a voucher printer. Three
reloads, three codes, each of them real, each of them claimable at the
counter.

The same reload breaks a promise in the other direction, which is the half
nobody reported.
[F10](./F10-hand-over-to-the-next-player.md) R5 says the result stays on
screen until **Next player** is pressed; today a reload loses it, and takes
the reward code with it. A player who reloads before writing their code down
has to ask staff to look it up. Both halves are the same missing fact: the
server does not know that this identification has played.

## 3. Actors

| Actor | Role |
|---|---|
| **Player** | Gets one spin for giving their number, and does not lose their code by reloading |
| **Next player** | Picks up the stall's phone and cannot spin as the person before them |
| **Shop** | Gives away one prize per identification rather than one per tap of the reload button |

## 4. User stories

- As a **shop**, I want **one prize per identification**, so that **a reload
  cannot print vouchers**.
- As a **player**, I want **my code to still be there after a reload**, so
  that **I do not have to ask somebody to find it for me**.
- As the **next player**, I want **the phone step**, so that **I am not
  spinning as the person in front of me**.

## 5. Scope

### In scope

- The server recording that an identification has spun, and refusing a
  second.
- `GET /api/player/me` reporting the result that identification won.
- The page showing that result after a reload, with no spin control.
- **Next player** clearing both the identity and the spent spin.

### Out of scope

- **A limit on a person.** Somebody who has spun may type their number again
  and spin again. That is the eligibility feature — once a day, once ever,
  once per receipt — and it is a different decision, listed in
  [`ROADMAP.md`](./ROADMAP.md) and deliberately not pre-empted here. This
  feature closes the reload, not the person. See section 13.
- **Prize stock.** A prize can still be given away more often than the shop
  has it.
- **Changing what a spin costs or wins.** The draw, the animation and the
  result panel are untouched.
- **Remembering a result past the session.** Closing the tab ends it, as it
  ends the identification (F08 section 13).
- **Anything on the admin side.** The spin log already records every spin;
  nothing here changes what it shows.

## 6. Rules

### The spin is spent

| # | Rule |
|---|---|
| R1 | An identification buys one spin. Once it has drawn one, the server will not draw another for it. |
| R2 | A second `POST /api/spin` from the same identification is refused with `409 Conflict`. Nothing is drawn, nothing is recorded, and no code is issued. |
| R3 | Only a recorded spin spends it. A spin that failed leaves the identification able to try again, which is [F10](./F10-hand-over-to-the-next-player.md) R10 unchanged: a player who did not get a spin is not handed over. |
| R4 | Spinning does **not** forget the player. The server still knows who it is talking to; it also knows they have played. This is what lets the result survive a reload. |

### What a reload shows

| # | Rule |
|---|---|
| R5 | `GET /api/player/me` reports the identified player and, when that identification has spun, what it won: the prize name, the reward (type, value and code) and when it was spun. |
| R6 | So a reload shows the same result panel it showed before, with no spin control on the page at all ([F10](./F10-hand-over-to-the-next-player.md) R8) and **Next player** beneath it. |
| R7 | The result reported is the spin's own snapshot ([F02](./F02-player-spin.md) R10), not a join to the slice, so it still reads correctly after that slice has been renamed or deleted. |
| R8 | The reward code is part of it ([F16](./F16-a-code-on-every-win.md) R1). It is the only copy the player has in front of them. |
| R9 | An identification that has not spun is reported exactly as it is today, with nothing extra. |

### Handing over

| # | Rule |
|---|---|
| R10 | **Next player** clears the identity and the spent spin together, so the next person starts at the phone step with a fresh spin ([F10](./F10-hand-over-to-the-next-player.md) R3, R4). |
| R11 | A number that has just played may come straight back and play again by typing itself in ([F10](./F10-hand-over-to-the-next-player.md) R6). Identifying is therefore a fresh start: it releases whatever spin is held against the session, exactly as handing over does. An identification buys a spin, so making one has to give one. |
| R12 | That is unchanged behaviour for a *person*, and is why this is not an eligibility rule: a reload costs nothing and is now stopped, while playing again still costs typing a number in. |

### Where it is held

| # | Rule |
|---|---|
| R13 | The spent spin lives in the server session beside the identity, never in the page. A page that could edit it could mint prizes, which is the whole reason F08 put the identity there (F08 R12). |
| R14 | A session naming a spin that no longer exists is read as not having spun, and the stale reference is cleared — as a session naming a deleted player is read as nobody (F08 R15). |
| R15 | Until the server has answered, the page shows neither the phone form nor the wheel. "Not asked yet" is not the answer "nobody": the page holds both in one null, and drawing the form while the question is open asks a returning player for a number they have already given — and, since R6, puts a form in front of somebody reloading to re-read their code. |

## 7. Data model

No schema change. Nothing new is stored: `spin` already records every play,
and what this feature adds is one id in the server session.

| Store | Key | Holds |
|---|---|---|
| Session | `app_player_id` | The identified player (F08, unchanged) |
| Session | `app_player_spin` | The spin that identification made, or absent |

## 8. API surface

No new endpoints.

| Endpoint | Change |
|---|---|
| `GET /api/player/me` | Gains `spin`: `{prizeName, reward: {type, value, code}, spunAt}`, or `null` (R5, R9) |
| `POST /api/spin` | Refuses a second spin from one identification with `409` (R2). Its successful response is unchanged |
| `POST /api/player/forget` | Also clears the spent spin (R10). Its response is unchanged |

The `reward` object is the same shape the spin response already sends, built
in one place so the two cannot drift.

## 9. Interface

### Player view

Nothing new is drawn. After a reload the page renders the result panel it
already has — prize name, what it is worth, the code and how to claim it —
and the **Next player** button, because that is what it does whenever a
result is on screen.

What a player would notice: reloading no longer loses their code, and no
longer offers them another spin.

### Admin view

Unchanged.

### Responsive behaviour

Unchanged. The result panel is the one that already fits at 375px.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| A second spin from one identification | `409`, nothing drawn or recorded (R2) |
| A spin with nobody identified | `403`, as today (F08 R16) |
| A spin that fails while drawing | The identification is not spent (R3) |
| The server has not answered yet | Neither screen; the card, the branding and a loading line (R15) |
| A reload with no result yet | The wheel and the Spin button, as today (R9) |
| A reload after a spin | The result panel and **Next player** (R6) |
| The session names a deleted spin | Read as not having spun (R14) |
| The page is open with a stale Spin button and receives a `409` | It re-asks `/api/player/me` and shows the result it already has |

## 11. Acceptance criteria

- [x] Given an identified player who has spun, when `POST /api/spin` is sent
      again, then it is refused with `409` and no second spin is recorded.
- [x] Given the same, then no second reward code exists.
- [x] Given the same, when `GET /api/player/me` is asked, then it reports the
      player and the prize, reward and code they won.
- [x] Given an identified player who has not spun, then `/api/player/me`
      reports `spin` as null.
- [x] Given a player who has spun, when the page is reloaded, then the result
      panel is shown with the reward code, and there is no spin control in
      the document.
- [x] Given that reloaded page, when **Next player** is pressed, then the
      phone step is shown and a new identification may spin.
- [x] Given a spin whose slice has since been deleted, when the page is
      reloaded, then the result still names what was won.
- [x] Given a losing spin, when the page is reloaded, then the losing panel
      is shown (F17) rather than a prize.
- [x] Given a reload while the server has not yet answered, then the phone
      form is not shown, and nor is the wheel.
- [x] Given that page once the server answers, then the result appears
      without a phone form having been drawn in front of it.

## 12. Verification

`php vendor/bin/phpunit` — 532 tests.

- `PlayerControllerTest` covers R1, R2 and R11: a second spin from one
  identification is a `409`, no second row is written, no second code is
  minted, and the same player spins again once they identify again.
- `IdentityControllerTest` covers R5–R14: what a reload reads before and
  after the spin, that the reward reported is byte-for-byte what the spin
  returned, that a prize whose slice has been deleted is still named (R7),
  that handing over releases the spin (R10), and that a session naming a
  deleted spin is read as not having spun (R14).
- Thirteen existing tests failed on this change, every one of them a fixture
  that spun several times in a single session. They were not loosened: each
  now identifies before each spin through a shared `spinOnceMore()` helper,
  so "seven spins" in a fixture cannot be read as seven taps of a reload
  button.

`npm test` — 550 tests. `PlayerPage.test.tsx` covers R6 and R15 by doing what a
reload does — mounting the page again and letting it ask the server: the
prize and the code come back, the wheel is at rest, the animation is not
replayed, there is no spin control in the document, the losing panel appears
for a losing spin (F17), **Next player** still hands over, and a stale tab
that is answered `409` recovers by showing the result it already won. R15 is
covered by holding `/api/player/me` unresolved and asserting that neither the
form nor the wheel is in the document while the question is open.

The end-to-end specs were read and left alone: each identifies and spins once
per browser context, and the one that aborts `/api/spin` and expects the
button still live is now a test of R3 as well. **Not run** — that is the
user's, per the repository's `CLAUDE.md`.

**Checked by hand**, twice over.

Against the running server: one identification, one spin, then a reload
reporting the same prize and code, the second spin refused `409`, a second
identification spinning again, and handing over leaving `{player: null,
spin: null}`.

**And in a browser at 375px**, which is where the bug was reported and the
only place the fix can be believed. Identified as `+33614856240` — which is
[F19](./F19-one-person-one-number.md) working too, since the row holds
`0614856240` — spun, won a free gift with a code, then reloaded: the same
prize, the same code, no spin control anywhere in the document, and **Next
player** beneath it. The whole result fits the viewport without scrolling,
as the repository's `CLAUDE.md` requires. Pressing **Next player** returned
the phone step, and reloading again stayed there rather than resurrecting
the result.

## 13. Decisions and risks

- **The identification is spent, not forgotten.** The smaller change would
  have been to forget the player the moment they spin: ten lines, and a
  reload lands on the phone step. It was rejected because the reward code
  goes with it — a player who reloads before writing it down has lost the
  only copy they can see, and the one thing worse than offering a second spin
  is taking away the prize from the first. Keeping the identity and marking
  it spent costs one more session key and makes
  [F10](./F10-hand-over-to-the-next-player.md) R5 true across a reload, which
  it never was.
- **Why `409` rather than `403`.** A `403` is what the page gets when the
  server will not say who it is talking to, and it makes the page return to
  the phone step (F08 R16). That is exactly the wrong response here: the
  server knows who this is, and the page should show them their prize. A
  distinct status lets the page re-ask and recover rather than throwing the
  identity away.
- **This is not the eligibility feature, and must not be mistaken for it.**
  Anybody who has spun can type their number in again and spin again. That
  is [F10](./F10-hand-over-to-the-next-player.md) R6 working as designed: at
  a stall, two friends sharing one phone both get to play. What it means is
  that this feature stops a *reload*, which costs nothing, and not a
  *person*, which costs typing a number. The honest limit is once a day or
  once ever per player, it needs a screen for the person who has already
  played, and it is still an open decision.
- **Risk: a session key is not a transaction.** The spin is recorded and
  then the session is marked, so a process that dies between the two leaves a
  recorded spin whose identification is not spent — one extra spin available.
  The alternative, marking before recording, loses a player their spin when
  the draw fails, which is worse (R3). The database remains the record of
  what was given away; the session is only what the page is allowed to do
  next.
- **Risk: two tabs.** Two tabs on one stall phone share one session, so the
  second tab's Spin button is stale and its press returns `409`. It recovers
  by showing the result, which is correct but will look abrupt to anybody who
  had two tabs open. Judged acceptable for a device at a counter.
- **What this gives up.** Nothing was removed. [F08](./F08-player-identification.md)
  R18 and [F10](./F10-hand-over-to-the-next-player.md) R7 are amended rather
  than deleted, because both are still true of a *person*: identification is
  not a limit on how often somebody may play. It is now a limit on how often
  one identification may.

## 14. Open questions

- None. The per-person limit is a separate feature, not an open question here.
