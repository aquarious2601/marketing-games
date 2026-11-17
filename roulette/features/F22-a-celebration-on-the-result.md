# F22 — A celebration on the result

| | |
|---|---|
| **ID** | F22 |
| **Status** | Agreed |
| **Interface** | Player |
| **Depends on** | [F03](./F03-spin-animation.md), [F13](./F13-reward-configuration.md), [F17](./F17-the-losing-panel.md), [F20](./F20-one-spin-per-identification.md) |
| **Agreed on** | 2026-11-17 |

## 1. Summary

Winning looks like winning. Confetti falls over the card for a couple of
seconds when the wheel stops on a prize — and not at all when it stops on
the losing slice.

## 2. Why

The request:

> an animation when spin ends, of course nothing on losing slice

It was offered during [F03](./F03-spin-animation.md) and not taken, and has
sat in [`ROADMAP.md`](./ROADMAP.md) since as *celebration on the result*.

The wheel already builds six seconds of anticipation ([F03](./F03-spin-animation.md))
and the panel already arrives rather than appears. What is missing is the
moment at the end: the result is delivered with the same composure whether
somebody won the grand prize or nothing at all. At a stall, that moment is
the point — it is what the person behind the player sees, and what decides
whether they queue up.

The "of course" in the request is the important half. A celebration on a
losing spin is worse than no celebration: it reads as mockery, and
[F17](./F17-the-losing-panel.md) exists because the page used to tell a
losing player they had won.

## 3. Actors

| Actor | Role |
|---|---|
| **Player** | Sees the wheel stop and knows instantly whether it was good news |
| **The queue** | Sees somebody win from two metres away |

## 4. User stories

- As a **player**, I want **winning to feel like winning**, so that **a
  prize is a moment rather than a notification**.
- As a **player who lost**, I want **no fanfare**, so that **the page is not
  celebrating at me**.

## 5. Scope

### In scope

- Confetti over the card when a spin reveals a win.
- Nothing whatever on a losing spin.
- Clearing itself up afterwards.

### Out of scope

- **Sound.** Still on the roadmap, still unbuilt, and a stall is loud. It is
  also the one addition that needs a mute control before it can ship.
- **The winning slice flashing.** Considered and left out: it animates
  inside `wheel-stage`, and a `transitionend` from in there drives the
  spin's phase machine ([F03](./F03-spin-animation.md) R1). Worth doing one
  day, worth doing carefully.
- **Anything scaled to the prize.** A grand prize and a free sample get the
  same celebration. Ranking prizes by how excited the page is about them
  invites an admin to wonder why theirs is the quiet one.
- **A motion toggle on the page.** Still the roadmap's answer to
  [F03](./F03-spin-animation.md) R12, still its own feature.
- **A new dependency.** No confetti library; see section 13.

## 6. Rules

### When it fires

| # | Rule |
|---|---|
| R1 | A spin that reveals a win is celebrated with confetti over the card. |
| R2 | A spin that reveals the losing slice is not — nothing is rendered at all. The test is the one [F17](./F17-the-losing-panel.md) R1 already uses: a reward type of `nothing`. |
| R3 | It starts when the result is revealed, which is when the settle finishes ([F03](./F03-spin-animation.md) R11), not when Spin is pressed. The wheel is still the story until then. |
| R4 | It celebrates **the spin**, not the panel. A reload that shows a result already won ([F20](./F20-one-spin-per-identification.md) R6) does not celebrate again: the moment has passed, and repeating it on every refresh would make it meaningless. |
| R5 | Handing over to the next player clears it with everything else ([F10](./F10-hand-over-to-the-next-player.md) R3). |

### What it looks like

| # | Rule |
|---|---|
| R6 | Thirty pieces fall from above the card and past its lower edge. Each has its own delay, speed, sway and tumble, and they keep arriving for a second and a half rather than dropping as one curtain. A sixth are round; the rest are rectangles that flip as they fall. |
| R7 | The colours are the wheel's own slice palette with the campaign's accent mixed through, so the celebration is in the colours the player has just watched go round ([F04](./F04-branding-and-themes.md)) — and reads against every theme, which theme tokens alone did not. See section 13. |
| R8 | It lasts about five seconds, then removes itself from the document. Nothing animates forever behind a result that stays until **Next player**. |
| R9 | It is decorative: `aria-hidden`, `pointer-events-none`, and outside `wheel-stage` so nothing it does can reach the spin's phase handler ([F03](./F03-spin-animation.md) R1). |
| R10 | A screen reader is told what was won by the result panel's `role="status"`, exactly as before. The celebration says nothing, because it means nothing that the panel has not already said. |

### Who sees it

| # | Rule |
|---|---|
| R11 | Everybody. The system's reduced-motion preference is **not** consulted, exactly as [F03](./F03-spin-animation.md) R12 does not consult it for the spin. Amended 2026-11-17, before this shipped — see section 13. |

## 7. Data model

Nothing. No API, no storage, no setting.

## 8. API surface

None. The server already sends everything this needs — the reward's type
([F13](./F13-reward-configuration.md) R20) is what decides win or loss.

## 9. Interface

### Player view

For a couple of seconds after the wheel stops on a prize, pieces in the
campaign's colours fall across the card and past its edge, behind the result
panel. Then they are gone and the screen is as it was.

On a losing spin, and for anybody who has asked for reduced motion, nothing
changes at all.

### Admin view

Unchanged.

### Responsive behaviour

The pieces are positioned as percentages of the card, so the effect fills it
at every width without a media query, and nothing it adds can be scrolled to
— it is inside the card's own bounds and `overflow` is hidden.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| A win | Confetti (R1) |
| The losing slice | Nothing rendered (R2) |
| A reload showing a past win | The panel, no confetti (R4) |
| Reduced motion | The same celebration as everybody gets (R11) |
| **Next player** pressed mid-celebration | Cleared with the result (R5) |
| A failed spin | No result, so nothing to celebrate ([F02](./F02-player-spin.md) R17) |

## 11. Acceptance criteria

- [x] Given a spin that wins, when the result is revealed, then confetti is
      rendered over the card.
- [x] Given a spin that lands on the losing slice, then no confetti is
      rendered.
- [x] Given a win, then the confetti is gone from the document within six
      seconds.
- [x] Given a reduced-motion preference and a win, then the confetti is
      rendered exactly as it is for everyone else.
- [x] Given a reload that shows a result already won, then no confetti is
      rendered.
- [x] Given a celebration in progress, when **Next player** is pressed, then
      it is removed with the result.
- [x] Given a win, then the spin still completes and the result panel still
      reads as it does today.

## 12. Verification

`npm test` — 557 tests. `PlayerPage.test.tsx` covers R1 to R5 and R11:
confetti on a win and none before the settle finishes, none at all on the
losing slice, none on a reload showing a result already won, removal after
`CELEBRATION_MS`, clearing on hand-over, the same celebration for a
reduced-motion preference, and that the element is `aria-hidden`,
`pointer-events-none` and outside `wheel-stage`.

`php vendor/bin/phpunit` — 545, untouched. This feature has no server side.

**Looked at in a browser**, which is the only reason it works. Two faults
got past a green suite and are in section 13: the fall was 36 pixels, and
the colours were invisible. A test can assert that an element is in the
document; it cannot notice that the element is a pink rectangle on a pink
card moving a tenth of the distance it should.

## 13. Decisions and risks

- **No confetti library.** `canvas-confetti` is the obvious choice and is
  about 25KB on a page whose entire point is loading fast on a stranger's
  phone at a stall. A dozen elements and two keyframes do this, carry the
  theme's own colours for free, and add nothing to the bundle. The cost is
  that it is a simpler effect than a physics canvas would give.
- **R4 is the rule most likely to be "fixed" by mistake.** Celebrating on
  mount is one line shorter and looks identical the first time. It is wrong
  because [F20](./F20-one-spin-per-identification.md) made a reload show the
  result again: the page would throw confetti every time somebody refreshed
  to re-read their code, which is both silly and a slow way to make the
  effect worthless.
- **Reduced motion was honoured, and then it was not (R11, amended).** The
  first version of this suppressed the celebration entirely under
  `prefers-reduced-motion: reduce`, on the reasoning that the spin carries
  information while confetti is decoration. That reasoning still sounds
  right and the result was still wrong: the machine it was built on reports
  `reduce`, so the feature was invisible to the person who asked for it, and
  the first thing they said was "I have no confetti at all".

  Windows reports `reduce` whenever animation effects are off, which is a
  default on a great many machines, and automated browsers report it almost
  universally. A celebration that a large share of players never see is not
  a celebration; it is a branch nobody exercises.

  [F03](./F03-spin-animation.md) R12 was amended for the same reason and is
  worth reading beside this. The honest answer for somebody who genuinely
  wants less motion is the page's own toggle, still on
  [`ROADMAP.md`](./ROADMAP.md), which would cover the six-second wheel as
  well — and the wheel is the part worth turning off first.

  Found before shipping only because the feature was looked at in a browser
  rather than trusted to its tests, which all passed.
- **Risk: a cheap phone.** A dozen absolutely-positioned elements animating
  `transform` and `opacity` are composited by the GPU and should cost
  nothing measurable. If it ever does, the fix is fewer pieces: the scatter
  is one table of twelve rows, and shortening it is the whole change.
- **The fall was 36 pixels, and every test passed.** A percentage inside
  `translate` resolves against the element's own box, not its container, so
  animating a 14px rectangle from `-140%` to `115%` moved it about 36px
  inside a 304px card — the whole shower landing behind the result panel.
  The fix is a full-height track per piece carrying the fall, with the
  shape inside carrying only the tumble, so those percentages mean the
  card's height. Nothing in the suite could have caught it: the element was
  mounted, with the right class and the right animation name.
- **Theme tokens alone made it invisible.** The first palette was
  `--accent`, `--accent-soft`, `--panel-border` and friends, which on the
  birthday theme is six shades of pink falling onto a pink card. Correct,
  branded, and unwatchable. The wheel's `SLICE_COLOURS` are vivid, already
  contrast-checked, and are the colours the player has been staring at for
  six seconds, so they read on every theme and still belong to this game.
- **Risk: it looks cheap.** Hand-rolled confetti can read as amateur where a
  physics library reads as polish. Accepted; thirty pieces, a sway rather
  than a straight drop, two shapes and a flip are what stand in for the
  physics.

## 14. Open questions

- **Sound**, still. It is the half of "a moment" that this cannot provide,
  and it needs a mute control before it can be considered.
