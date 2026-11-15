# F03 — A wheel that spins like a wheel

| | |
|---|---|
| **ID** | F03 |
| **Status** | Done |
| **Interface** | Player |
| **Depends on** | [F02](./F02-player-spin.md) |
| **Agreed on** | 2026-11-14 |

## 1. Summary

Replace the single eased turn from F02 with a spin that behaves like a real
wheel: a short pull back, a fast turn that slows evenly, and a slight rock
into place.

## 2. Why

F02 made the wheel work. It does not yet make it feel like anything — it
glides for four seconds and stops dead, which reads as an animation rather
than as a wheel being spun.

The moment before the result is the whole experience of this game. At a stall,
it is what makes someone watch instead of glancing away, and what makes the
result land when it arrives.

## 3. Actors

| Actor | Role |
|---|---|
| Player | Watches the wheel spin |

## 4. User stories

- As a **player**, I want **the wheel to wind up and settle like a real one**,
  so that **spinning feels like playing rather than waiting**.
- As a **player who finds motion uncomfortable**, I want **the option to skip
  it entirely**, so that **I can still play**.

## 5. Scope

### In scope

- A three-phase spin: wind-up, turn, settle.
- About six seconds end to end.
- Even deceleration throughout.
- The same spin for every player, whatever their system preference (R12, amended).

### Out of scope

- **Pointer ticking over each slice** — considered and not chosen.
- **A celebration on the result** — considered and not chosen.
- **Sound** — considered and not chosen.
- **Near-miss effects** — explicitly rejected; see section 13.
- **A control to turn the animation off in the page** — considered when R12
  was amended and not built. It is on the roadmap as the accessible answer if
  this ever ships to the public.
- Any change to how the prize is drawn or recorded. This feature changes
  nothing but the motion.

## 6. Rules

| # | Rule |
|---|---|
| R1 | A spin runs in three phases: wind-up, turn, settle. |
| R2 | Wind-up turns the wheel backwards by a small fixed angle before the turn begins. |
| R3 | The angle is fixed in degrees, not proportional to the distance to travel, so it stays a flick rather than a reverse lap. |
| R4 | The turn carries the wheel slightly past its resting place. |
| R5 | The settle brings it back to the exact resting place. |
| R6 | The overshoot is smaller than half the narrowest slice a wheel can have, so the pointer never leaves the winning slice during it. |
| R7 | A spin takes about six seconds in total. |
| R8 | Deceleration does not vary with what the wheel is passing (see section 13). |
| R9 | After the wind-up the wheel only ever turns forwards. |
| R10 | The wheel comes to rest on the slice the server drew — unchanged from F02 R13, and still true at every phase boundary. |
| R11 | The result is revealed when the settle finishes, not at the end of the turn. |
| R12 | Every player gets the same spin. The system's reduced-motion preference is **not** consulted. Amended 2026-11-15 — see section 13. |
| R13 | Spin stays disabled for the whole animation, not just the first phase. |
| R14 | A failed spin runs no animation at all. |

## 7. Data model

None. No API change, no database change.

## 8. API surface

Unchanged.

## 9. Interface

Only the motion changes. The page, the pointer, the button and the result
panel are exactly as F02 left them.

### The three phases

| Phase | Movement | About |
|---|---|---|
| Wind-up | Backwards a small fixed angle | 0.45s, eased both ends |
| Turn | Forwards, several whole turns, to just past the resting place | 4.9s, fast then slowing |
| Settle | Back to the resting place | 0.65s, easing out |

Roughly six seconds in total.

### Reduced motion

No special case. The spin is identical for every player.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| The spin request fails | No animation runs; the wheel stays where it is (F02 R17) |
| Spin pressed during any phase | Ignored; the button is disabled throughout |
| A transition is interrupted, for example by a background tab | The phase chain continues from wherever it is; the wheel still finishes at the resting place |
| The wheel has only two slices | The overshoot is well within half a slice; nothing changes |

## 11. Acceptance criteria

- [x] Given a spin, then the wheel first moves backwards, then forwards, then back slightly, in that order.
- [x] Given a spin, then the backwards movement is a small fixed angle regardless of how far the wheel has to travel.
- [x] Given a spin on a wheel of any valid size, then the overshoot keeps the pointer inside the winning slice.
- [x] Given a spin, then from the end of the wind-up onwards the rotation only increases, apart from the settle.
- [x] Given a spin, then the whole animation takes about six seconds.
- [x] Given a spin, then the result appears only after the settle, not after the turn.
- [x] Given a spin, then Spin is disabled for every phase and enabled again afterwards.
- [x] Given a spin, then the wheel finishes on the slice the server drew.
- [x] Given a reduced-motion preference, then the full spin runs exactly as it does for everyone else.
- [x] Given the spin request fails, then no phase runs and the wheel does not move.

## 12. Verification

Built and checked on 2026-11-14. The suite is now 83 PHPUnit tests
(384 assertions), 146 Vitest tests and 84 Playwright tests, all green through
`.	est-all.ps1`.

The phase machine is a plain module with no React in it, so the sequence, the
angles and the timings are asserted directly. Two checks matter most:

- **It still stops where the server said.** Every wheel size from 2 to 12,
  every position in each, run through all three phases, with the resting
  slice checked by inverting the rotation maths.
- **The overshoot never leaves the winning slice.** Same exhaustive sweep,
  applied to the turn phase. Without this the player would see the next prize
  under the pointer for a moment before it rocked back, which looks precisely
  like a rigged correction.

In a real browser the end-to-end suite asserts the wheel is no longer idle
immediately after the press, that the result takes more than five seconds to
appear (which only holds if all three phases actually ran), and that it comes
to rest afterwards. With reduced motion the same spin resolves in under four
seconds with no phase ever leaving idle.

### Measured in a real browser

A spin recorded against the running app, sampling the phase and angle every
50ms:

| Time | Phase | Rotation |
|---|---|---|
| 641ms | wind-up | −12° (backwards, as R2 requires) |
| 1073ms | turn | 2077° (the resting angle plus the 7° overshoot) |
| 6021ms | settle | 2070° (the exact resting angle) |
| 6644ms | idle | 2070° |

The phases themselves took 432ms, 4948ms and 623ms — about six seconds in
all, matching R7. The wheel rested at 2070°, which on a six-slice wheel is
position 1, and the result panel read "5% off your next order", which is
position 1. The lowest angle seen across the whole spin was −12°, confirming
the wind-up actually happens, and the highest was 2077°, confirming the
overshoot and that nothing travelled further than intended.

### Note on the earlier tests

Two F02 tests needed updating rather than fixing. One fired a single
`transitionend`, where a spin now has three. The other read the rotation
immediately after the press and asserted the resting slice — which was true
when the wheel went straight there, but the first thing that happens now is a
wind-up in the opposite direction. It asserts after the animation completes.

## 13. Decisions and risks

**Even deceleration, deliberately (R8).** A wheel that crawls past the grand
prize before settling elsewhere is more exciting and was offered. It was
rejected. It is engineered to make a player believe they nearly won something
they were never going to win, it is a recognised manipulative pattern, and in
some markets a promotional game that does it is regulated. The animation here
carries no information about the result beyond where it stops.

**The reduced-motion exception was removed (R12, amended 2026-11-15).**

As first built, the animation was skipped entirely for anyone whose system
asked for reduced motion. That turned out to be the wrong default, and it was
found the way these things usually are: the wheel did nothing at all on the
machine this is being built on, because Windows animations are switched off
there (`MinAnimate = 0`, which Chrome reports as
`prefers-reduced-motion: reduce`).

The spin is not decoration layered over this game; it is the game. Rendering
a button that visibly does nothing is worse for every player than the motion
is for some. The preference is therefore ignored, and every player gets the
same six-second spin.

This has a real cost, recorded here rather than glossed over:

- A player who set that preference because spinning motion makes them unwell
  now has no way to avoid it. Rotation is a vestibular trigger, and this is a
  large one.
- Accessibility guidance on motion from interaction asks for a mechanism to
  turn it off, not for the motion to be absent. Ignoring the preference
  without offering such a control satisfies neither half.

The accessible resolution is an in-page control that turns the animation off,
with the system preference as its starting position. It was offered and not
taken for this feature; it sits on the roadmap, and it should land before
this is put in front of the public.

**The animation is decorative and nothing depends on it.** The prize is drawn
and recorded on the server before any of this runs (F02 R4). If the animation
broke outright, the player would still be told the correct prize and the
record would still be correct.
