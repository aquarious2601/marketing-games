# F40 — A number that looks French

| | |
|---|---|
| **ID** | F40 |
| **Interface** | Player |
| **Depends on** | [F08](./F08-player-identification.md), [F12](./F12-multiple-languages.md), [F19](./F19-one-person-one-number.md) |
| **Amends** | Nothing. [F08](./F08-player-identification.md) R4 still decides what is accepted; this only adds something to read. |
| **Status** | Agreed |
| **Agreed on** | 2026-11-27 |

## 1. Summary

When the page is in French, a number that does not look like a French phone
number gets a note under the field saying so — and the player carries on
regardless.

## 2. Why

A phone number is the only thing the game asks for that it cannot check. It
is typed with one thumb, at a counter, by somebody who is half paying
attention, and a wrong digit is invisible: the number is accepted, a row is
written, and the shop finds out months later that the customer it most wanted
to send a birthday offer to cannot be reached.

Most of those mistakes have a shape. A French number is ten digits beginning
with `0`, so nine digits is a dropped one and eleven is a doubled one, and
both are caught by counting. That is worth a line of text.

What it is **not** worth is a locked door. From
[F08](./F08-player-identification.md) §13:

> a strict validator that rejects a legitimate foreign number at a stall is
> worse than a loose one that accepts a typo

So this feature is a remark, not a gate.

## 3. Actors

| Actor | Role |
|---|---|
| Player | Types a number, and is told when it does not look like a local one |
| Visitor from elsewhere | Types a foreign number, and must not be stopped by it |
| Shop | Gets fewer unreachable rows in the customer list |

## 4. User stories

- As a **player**, I want **to be told when I have mistyped my number**, so
  that **the offer the shop sends me actually arrives**.
- As a **visitor**, I want **my foreign number accepted without argument**,
  so that **a check written for somebody else's country is not the end of my
  turn**.
- As the **shop**, I want **the obvious typos caught at the counter**, so
  that **the customer list is worth texting**.

## 5. Scope

### In scope

- The identity step's phone field, on the player page.
- French numbers only: the one country the interface is taken to imply, and
  the one dialling code a number can name.
- A note. Nothing refuses, nothing is rewritten, nothing is stored.

### Out of scope

- Any other country's numbering plan. A language is not a country — three of
  the four ([F12](./F12-multiple-languages.md)) cover several each — and
  French is read as France because the shop is in France. That is the only
  such assumption this feature makes.
- Checking the numbers already in the table. They were typed under
  [F08](./F08-player-identification.md) R4 and they stay exactly as they are.
- A country setting on the store. That was
  [F18](./F18-the-campaigns-phone-country.md), and it was withdrawn.
- Verifying that the number exists or belongs to the person holding it.
  Nobody is sent a code ([F08](./F08-player-identification.md) §13).

## 6. Rules

### When the question is asked

| # | Rule |
|---|---|
| R1 | The check runs when the page is in French, or when the number names France itself by beginning `+33` or `0033`. |
| R2 | A number that names another country — `+` or `00` followed by a dialling code that is not `33` — is never checked against French rules, whatever language the page is in. The person has said where their number comes from and it is not here. |
| R3 | A number with no prefix, on a page that is not in French, is not checked either. Nothing is assumed about a country from a page in English, Chinese or Vietnamese. |
| R4 | "In French" means the language the page is showing ([F12](./F12-multiple-languages.md) R3), whether that came from the browser or from the picker. No country is chosen, stored or configured anywhere. |

### What a French number looks like

| # | Rule |
|---|---|
| R5 | National form: ten digits, the first `0`, the second `1`–`9`. |
| R6 | International form: `+33` or `0033`, then nine digits, the first `1`–`9`. |
| R7 | A trunk `0` left in after the dialling code — `+33 0 6 14 85 62 40` — passes, read as the national number it spells. It is a common way to write one, and [F19](./F19-one-person-one-number.md) already treats it as the same person as `0614856240`. |
| R8 | Spaces, dots, hyphens and brackets are not part of the question ([F08](./F08-player-identification.md) R3). `06 14 85 62 40`, `06.14.85.62.40` and `0614856240` are one number. |
| R9 | Everything else does not look French: nine digits, eleven digits, a first digit that is not `0`, a second digit that is `0`. |

### What it does about it

| # | Rule |
|---|---|
| R10 | It warns. It never refuses. The step continues, the number is stored exactly as [F08](./F08-player-identification.md) R3 canonicalises it, and nothing is rewritten. |
| R11 | The note is an observation, not a verdict: that the number does not look like a French number, with an example of one. The player knows their own number better than we do. |
| R12 | It sits where a field error would sit, in the page's language, and it is **not** red. A thing to read, not an error to fix. |
| R13 | A number that fails [F08](./F08-player-identification.md) R4 outright gets F08's own message, and this note is not shown. One problem at a time on one field. |
| R14 | It appears when the field is left — never while the digits are still arriving. Pressing Continue is also finishing with the field, but it does not wait for the note to be read: the step goes on (R10), so when the lookup succeeds the note leaves with it. |
| R15 | The check belongs to the browser alone. No violation, no response field, no column, no request. |

## 7. Data model

None. No entity, column, index or setting is added or changed.

## 8. API surface

None. No endpoint is added, and no existing request or response changes
shape.

## 9. Interface

### Player view

The phone step is unchanged — heading, lead, one field, one button — with at
most one line of text added under the field, in the body colour, at the size
a field error uses.

| State | What is under the field |
|---|---|
| Empty, untouched | Nothing |
| Being typed | Nothing (R14) |
| Left, and not a number at all | F08's message, in red (R13) |
| Left, and does not look French | The note, in the body colour |
| Left, and looks French | Nothing |

### Admin view

Unchanged. A phone number is never typed into the admin — it is displayed on
a customer and searched for in the list — so there is nothing there to check.

### Responsive behaviour

One line of 12px text at 375px, in a step that must not need scrolling to
reach its button ([F08](./F08-player-identification.md) §9). It takes the
place a field error already occupies in that layout, so the worst case is
unchanged from today.

## 10. Validation and error cases

| Typed | Page | Behaviour |
|---|---|---|
| `0614856240` | French | Nothing. Looks French. |
| `061485624` | French | The note. Nine digits. |
| `06148562400` | French | The note. Eleven digits. |
| `6614856240` | French | The note. Does not begin with `0`. |
| `+33614856240` | any | Nothing. Looks French. |
| `+330614856240` | any | Nothing (R7). |
| `+330014856240` | any | The note. The digit after the trunk `0` is `0` (R9). |
| `+3361485624` | any | The note. Eight digits after the code. |
| `0014856240` | French | Nothing. `00` is read as the international prefix, so this named a country that is not France (R2, and §13). |
| `0033614856240` | any | Nothing. `0033` is a way of writing `+33` (R6). |
| `+84912345678` | French | Nothing. Another country said so itself (R2). |
| `0912345678` | Vietnamese | Nothing. No prefix, and not a French page (R3). |
| `0912345678` | French | Nothing — ten digits beginning `09` has a French number's shape. The check cannot tell it from one and does not try (§13). |
| `abc` | French | F08's message only (R13). |

## 11. Acceptance criteria

- [ ] Given the page is in French, when I type `061485624` and leave the
      field, then I am told it does not look like a French number.
- [ ] Given that note is showing, when I press Continue, then the step
      proceeds and the number is looked up.
- [ ] Given the page is in French, when I type `0614856240`, then there is no
      note.
- [ ] Given the page is in French, when I type `06 14 85 62 40`, then there
      is no note (R8).
- [ ] Given the page is in French, when I type `+84912345678`, then there is
      no note (R2).
- [ ] Given the page is in English, when I type `061485624`, then there is no
      note (R3).
- [ ] Given the page is in English, when I type `+3361485624`, then I am told
      it does not look like a French number (R1).
- [ ] Given the page is in French, when I type `+330614856240`, then there is
      no note (R7).
- [ ] Given the page is in French, when I type `abc`, then I get F08's
      message and not this one (R13).
- [ ] Given the page is in French, when I have typed only `06` and have not
      left the field, then there is no note yet (R14).
- [ ] The note is translated in all four languages.
- [ ] Nothing under `backend/` changed (R15).

### By hand

- [ ] At 375px, in French, the note appears without pushing the Continue
      button off the screen.
- [ ] The note is legible on all six themes and does not read as an error.

## 12. Verification

The four fast suites. The whole of this feature is one pure function and one
prop, so the frontend suite carries all of it; there is nothing for the
backend suite to say.

## 13. Decisions and risks

**A warning, not a gate.** The decision this feature turns on.
[F08](./F08-player-identification.md) §13 chose a loose validator on purpose,
and that choice has not stopped being right: the person typing is at a
counter, the queue is behind them, and the cost of a wrong refusal is that
they stop playing. A note costs a mistaken reader one line of text they can
ignore. So the check is allowed to be wrong — which is also what lets it be
simple.

**No country setting, and no guessing beyond the language.**
[F18](./F18-the-campaigns-phone-country.md) is the warning here, and worth
re-reading before anyone extends this. It read a country from the language
and then *rewrote every number into international form*: it needed a setting
before it worked at all, it broke the returning player with nineteen spins,
and on an English page it read `0614856240` as `+10614856240`. The difference
is not the guess — this feature guesses too. It is what the guess is allowed
to touch. F18's guess wrote to the database. This one writes one sentence on
a screen, and when it is wrong the player ignores it and plays.

**Why `+33` is checked in any language.** A page in English says nothing
about where a number is from, but a number beginning `+33` says it itself.
There is no assumption left to be wrong about, so the language stops
mattering — and a mistyped `+33` number on an English page is exactly as
unreachable as one on a French page.

**The browser only (R15), deliberately.** `identity.ts` describes itself as a
mirror of the backend's `PhoneNumber` and `PlayerInputParser`, and this rule
breaks that symmetry on purpose: a check that never refuses anything has no
authority to establish, so a server copy would duplicate the French numbering
plan in order to produce a message no client is obliged to show. The risk is
that a future reader reads the asymmetry as an oversight and "completes" it
into a `Violation` — which would quietly turn this feature into the gate R10
says it must never be. If the shop ever does want a number refused, that is a
new rule in a new file, decided out loud.

**What it gets wrong, knowingly.** A ten-digit number beginning `0` with a
second digit of `1`–`9` is accepted as French whatever country it is really
from — Vietnamese mobile numbers have exactly that shape, which is the
second-to-last row of §10. The check cannot tell those apart and does not
try: it catches length and leading digits, which is where typos live, and
says nothing about numbers that are merely plausible. A check that tried to
be certain would have to refuse things, and R10 forbids that.

**The second digit is left at `1`–`9`.** `08` is premium-rate and nobody's
mobile, so a stricter rule could exclude it. It is not excluded, because the
job here is catching a dropped digit, not auditing the French numbering plan,
and every extra clause is another way to be wrong about somebody's real
number.

**Found while building: the note cannot catch somebody who does not pause.**
R14 was first written as "when the field is left, or when the step is
submitted", and the test for the second half failed — correctly. Pressing
Continue proceeds, so the step the note is attached to is gone a moment
later: on a fast connection the player never reads it. The note therefore
works for the player who pauses, looks at what they typed, or has the lookup
fail — and not for the one who types ten digits and taps straight through.

The fix that would close that is a speed bump: the first press shows the note
and does nothing, the second press goes through. It is deliberately **not**
built, because it is a refusal of the first press, and R10 and the answer
that chose it both say the button works. If the shop finds unreachable
numbers still arriving, the honest next step is to measure that before
reaching for the bump — and it would be a new rule, not a quiet change to
this one.

**Corrected while building: what a leading `00` is.** R9 lists "a second
digit that is `0`" as a shape that is not French, and §10 first claimed
`0014856240` on a French page would be flagged for it. It is not, and should
not be: `00` is the international prefix, so that number named a country
(`+1 485 6240`) that is not France and R2 exempts it. The alternative was to
read `00` as international *only* before `33` — which would have caught that
one typo and, in exchange, flagged a Vietnamese number written `0084…` as
not-French. It was dropped for a reason bigger than the trade: this
application already has an opinion about `00`, written down in
`PhoneMatch::significant` as "a way of writing `+`", and a sibling module
holding a second opinion about the same two characters is how two rules that
each look right produce a bug neither of them describes. R9's clause is still
live where it can be — after `+33`, as the new third row of §10 shows.

**French overseas numbers.** `+262`, `+590`, `+594`, `+596` and `+687` are
not `+33`, so R2 exempts them — correct, and for the right reason. Written
nationally (`0262…`) they pass R5 anyway.

## 14. Open questions

None.
