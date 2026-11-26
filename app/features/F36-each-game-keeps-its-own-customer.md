# F36 — Each game keeps its own customer

| | |
|---|---|
| **ID** | F36 |
| **Interface** | Player |
| **Depends on** | [F08](./F08-player-identification.md), [F10](./F10-hand-over-to-the-next-player.md), [F20](./F20-one-spin-per-identification.md), [F23](./F23-a-daily-spin-limit.md), [F27](./F27-the-store-and-its-games.md) |
| **Amends** | [F27](./F27-the-store-and-its-games.md) R27 (the binding is per game, not one at a time) |
| **Status** | Agreed |
| **Agreed on** | 2026-11-26 |

## 1. Summary

A browser can be identified for more than one of the shop's games at once:
opening the gift sheet's link no longer ends the identification the customer
made at the wheel.

## 2. Why

This is [F27](./F27-the-store-and-its-games.md) R28 implemented as it was
always written. The rule says:

> Opening a second game's link identifies the player again **for that game**.
> They are the same person with the same history; what they are not is
> already identified somewhere they have not been.

Being identified for the wheel is not being identified for the sheet, and the
rule asks for exactly that. What it does not ask for is the wheel's
identification being **destroyed** — but the session held one player, so the
implementation had to choose, and it chose to throw the first one away.

The cost was invisible until F34. A customer who registers at the wheel is
shown a card, once, and told to photograph it. If anything binds another
game before they press Spin — a staff member opening the other link, a
second tab, the admin's game list — the next press of Spin is refused, the
page honestly concludes the identity is gone, and sends them back to the
form. They lose their place, and the card screen is not coming back
([F34](./F34-the-customers-own-card.md) R8: there is no request that fetches
a card again).

Two live games is not an unusual shop. It is the shop this was reported from.

## 3. Actors

| Actor | Role |
|---|---|
| **Customer** | Plays one game, or both. Identifies once per game, and stays identified in each. |
| **Staff** | Hands the phone on with *Next player*, which is the explicit way to end an identification and stays the only one. |

## 4. User stories

- As a **customer**, I want the game I am playing to still know me after I
  have looked at the shop's other game, so that I do not have to type my
  number again to finish what I started.
- As a **staff member**, I want *Next player* to mean what it says, so that
  handing the phone over is still the thing that clears it.

## 5. Scope

### In scope

- Identification held per game rather than one at a time.
- The spin an identification has already made ([F20](./F20-one-spin-per-identification.md)) held per game with it.
- *Next player* ending the identification for the game on screen.
- Binding the session to the game on `/` as well as on a link, so that every
  game a player can reach is a game the session can name.

### Out of scope

- **Remembering anybody between visits.** The identification still lives in
  the session and still dies with the browser's cookie. This feature changes
  how many games one session can hold, not how long it holds them.
- **Sharing an identification between games.** Identifying at the wheel still
  does not identify you at the sheet. That is R28, and it stays.
- **Any change to who may play, how often, or what they win.** The daily
  limit ([F23](./F23-a-daily-spin-limit.md)) already counts per game.

## 6. Rules

| # | Rule |
|---|---|
| R1 | An identification belongs to the game it was made for. Binding another game does not end it. |
| R2 | Coming back to a game this browser is already identified for finds that customer still identified, with whatever they have already played in it. |
| R3 | The spin an identification has spent ([F20](./F20-one-spin-per-identification.md) R1) is held per game. A spin in one game never spends another's. |
| R4 | *Next player* ([F10](./F10-hand-over-to-the-next-player.md) R3) ends the identification for the game on screen, and only that one. |
| R5 | A game this browser has never identified for has nobody identified, whatever other games hold. |
| R6 | Identifying is still a fresh start for that game ([F20](./F20-one-spin-per-identification.md) R11): it releases the spin held against it, and nothing held against any other. |
| R7 | Resolving a game for a player binds the session to it — including `/` with one live game, which did not bind before. Without that, a shop whose players arrive at `/` would have identifications belonging to no game. |
| R8 | Nothing the page sends names a game ([F27](./F27-the-store-and-its-games.md) R27). The session still decides, and now it can name more than one. |
| R9 | A session made before this feature keeps the identification it had, for the game it was bound to. Nobody is logged out by the deploy. |
| R10 | A player who has been deleted, and a game that has been turned off, behave exactly as they did ([F08](./F08-player-identification.md) R15, [F27](./F27-the-store-and-its-games.md) R24). |

## 7. Data model

Nothing in the database. The session's shape changes:

| Key | Was | Is |
|---|---|---|
| `app_player_id` | the one identified player | gone, read once for R9 |
| `app_player_spin` | the one spent spin | gone, read once for R9 |
| `app_player_ids` | — | game id → player id |
| `app_player_spins` | — | game id → spin id |
| `app_player_game` | the game this session is playing | unchanged |

## 8. API surface

No new endpoints and no changed shapes. `GET /api/game` gains the binding R7
asks for, which is a side effect rather than a difference a caller can see.

## 9. Interface

Nothing on screen changes. What changes is what is still on screen after a
detour: the wheel's page, holding the customer it was holding.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| No game bound and none resolvable | Nobody is identified, as now. |
| The session names a game that was turned off | No game, so nobody identified for it — the page asks for a link (F27 R24). |
| A stored id for a player who no longer exists | That game's entry is dropped and nobody is identified for it (F08 R15). |
| A session written before this feature | Its single identification is read as belonging to the bound game (R9). |

## 11. Acceptance criteria

- [ ] Given a customer identified at the wheel, when the sheet's link is
      opened, then the wheel still knows them (R1, R2).
- [ ] Given that customer returns to the wheel, then they can spin (R2).
- [ ] Given a customer identified for both games, then each game reports its
      own (R1).
- [ ] Given a spin spent at the wheel, then the sheet does not think it has
      been spent (R3).
- [ ] Given *Next player* at the wheel, then the sheet's identification
      survives (R4).
- [ ] Given a game never identified for, then nobody is identified (R5).
- [ ] Given a customer identifies again, then that game's spin is released
      and no other game's is (R6).
- [ ] Given one live game and a player who arrives at `/`, then the session
      names that game (R7).
- [ ] Given a session holding the old single identification, then it is read
      as the bound game's (R9).
- [ ] Given a player deleted from under a session, then that game reports
      nobody (R10).
- [ ] The four fast suites pass.

## 12. Verification

`php vendor/bin/phpunit` — 773 tests, 11 of them new, all in
`EachGameKeepsItsOwnCustomerTest`. Every one goes through the endpoints
rather than through `PlayerSession` directly: what broke was not a method but
what a sequence of requests did to a session, and a unit test of the class
would have agreed with itself while the stall phone threw customers out.

The first two are the bug as reported — register at the wheel, open the
sheet, come back, press Spin — and they carry R1 and R2. R5 is the half of
F27 R28 that must not regress while fixing the other half, and it has its own
test: the sheet does not know the wheel's customer. R3 and R6 are the spin
held per game, R4 is *Next player* at one game leaving the other alone, R7 is
`/` binding the only live game, R9 is a session written in the old shape
being read for the game it was bound to and for no other, and R10 is a game
turned off.

**The tests were checked against the bug.** With `bindGame` restored to
clearing the identifications, five of the eleven fail, including the Spin
one. A test for a fix that passes before the fix is a test of nothing.

`npm test` — 951 tests. `PlayerPage.test.tsx` carries both corrections in
§13: the card screen's button is asserted to have the game's button paint and
not only its shape, and a 409 recovery whose identity request fails is
asserted to leave the player where they were.

`npm run typecheck` and `npm run lint` are clean.

**Run against the real thing.** The reported sequence was replayed against
the development server with `curl` holding one cookie jar: register at the
wheel, open the sheet's link, ask who the sheet is talking to (nobody), go
back to the wheel (still Probe), press Spin — 200, with a prize and a code.
Before the fix the same sequence answered 403 and the page sent the customer
back to the form.

**Seen in a browser.** A customer registered at 375px through the real form:
the card screen now offers a filled button in the theme's colours where it
offered a line of text, and pressing it lands on the wheel.

## 13. Decisions and risks

**Why not simply stop binding.** The obvious smaller change is for
`bindGame` to leave the player alone. That would be wrong in the other
direction: the stall phone would carry one identification across every game,
and a customer who walked away from the wheel would still be identified at
the sheet. R28 exists to stop exactly that. Per-game is the shape that keeps
both halves of the rule.

**The risk this takes on.** A staff member who opens the other game's link
for a *new* customer now inherits the previous one at the first game. That
was already true within a game — it is what *Next player* is for (F10) — and
this feature does not widen it: each game still holds one identification at a
time. What changes is that the inheritance is no longer silently cleaned up
by a visit to a different game, which was never a thing anybody could rely
on.

**Two things found while reproducing this**, both fixed here rather than
left for a tidier commit:

1. **The card screen's button was invisible** (F34 R10). It carried
   `buttonClass`, which is the shape of the game's button, and not
   `buttonStyle`, which is its paint — so "Got it" rendered as a line of
   body text on a transparent background. The one control that carries a
   customer from their card to the game did not look like a control. It now
   has both, exactly as the two buttons above it in the same file do.
2. **A failed identity check logged people out.** `loadWheel` reads the
   wheel and the identity together and, on any failure of the identity
   request, substitutes "nobody is identified". A 403 means nobody; a
   dropped connection means *we could not ask*, and answering that with the
   phone form throws a customer out of a game they are in the middle of.
   This is the page the stall phone runs, on the connection a stall has. It
   now keeps whoever it had unless the server actually answered.

## 14. Open questions

- Should the session hold a cap on how many games it can be identified for?
  A browser that opens twenty links keeps twenty entries, each a pair of
  integers. It is not a real size, but it is unbounded, and unbounded things
  in a session are worth naming before they surprise somebody.
