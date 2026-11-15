# F10 — Hand over to the next player

| | |
|---|---|
| **ID** | F10 |
| **Status** | Agreed |
| **Interface** | Player |
| **Depends on** | [F02](./F02-player-spin.md), [F03](./F03-spin-animation.md), [F08](./F08-player-identification.md) |
| **Agreed on** | 2026-11-15 |

## 1. Summary

After a spin, the button hands the phone to the next player instead of
spinning again: the result clears, the identified player is forgotten, and
the phone-number step returns.

## 2. Why

The page has been built as though one person were holding their own phone.
They are not. This is a shop's phone or tablet on a counter, and the person
who has just won something hands it back — so the one thing that must happen
after a result is the *next* person starting, and the one thing that must not
is the next person spinning as the last one.

Today the button says "Spin again", which offers the finished player another
go on an identity that is not going to be theirs for much longer, and leaves
whoever picks the device up next identified as them. [F08](./F08-player-identification.md)
R14 put a "Not you?" link on the page for exactly that problem; this makes
the hand-over the obvious path rather than a link somebody has to notice.

It costs the repeat player almost nothing, because the phone number is the
identity: somebody who really wants a second go types their number and is
recognised immediately (F08 R5), with no name and no birthday asked again.

## 3. Actors

| Actor | Role |
|---|---|
| Finished player | Has seen their prize, shows it to staff, hands the device back |
| Next player | Picks up a device that is asking for a phone number, not one holding somebody else's identity |
| Staff at the stall | Passes the device along; settles a claim from the Spins module if a screen was cleared too soon |

## 4. User stories

- As the **next player at a stall**, I want **the device to ask who I am**,
  so that **I am not playing as the person in front of me**.
- As a **finished player**, I want **one obvious button when I am done**, so
  that **I am not deciding what to press while somebody waits**.
- As a **returning player**, I want **my number to be enough**, so that
  **playing twice costs me a phone number and not a form**.
- As the **business**, I want **every spin attached to the person who
  actually made it**, so that **the log is worth reading**.

## 5. Scope

### In scope

- The button after a result becoming a hand-over, labelled **Next player**.
- Clearing the result, the animation and the identified player when it is
  pressed — on the server as well as on the page.
- The phone step returning, ready for whoever is next.
- A returning number going straight back to the wheel.
- Hiding "Not you?" once a result is on screen, since the hand-over button
  now does that job.

### Out of scope

- **Any limit on how often a person may play.** Unchanged. This is a
  hand-over, not an eligibility rule — see R7 and section 13. One spin per
  *identification* is a property of the page, not a rule the server enforces.
- **A confirmation before clearing the prize.** Considered and declined, with
  a reason — see section 13.
- **A timer.** Nothing clears the result on its own (R5).
- **Re-showing a prize that has been cleared.** Staff look it up in the Spins
  module ([F09](./F09-admin-modules.md)) by phone number. The player page does
  not reopen a past result.
- **A claim code or QR** — still the roadmap's Prize reveal and claim item.
- **Any backend change.** `POST /api/player/forget` already exists (F08 R14)
  and does exactly this.

## 6. Rules

| # | Rule |
|---|---|
| R1 | Once a spin has finished and the result is on screen, the button hands over to the next player instead of spinning again. |
| R2 | It is labelled **Next player**. |
| R3 | Pressing it clears the result, returns the wheel to rest, and shows the phone step. |
| R4 | It forgets the player on the server too, not only on the page. Clearing one and not the other would leave a reload putting the next person back on the previous player's identity (F08 R12). |
| R5 | The result stays on screen until the button is pressed. Nothing clears it on a timer, and nothing clears it because time passed. |
| R6 | A number that has just played may come straight back: it is recognised (F08 R5) and goes to the wheel with no further questions. |
| R7 | This is a hand-over, not a limit. The page offers one spin per identification; `POST /api/spin` still accepts repeat spins from one session (F08 R18), and the same person may identify again and play again. |
| R8 | While a result is on screen there is **no spin control on the page at all** — not disabled, absent. The only way to another spin is through the phone step. |
| R9 | "Not you?" (F08 R14) is not shown while a result is on screen. Two controls doing the same thing invite the wrong one being pressed; before a spin it is still the way to correct a wrong number. |
| R10 | A failed spin is unchanged (F02 R17): the error shows, the wheel returns to rest, no result appears, and the button is still **Spin**. A player who did not get a spin is not handed over. |

## 7. Data model

Nothing. No new table, no new column, no new field on an existing one.

## 8. API surface

Nothing new. The hand-over uses `POST /api/player/forget`, which
[F08](./F08-player-identification.md) R14 already built for the same
situation reached from the other direction.

## 9. Interface

### Player view — route `/`

Unchanged up to the result. Then:

- The prize panel stays over the wheel, exactly as [F03](./F03-spin-animation.md)
  and the F08 layout left it, with its line asking the player to show the
  screen to staff.
- The button beneath reads **Next player**.
- The "Playing as … Not you?" line is gone (R9).

Pressing **Next player** returns the card to the phone step, with the header
and the branding as they were.

### Responsive behaviour

No change. The hand-over button occupies exactly the space the Spin button
did, and the phone step is the same step F08 already fits at 375px.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| Result on screen | **Next player**; no Spin button anywhere (R8); no "Not you?" (R9) |
| **Next player** pressed | Result cleared, wheel at rest, phone step shown, session forgotten |
| The forget request fails | The page hands over anyway. The next identification replaces the server session regardless, and a device still showing the last player's name is the worse outcome |
| The same number entered again | Recognised, straight to the wheel (R6) |
| Spin failed | No hand-over. Error, wheel at rest, button still **Spin** (R10) |
| Reload while a result is on screen | The player is still identified and sees the wheel at rest. They have not handed over yet, and the prize is in the log either way |

## 11. Acceptance criteria

- [x] Given a result on screen, then the button reads "Next player" and no spin control exists on the page.
- [x] Given a result on screen, then "Not you?" is not shown.
- [x] Given "Next player" is pressed, then the phone step returns and the result is gone.
- [x] Given "Next player" is pressed, then the server is told to forget the player.
- [x] Given "Next player" is pressed and the forget request fails, then the phone step returns anyway.
- [x] Given a number that has just played, when it is entered again, then the wheel returns with no name or birthday asked.
- [x] Given the next player identifies, then no stale result from the previous player is on screen.
- [x] Given a spin that failed, then the button still reads "Spin" and no hand-over happened.
- [x] Given `POST /api/spin` twice in one session, then both succeed — the server limit is unchanged (R7).

## 12. Verification

Built on 2026-11-15.

| Suite | Result |
|---|---|
| PHPUnit | 267 tests, 1,279 assertions — green (unchanged; no backend change) |
| Vitest | 415 tests — green |
| `npm run typecheck` | clean |
| `npm run lint` | clean |

No Playwright was written (browser checking is manual — see `CLAUDE.md`).
Three existing specs asserted the old "Spin again" behaviour and were
repaired to assert the hand-over instead, so a manual run still passes and
still means something.

One thing was worth proving rather than asserting:

- **That there is no spin control while a result is up (R8).** Asserted as an
  absence, in the unit tests and in the repaired end-to-end spec, because
  "disabled" and "absent" look the same to a person and completely different
  to the next player who picks the device up.

### Checked by hand in a browser

Walked through at 375×812 during [F11](./F11-admin-tables.md): a number that
had already played went straight to the wheel, the spin ran, the prize
appeared over the wheel with the button beneath reading **Next player**, the
"Playing as Anh" line stayed put with its "Not you?" gone, and nothing
scrolled.

## 13. Decisions and risks

**The hand-over clears the prize without asking.** This was the obvious place
to put a confirmation — the panel is the player's only proof, and a reflex tap
destroys it. It is still a plain button, for one reason that did not exist
until this week: [F09](./F09-admin-modules.md)'s Spins module means staff can
look the spin up by phone number in a few seconds. The prize is recoverable,
so the cost of a mistaken tap is a lookup rather than an argument, and that is
cheaper than an extra tap for every single player at a busy stall.

If that turns out to be wrong in practice — a queue, a cleared screen, a
player who does not remember their own number — the confirmation is a small
change and this paragraph is the reason to revisit it.

**One spin per identification, and still no limit (R7).** These sit together
uncomfortably until you separate the page from the rule. The page now offers
one spin per identification, because handing a device over is what actually
happens at a stall. The *rule* is still that anyone may play as often as they
like (F08 R18): the server accepts it, and somebody who types their number
again gets another spin. Nothing here is eligibility, and the spin-eligibility
feature is still entirely unbuilt. Conflating the two would mean quietly
shipping "one spin per person" without the screen that feature needs — the one
that tells a returning player they have already played.

**"Next player" rather than "Spin again".** The label is the whole feature in
two words. "Spin again" promises a spin and now delivers a phone form, which
is the worst of the options, and "Done" describes the finished player's view of
a device that is about to belong to somebody else.

**The result is cleared on hand-over, not kept above the form.** Keeping it
would lose no taps and nothing would vanish. It would also show one person's
prize to the next person while they type their phone number into the same
screen, which is a small privacy leak with no upside — the player it belongs
to has already finished with it.

**"Not you?" survives, narrowed (R9).** It now has one job: a wrong number
caught before spinning. That is a real case — a mistyped digit, or a device
left identified by someone who walked off — and it is distinct from finishing.
Showing both at once would have given the page two buttons that do the same
thing, one of them labelled as though it did something else.

## 14. Open questions

- **Whether a confirmation is needed after all.** See section 13. The answer
  comes from a real stall, not from here.
- **What staff do when a screen is cleared before they see it.** Today: open
  the Spins module and search the number. Worth knowing whether that is
  acceptable at a counter, or whether the roadmap's claim code should come
  sooner.
