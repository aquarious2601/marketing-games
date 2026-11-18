# F17 — The losing panel

| | |
|---|---|
| **ID** | F17 |
| **Status** | Agreed |
| **Interface** | Player |
| **Depends on** | [F12](./F12-multiple-languages.md), [F13](./F13-reward-configuration.md), [F16](./F16-a-code-on-every-win.md) |
| **Agreed on** | 2026-11-16 |

## 1. Summary

A player who wins nothing is no longer told they won something and asked to
claim it. The result panel thanks them for playing and wishes them luck next
time, in their own language.

## 2. Why

The result panel was built when every slice was a prize. It opens with "You
won", shows the slice's name, and closes with an instruction for claiming
it — and [F13](./F13-reward-configuration.md) R11 then added a slice that
gives nothing. Nobody changed the panel, so a player who loses currently
reads:

> **You won**
> Maybe next time
> Show this screen to a member of staff to claim it.

Every line of that is wrong. They won nothing, there is nothing to show, and
[F13](./F13-reward-configuration.md) R24 makes the claim impossible anyway —
staff are not offered the control, so a player who walks over is turned
away by a screen that sent them.

It is also the one place in the application where the losing slice is not
handled properly. The draw, the log, the snapshot and the claim all treat it
correctly ([F13](./F13-reward-configuration.md) R15), and
[F16](./F16-a-code-on-every-win.md) R2 was careful to issue it no code. The
panel is the last thing still pretending it is a prize.

## 3. Actors

| Actor | Role |
|---|---|
| **Player** | Reads that they have not won, and is not sent to a counter |

## 4. User stories

- As a **player**, I want **to be told plainly that I did not win**, so that
  **I do not queue at a counter for nothing**.
- As a **player**, I want **the message to be kind**, so that **a stall I
  walked up to for fun does not end in a flat refusal**.

## 5. Scope

### In scope

- A different opening line on the panel when the spin won nothing.
- A closing phrase in place of the claim instruction.
- Both in the four languages the application speaks.

### Out of scope

- **Making the phrases configurable.** See section 13: the slice's own name
  is already where a campaign puts its own words, and a free-text field
  would appear in one language to readers of four.
- **Changing the slice name.** It stays exactly as the admin typed it
  ([F12](./F12-multiple-languages.md) R10). "Maybe next time" is
  [F13](./F13-reward-configuration.md) R12's default and theirs to rename.
- **A consolation prize, another spin, or a discount for losing.** Each is a
  business rule about eligibility, and the roadmap's *spin eligibility* is
  where that starts.
- **Anything the admin sees.** A losing spin is logged and unclaimable
  exactly as it is today.
- **The panel's shape, size or position.** Only its words change.

## 6. Rules

| # | Rule |
|---|---|
| R1 | A spin whose reward type is `nothing` is a losing spin, and the result panel reads differently for it. |
| R2 | Its opening line is not "You won". It reads a neutral thank-you for playing. |
| R3 | Its closing line is an encouraging phrase — "Good luck next time!" — in place of the claim instruction ([F16](./F16-a-code-on-every-win.md) R6a). |
| R4 | The slice's own name is still shown, between the two, exactly as the admin typed it (F12 R10). The phrases go around the name and never replace it. |
| R5 | Both phrases are fixed wording held in the four dictionaries (F12 R9). Neither is configurable. |
| R6 | Nothing else about the panel changes: no code on it (F16 R2), the same width, the same position over the wheel, and no scrolling at 375px. |
| R7 | Only `nothing` is a loss. The panel asks whether the reward **is** the losing type, never whether it is missing, so anything else reads as a win — including the absent reward the panel's own prop allows and the API never sends. |
| R8 | Nothing changes for the admin or in the log. The spin is recorded, listed and unclaimable as before (F13 R15, R24). |

## 7. Data model

No change. The panel already receives the reward it needs to read.

## 8. API surface

No change. `reward.type` has carried `nothing` since
[F13](./F13-reward-configuration.md).

## 9. Interface

### Player view

A win is untouched:

```
YOU WON
Free coffee
Your code
B4C5-D6F7
Give this code to a member of staff to claim it.
```

A loss becomes:

```
THANKS FOR PLAYING
Maybe next time
Good luck next time!
```

Same three parts in the same places, so the panel does not change shape as
the wheel stops — which is the whole reason it was positioned the way it was.

### Responsive behaviour

Unchanged, and slightly safer: the losing panel is now the shortest one
there is, since F16 R2 leaves it no code block.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| `reward.type` is `nothing` | The losing wording (R2, R3) |
| `reward` is absent altogether | The winning wording (R7). The API type does not allow this; the panel's prop does, so the branch is written rather than left to crash |
| A losing reward the admin renamed | Their name, with the fixed phrases around it (R4) |
| An unrecognised reward type | The winning wording — the server already reads an unknown type as a free product rather than throwing |

## 11. Acceptance criteria

- [x] Given a losing spin, when the result appears, then it does not say
      "You won" and does not say "Show this screen".
- [x] Given a losing spin, then the panel shows the thank-you, the slice's
      name and "Good luck next time!".
- [x] Given a losing spin, then no code block is on the panel.
- [x] Given a winning spin, then the panel is word for word what it was
      before this feature.
- [x] Given a losing spin in French, Chinese or Vietnamese, then both
      phrases are in that language.
- [x] Given a losing slice the admin renamed, then the panel shows the name
      they typed.
- [ ] Given the player page at 375px, then the losing panel needs no
      scrolling. _The e2e suite's check, which is the user's to run — and
      the losing panel is now the shortest of the three._

## 12. Verification

`npm test` — 543 tests. `PlayerPage.test.tsx` covers R1–R4: that the losing
panel says none of the three things it used to, that it says the three
things it should, and that a win is unchanged. `i18n.test.ts` gains a check
that both phrases are genuinely translated in `fr`, `vi` and `zh` — the
parity checks there would pass an English sentence pasted into `fr.ts`,
which is the way this kind of string actually goes wrong.

R5 is held by the type system rather than by a test: the dictionaries are
`Record<MessageKey, string>`, so a phrase missing from any of the four does
not compile.

R7 is not exercised. Its branch exists because the panel's prop is nullable,
and the API type cannot produce the payload that would reach it.

Nothing in the backend changes, so its suite is a regression check only.

**Not looked at in a browser.** The panel is covered at the DOM level; the
375px criterion is the e2e suite's.

## 13. Decisions and risks

- **Fixed wording, not a setting (R5).** This is the user's call and it is
  the right one. A per-campaign consolation message is a free-text field
  shown to readers of four languages: by F12 R10 the application shows what
  the admin typed, as typed, so a shop writing "Dommage !" would show it to
  an English player. The slice's name is already the place a campaign puts
  its own words, and it is the line where a reader expects the shop's voice
  rather than the application's.
- **A thank-you rather than "No luck".** The slice's name usually says
  something like "Maybe next time" already (F13 R12). Opening with a second
  negative makes three lines that all say no, which reads as a scolding for
  having played. One plain statement of the fact, framed kindly, is enough.
- **The name stays between the phrases (R4).** The wheel stopped somewhere,
  and a panel that does not say where leaves the player watching an
  animation that ended in nothing — worse than a label that says "Maybe
  next time".
- **Risk: a shop wants its own words.** They have them: rename the slice.
  If a campaign ever genuinely needs a translated consolation line of its
  own, that is the roadmap's *translating what the admin types*, which needs
  a translations table rather than a field.

## 14. Open questions

- None.
