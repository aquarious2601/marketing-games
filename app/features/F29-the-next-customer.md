# F29 — The next customer

| | |
|---|---|
| **ID** | F29 |
| **Status** | Agreed |
| **Interface** | Player |
| **Depends on** | [F10](./F10-hand-over-to-the-next-player.md), [F12](./F12-multiple-languages.md), [F28](./F28-the-gift-sheet.md) |
| **Agreed on** | 2026-11-19 |
| **Amends** | [F10](./F10-hand-over-to-the-next-player.md) R2 |

## 1. Summary

The hand-over button reads **Next customer** instead of **Next player**, in
every language.

## 2. Why

The person at the counter is a customer. They came in to buy something; the
wheel is what the shop hands them on the way out. "Player" was the word when
there was one game and that game was a wheel — now there is a store
([F27](./F27-the-store-and-its-games.md)) and one of its games does not
involve playing at all: a gift sheet simply gives something away
([F28](./F28-the-gift-sheet.md)). A sheet that says "Next player" is naming
a game that is not happening.

It is also the word the shop's own staff use. The button is pressed by a
cashier, dozens of times a day, and it should read as the thing they are
actually doing: serving the next person in the queue.

## 3. Actors

| Actor | Role |
|---|---|
| Customer | Takes a turn on the stall's device and hands it back |
| Cashier | Presses the button between one customer and the next |

## 4. User stories

- As a **cashier**, I want **the button to say "Next customer"**, so that
  **what I press matches what I am doing — serving the queue, not refereeing
  a game**.

## 5. Scope

### In scope

- The label on the hand-over button, wherever it appears: after a wheel
  result, on the daily-limit screen ([F23](./F23-a-daily-spin-limit.md) R16),
  and on both of the gift sheet's end screens
  ([F28](./F28-the-gift-sheet.md) R14).
- Its wording in all four languages ([F12](./F12-multiple-languages.md)).

### Out of scope

- **Every other use of the word "player".** The page headers, the admin
  tables, the Players module, the entity, the database, the API and the
  feature files keep it. This feature changes one label, not a vocabulary:
  renaming the model would touch every file in the application to say the
  same thing it already says, and the word is correct everywhere a customer
  cannot see it.
- The button's **test hook**. `next-player-button` stays
  ([F10](./F10-hand-over-to-the-next-player.md) R2's control, unchanged) —
  see R4.
- A per-game or per-store choice of word. One label, one wording.

## 6. Rules

| # | Rule |
|---|---|
| R1 | The hand-over button is labelled **Next customer**. This replaces [F10](./F10-hand-over-to-the-next-player.md) R2's **Next player**. |
| R2 | It reads the same wherever it appears — the wheel's result screen, the daily-limit screen, and the gift sheet's issued and spent screens — because it is one label and one control. |
| R3 | Every language the application offers names a customer, not a player: English **Next customer**, French **Client suivant**, Vietnamese **Khách tiếp theo**, Chinese **下一位顾客**. |
| R4 | Nothing else about the button changes: not what it does ([F10](./F10-hand-over-to-the-next-player.md) R1, R3–R9), not where it sits, and not its `data-testid`. The test id is a hook for the suites, not copy a customer reads, and churning it would edit end-to-end specs to prove a word nobody sees. |
| R5 | The translation key keeps its place in the player's group but is renamed to say what it holds, so a reader of the catalogue is not told one thing by the key and another by the value. |
| R6 | A sentence that **quotes** the label quotes the new one. The server's refusal of a second spin — "You have already had your spin. Press Next customer to pass the phone on." — names the button, so it follows it in all four languages. Found while building: Vietnamese and Chinese had drifted, naming a *player* in that sentence and something shorter on the button itself. |

## 7. Data model

Nothing. No entity, column, payload or stored value is involved — the label
is in the front end's translation catalogues.

## 8. API surface

Nothing. The label has never travelled over the wire.

## 9. Interface

### Player view

The button beneath a result, a limit notice or a spent sheet reads **Next
customer**. Its size, position and style are
[F10](./F10-hand-over-to-the-next-player.md)'s and are untouched, which
matters at 375px: the longer word must not push the button into a second
line or off the first screen (`CLAUDE.md`, the phone-first rule).

### Admin view

Unchanged.

### Responsive behaviour

Unchanged, and checked: "Next customer" is three characters longer than
"Next player" in English and one word longer in Chinese, so the button is
looked at on a 375px screen in all four languages before this is `Done`.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| A language's catalogue is missing the key | The key-parity test fails, as it does for any key ([F12](./F12-multiple-languages.md)) |

## 11. Acceptance criteria

- [x] Given a result on screen, then the button reads "Next customer".
- [x] Given the daily-limit screen, then the button reads "Next customer".
- [x] Given a gift sheet's issued screen, then the button reads "Next
      customer".
- [x] Given a gift sheet's spent screen, then the button reads "Next
      customer".
- [x] Given each of the four languages, then the button names a customer and
      the four catalogues hold the same keys.
- [x] Given the button is pressed, then everything
      [F10](./F10-hand-over-to-the-next-player.md) says happens still
      happens.
- [x] The four fast suites pass.
- [ ] Checked by hand at 375px in all four languages: the label fits on one
      line and the button is reachable without scrolling.

## 12. Open questions

- **Should the page headers follow?** "Playing as 0612345678"
  ([F11](./F11-admin-tables.md) mentions it) says the same word in the same
  place. It is one more label and one more key, left out here because the
  button is the one the cashier presses — say so and it follows.
