# F28 — The gift sheet

| | |
|---|---|
| **ID** | F28 |
| **Status** | Agreed |
| **Interface** | Both |
| **Depends on** | [P05](./P05-one-app-a-folder-per-game.md), [F27](./F27-the-store-and-its-games.md), [F08](./F08-player-identification.md), [F10](./F10-hand-over-to-the-next-player.md), [F12](./F12-multiple-languages.md), [F13](./F13-reward-configuration.md), [F16](./F16-a-code-on-every-win.md), [F19](./F19-one-person-one-number.md), [F22](./F22-a-celebration-on-the-result.md), [F23](./F23-a-daily-spin-limit.md), [F26](./F26-a-slice-takes-its-rewards-name.md) |
| **Agreed on** | 2026-11-19 |
| **Amends** | [F23](./F23-a-daily-spin-limit.md) R10 (status for a sheet), [F16](./F16-a-code-on-every-win.md) R1 (a visit may mint several codes) |

## 1. Summary

A second kind of game: the player identifies themselves exactly as they do
for the wheel, and gets **every** reward on the game's list, each with its
own code.

## 2. Why

Not every promotion is a draw. "Fill this in and here is your welcome pack"
is the oldest offer in retail, and it is a different product from the wheel:
nothing is won, so nothing is withheld, and the shop's question is not *what
are the odds* but *what goes in the pack*.

Today that cannot be configured at all. The nearest thing is a wheel whose
every slice is the same prize, which lies to the player — it spins, so it
promises chance — and gives them one item instead of the list.

It is also the cheapest possible second game, which is the point of building
it now. [F27](./F27-the-store-and-its-games.md) has just drawn the line
between the store and a game; a game type with no odds, no geometry and no
animation is the sharpest test of whether that line is in the right place. If
a gift sheet needs anything moved, better to find out on a feature this small.

## 3. Actors

| Actor | Role |
|---|---|
| **Admin** | Puts rewards on a sheet, in order, with no percentages to balance |
| **Player** | Identifies themselves and receives every reward on it |
| **Counter staff** | Reads the codes off the player's phone and claims them one at a time |

## 4. User stories

- As an **admin**, I want **a game that gives everybody the same set of
  rewards**, so that **a welcome pack is a configuration rather than a rigged
  wheel**.
- As an **admin**, I want **no percentages on it**, so that **adding a gift is
  one click instead of rebalancing the others**.
- As a **player**, I want **all my gifts on one screen with their codes**, so
  that **I can show them at the counter**.
- As **counter staff**, I want **each gift claimed separately**, so that
  **somebody can take their coffee today and their discount next week**.

## 5. Scope

### In scope

- A game of type `gift-sheet`: an ordered list of rewards from the store's
  catalogue, each at most once, no probabilities.
- The player screen: identification as today, one action, then the sheet.
- One spin-log row per reward given, each with its own code
  ([F16](./F16-a-code-on-every-win.md)) and its own claim control
  ([F13](./F13-reward-configuration.md) R21–R24).
- The game's limit ([F27](./F27-the-store-and-its-games.md) R29) counting
  **sheets**, not rows.
- Its own folder, backend and frontend
  ([P05](./P05-one-app-a-folder-per-game.md) R2, R3).
- The admin editor for it, in the Games module's game editor
  ([F27](./F27-the-store-and-its-games.md) R40).

### Out of scope

- **Letting the player choose** which gift they want. A different game again,
  and the sheet has to exist before choosing from one makes sense.
- **Odds of any kind**, including "usually these three, sometimes a fourth".
  A sheet with a maybe on it is a wheel.
- **Stock.** A sheet hands out every reward on it to everybody who plays, so
  a limited gift needs a count that does not exist yet — it is on
  [`ROADMAP.md`](./ROADMAP.md) as prize stock and it is the next thing this
  game will want.
- **An animation.** There is nothing to reveal: the player already knows they
  are getting everything.
- **Sending the codes anywhere.** No SMS, no email, no PDF. The screen is the
  delivery, as it is for the wheel.
- **Expiry dates on the codes.** Already a gap for the wheel's codes
  ([`ROADMAP.md`](./ROADMAP.md)), and this feature makes more of them rather
  than changing their rules.

## 6. Rules

### The game

| # | Rule |
|---|---|
| R1 | A game of type `gift-sheet` holds an **ordered list of rewards** from the store's catalogue ([F27](./F27-the-store-and-its-games.md) R7). No probability, no colour, no geometry. |
| R2 | A reward appears on a sheet **at most once**. Twice means nothing: the second copy is not better odds, it is a second identical voucher nobody asked for. This is the opposite of the wheel, where two slices on one reward is how a wheel gives better odds ([F26](./F26-a-slice-takes-its-rewards-name.md) R4). |
| R3 | A sheet holds **1 to 6** rewards. The lower bound because a game that gives nothing is a mistake rather than a setting; the upper because the whole sheet with its codes has to fit a 375px screen without scrolling, and six is what fits. |
| R4 | A gift takes its **reward's name**, exactly as a slice does ([F26](./F26-a-slice-takes-its-rewards-name.md) R1). There is no second label to type and none to keep in step. |
| R5 | The reward that means nothing was won ([F14](./F14-the-losing-slice-in-the-prize-list.md)) may not be put on a sheet. A sheet gives everything on it, so "you have not won" on it is a contradiction, and the refusal says so. |
| R6 | The order is the admin's and is the order the player sees. Nothing is sorted by value, type or name behind their back. |
| R7 | A gift-sheet game with an empty list may not go live ([F27](./F27-the-store-and-its-games.md) R43). |

### Playing it

| # | Rule |
|---|---|
| R8 | The player identifies themselves exactly as on the wheel — the same form, the same fields, the same validation, the same returning-player lookup ([F08](./F08-player-identification.md), [F19](./F19-one-person-one-number.md)). One person is one row across both games ([F27](./F27-the-store-and-its-games.md) R8). |
| R9 | After identifying, the player presses **one control** to receive the sheet. The codes are minted at that moment, by that request, and never as a side effect of loading a page. |
| R10 | The server issues the **whole list**, in order, in one transaction: every reward, each with its own code ([F16](./F16-a-code-on-every-win.md)). There is no draw, no randomness and nothing to decide — which is still the server deciding, as the repository's `CLAUDE.md` requires. |
| R11 | A failure part-way through gives out **nothing**. Three gifts and two codes is a row at the counter. |
| R12 | Each gift is its own row in the spin log, all sharing one sheet identity (R19), the same player, the same game and the same instant. |
| R13 | The player sees the sheet: every gift by name, with its code, and a line telling them to show it at the counter. It says nothing about rewards that are not on the list, because there are none. |
| R14 | **Next player** ([F10](./F10-hand-over-to-the-next-player.md) R3) is on that screen, so a stall phone can be handed on. |
| R15 | [F22](./F22-a-celebration-on-the-result.md)'s celebration fires **once** for the sheet, not once per gift. Six bursts of confetti is not six times the celebration. |
| R16 | Everything on the screen that the application itself writes is translated in all four languages ([F12](./F12-multiple-languages.md) R9). The gift names are not, like every other thing an admin typed ([F12](./F12-multiple-languages.md) R10). |

### How often

| # | Rule |
|---|---|
| R17 | The game's limit ([F27](./F27-the-store-and-its-games.md) R29) counts **sheets issued to this person today**, not rows. A limit of 1 on a sheet of three gifts means one sheet, not one gift — counting rows would refuse the second gift of the first sheet. |
| R18 | A player whose allowance is spent sees [F23](./F23-a-daily-spin-limit.md)'s screen: they have played today and are welcome back tomorrow, **with no codes on it**. This is [F23](./F23-a-daily-spin-limit.md) R15 and it costs something real here — a player who closed the page has lost their codes until tomorrow — but anybody may type anybody's number into a stall phone, and a screen that reprints a stranger's vouchers is worse. Section 12 holds the alternative. |
| R19 | Every sheet has a **sheet identity**: one opaque value shared by its rows, so "how many sheets today" is a count and "the same sheet again" is a lookup rather than a guess from timestamps. |
| R20 | `POST` to issue a sheet with no allowance left is refused `429`, as [F23](./F23-a-daily-spin-limit.md) R10 refuses a spin. Nothing is minted and nothing recorded. |

### The admin

| # | Rule |
|---|---|
| R21 | A gift-sheet game's editor is a **list of rewards**: a dropdown per row from the store's catalogue, reorder, add and remove. No probability column, no total, no colour. |
| R22 | It reuses the reward dropdown the wheel's prize rows already have ([F26](./F26-a-slice-takes-its-rewards-name.md)), so the two editors offer the same catalogue in the same way. |
| R23 | The editor shows what the player will see: the list in order, by reward name. A preview, not a second thing to configure. |
| R24 | A reward already on the sheet is not offered again by the dropdowns (R2), rather than offered and then refused on save. |
| R25 | The Spins module shows a sheet's rows as what they are: the same player, the same game, the same instant, one row per gift, each claimable on its own. No grouping, no parent row, and the Game column ([F27](./F27-the-store-and-its-games.md) R44) says which game they came from. |
| R26 | A reward may be on a sheet **and** on a wheel at the same time. One catalogue, several games ([F27](./F27-the-store-and-its-games.md) R7), and nothing about being given away freely in one game changes what it is worth in another. |

## 7. Data model

| Entity | Field | Type | Notes |
|---|---|---|---|
| `gift` | `id` | int | A reward on a sheet |
| | `game_id` | int | Not null |
| | `reward_id` | int | Not null |
| | `position` | smallint | 0-based, the admin's order (R6) |
| | — | unique | `(game_id, reward_id)` — R2 held by the database, not only by a form |
| | — | unique | `(game_id, position)` |
| `spin` | `sheet_id` | varchar(12) null | The sheet identity (R19). Null for every wheel spin |
| | `prize_id` | int null | Already nullable. Null for a gift: there is no slice |
| | `prize_probability` | smallint **null** | Becomes nullable. Null means *not drawn*, which is what a gift is |

A gift row given to a player is a `spin` row like any other: it keeps the
reward's name, type and value at the moment it was given
([F13](./F13-reward-configuration.md)), its own `reward_code`
([F16](./F16-a-code-on-every-win.md)) and its own `claimed_at`.

[P02](./P02-database-upgrades.md) steps: create `gift`; widen
`spin.prize_probability` to nullable; add `spin.sheet_id`. Ordered,
idempotent, appended after
[F27](./F27-the-store-and-its-games.md)'s — never inserted among them.

## 8. API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/sheet` | public | What this game gives: the gifts by name, in order. No codes |
| `POST` | `/api/sheet` | public | Issue the sheet to the identified player. Returns each gift with its code |
| `GET` | `/api/admin/games/{id}/sheet` | session | The admin's list |
| `PUT` | `/api/admin/games/{id}/sheet` | session | Replace it |

Both player routes take the game from the session
([F27](./F27-the-store-and-its-games.md) R27) and refuse `409` when the
session's game is not a gift sheet — a client calling the wrong game's
endpoint is a bug, not a player's mistake.

**Corrected while building.** Two things here are not as written.

`GET /api/game` was added, and it is not in the table above. With one kind of
game the player page could load the wheel and be done; with two, something has
to ask which game it is *before* it can draw anything, and `/` has no key to
ask with. It answers exactly what `GET /api/play/{key}` answers — the type and
the store's branding — so the page has one question and two ways of asking it,
and [F27](./F27-the-store-and-its-games.md) R26's rule about `/` lives in one
place.

`sheetsLeft` was not added. `GET /api/player/me` still reports only
`spinsLeft`, because nothing needs the other: the sheet page learns it has
been refused from the `429` itself (R20), and a count of sheets left would be
a second way to say the same thing — one that R18 then has to be careful not
to let say too much.

### `POST /api/sheet` response

```json
{
  "sheetId": "7Kq2mXLp9vTd",
  "gifts": [
    { "name": "10% off",     "type": "percent", "value": 10,   "code": "ABCD1234" },
    { "name": "Free coffee", "type": "item",    "value": null, "code": "EFGH5678" }
  ]
}
```

## 9. Interface

### Player view

Three states, and the first two are the wheel's own:

1. **Identify** — [F08](./F08-player-identification.md)'s form, unchanged.
2. **Ready** — the store's logo and company name, the game's tagline, the
   gifts listed by name, and one button: *Get my gifts*. No codes yet.
3. **The sheet** — a heading, then one row per gift: its name and its code,
   the code set in the same monospaced treatment the wheel's result uses
   ([F16](./F16-a-code-on-every-win.md)). A line saying to show this at the
   counter. **Next player** beneath.

And the refusal, which is [F23](./F23-a-daily-spin-limit.md)'s screen
unchanged: played today, welcome back tomorrow, no codes, **Next player**
(R18).

### Admin view

Inside the Games module's editor for a gift-sheet game: the game's own
fields, then **Gifts** — up to six rows, each a reward dropdown with
reorder and remove controls, and **Add a gift** while fewer than six are
listed. Beneath, the preview of what the player will see.

Nothing about percentages appears anywhere on it, including no total.

### Responsive behaviour

At 375px the sheet shows all six gifts and their codes without scrolling:
name and code on one line each, the code aligned right, no card chrome. That
is what R3's upper bound is for, and it is an acceptance criterion rather
than an intention.

At 768px and above the list is centred at the wheel's column width, so the
two games' result screens look like the same product.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| A sheet saved with the same reward twice | `422`, a violation naming the reward (R2) |
| A sheet saved with seven gifts | `422`, naming the limit of six |
| A sheet saved with none | Allowed as a draft; refused on going live (R7) |
| The losing reward put on a sheet | `422`, naming R5 |
| `POST /api/sheet` before identifying | `401`, as the wheel's spin is |
| `POST /api/sheet` with the allowance spent | `429`, nothing minted (R20) |
| `POST /api/sheet` on a wheel game's session | `409` |
| `GET /api/wheel` on a gift game's session | `409` |
| A code collision while minting | Retried, as [F16](./F16-a-code-on-every-win.md) does; if the whole sheet cannot be minted, nothing is (R11) |
| A reward deleted while on a live sheet | [F13](./F13-reward-configuration.md)'s rule stands, and the already-given rows keep the name they were given under |
| The sheet issued twice by a double tap | One sheet. The second request is the `429` of R20, or the same sheet if no limit is set and the request is the same submission |

## 11. Acceptance criteria

- [x] Given a gift-sheet game with three rewards, when a player identifies and presses the control, then three rows appear, in the admin's order, each with a distinct code.
- [x] Given that sheet was issued, then the spin log holds three rows, same player, same game, same instant, sharing one sheet identity, each with its own code and its own claim control.
- [ ] Given one of those rows is claimed, then the other two are still unclaimed.
- [x] Given a sheet of three and a game limit of 1, when the player presses the control again, then the answer is `429` and the screen says to come back tomorrow, with no codes on it.
- [ ] Given a game limit of 1, when the same person opens the wheel's link, then they may still spin.
- [ ] Given a game with no limit, when a player is issued two sheets, then the codes of the second differ from the first.
- [ ] Given a sheet is issued and the code minting fails on the last gift, then no row, no code and no sheet exists afterwards.
- [x] Given a reward already on the sheet, when another row's dropdown is opened, then that reward is not offered.
- [ ] Given a sheet with six rewards, then **Add a gift** is gone.
- [x] Given the losing reward is chosen for a sheet, then the save is refused and names it.
- [x] Given a gift-sheet game with an empty list, when it is turned live, then the refusal is `409` and names the empty list.
- [x] Given a gift-sheet game, then nothing in its editor or on its player page states or implies a probability.
- [x] Given a sheet is issued, then the celebration fires once.
- [x] Given the same reward is on a sheet and on a live wheel, then both games work and the reward's own row is unchanged.
- [x] Given `spin.prize_probability` is null on a gift row, then the Spins module renders the row without an empty-looking odds cell.
- [x] The player page is in all four languages, including the sheet, the line about the counter, and the refusal.
- [ ] The four fast suites pass.
- [ ] Checked by hand at 375px: a six-gift sheet is fully visible with no scrolling, and so is the *Get my gifts* button on the ready screen.
- [ ] Checked by hand: the codes on a sheet can be read out loud from a phone at arm's length.

**What is not ticked, and why.** Three of these want a failure nobody can
stage from outside — a code collision on the last gift of a sheet (R11) — or
a second sheet from an unlimited game, or a claim on one row of three. The
first needs a seam the code does not have and should not grow for a test;
the other two are worth having and are not written. The two at the end are
yours: a real phone, and reading a code out loud.

**One deviation, deliberately.** The criterion above says **Add a gift** is
*gone* at six. It is disabled and accompanied by a sentence saying why
(R3's reason — six is what fits a phone), because a control that vanishes
leaves an admin wondering whether they imagined it.

## 12. Open questions

- **Should a player be able to see their codes again?** R18 says no, on
  [F23](./F23-a-daily-spin-limit.md) R15's privacy reasoning, and it is the
  weakest rule in this file: a player who closes the page has lost six
  vouchers. The honest fix is not to relax R18 but to give the codes
  somewhere to live — the QR code on
  [`ROADMAP.md`](./ROADMAP.md), or verifying the phone number
  ([F08](./F08-player-identification.md) section 13) and sending them. Worth
  deciding before a real campaign, not before this ships.
- **Is six the right cap?** It comes from what fits a phone, not from what a
  shop wants to give away. If a welcome pack wants ten, the screen scrolls
  and the repository's phone-first rule needs a decision rather than a
  bigger number.
- **Should a sheet be able to repeat a reward** when the shop means "two
  coffees"? R2 says no. A quantity on a gift would say it properly, and is a
  column rather than a rule change.
- **Prize stock.** The first promotion that gives away a physical item on a
  sheet will run out of it, and nothing here counts. It is the next feature
  this one wants.
