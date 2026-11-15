# F06 — Theme scenes

| | |
|---|---|
| **ID** | F06 |
| **Status** | Done |
| **Interface** | Player |
| **Depends on** | [F04](./F04-branding-and-themes.md) |
| **Agreed on** | 2026-11-15 |

## 1. Summary

Turn each theme from a handful of flat colours into a complete designed
look: a layered background scene, a framed wheel, and matching surfaces and
type — built entirely from CSS and inline SVG.

## 2. Why

F04 delivered what it promised and it is not enough. Swapping a background
colour makes the page look like the same page in a different shade, which is
not what a shop wants on a stall in Black Friday week.

The verdict was blunt and fair: *"I only see a background colour changed,
it's too poor."*

## 3. Actors

| Actor | Role |
|---|---|
| Player | Sees the themed game, usually on a phone, often outdoors |
| Admin | Picks the theme; sees no change to their own screens |

## 4. User stories

- As an **admin**, I want **each theme to look properly designed**, so that
  **the game looks like a campaign rather than a form**.
- As a **player**, I want **the page to feel like the occasion**, so that
  **playing feels like part of the event**.
- As a **player on a cheap phone**, I want **the page to stay smooth**, so
  that **the wheel does not stutter while it spins**.

## 5. Scope

### In scope

- A background scene per theme: gradients, glows, vignettes, SVG motifs.
- Treatment of the wheel's surround, the result panel, the button and the
  heading, per theme.
- Ambient decorative motion where it suits the theme.
- Contrast guarantees extended to cover every new surface.

### Out of scope

- **Photographs.** Nothing is downloaded and no image file is shipped. The
  artwork is generated; see section 13.
- **Per-campaign artwork or a theme editor** — roadmap.
- **Theming the admin page** — unchanged from F04 R27.
- **Any change to the wheel's slice colours** — F01 R14 and F04 R10 stand.
- **Any change to how the spin behaves** — F02 and F03 stand.

## 6. Rules

| # | Rule |
|---|---|
| R1 | Each of the six themes has a background scene that is recognisably that occasion, not merely a different colour. |
| R2 | The scene is generated from CSS and inline SVG. No image files, no downloads, no network requests at runtime. |
| R3 | No new runtime dependency is added. |
| R4 | The treatment covers the wheel surround, the result panel, the button and the heading, not the background alone. |
| R5 | The wheel's slice colours are identical on every theme. |
| R6 | Every text colour clears WCAG AA (4.5:1) against the surface actually behind it. Where text sits over a scene, a scrim makes the effective surface predictable, and the contrast test is computed against that effective colour. |
| R7 | Any new colour pair introduced is added to the checked set, so it cannot escape the contrast test. |
| R8 | The admin page is unaffected. |
| R9 | Decorative background motion stops when the system asks for reduced motion. The spin itself still ignores that preference (F03 R12). |
| R10 | Background effects never sit above the wheel, capture pointer events, or shift layout while the wheel turns. |
| R11 | Effects use transform and opacity only — no canvas, no JavaScript animation loop, no expensive filters. |
| R12 | No horizontal scroll at 375px; the layout holds at 375, 768 and 1280. |
| R13 | Every existing test id keeps working, so the spin tests and the e2e suite continue to address the same elements. |
| R14 | No text is ever printed on the scene. Every word sits on the card, the button or the result panel, each an opaque token (F04 R28). This is how R6 is met: the scrim is a solid surface, not a wash. **Added while building.** |
| R15 | Ambient animation is declared only inside a `prefers-reduced-motion: no-preference` block, so R9 holds by construction rather than by remembering an override. A test reads the stylesheet and fails if one escapes. **Added while building.** |
| R16 | A scene must still read with every animation stopped. Nothing a theme depends on may exist only in motion. **Added while building.** |

## 7. Data model

None. No API change, no database change. A theme is still a single stored
string.

## 8. API surface

Unchanged.

## 9. Interface

Per theme, a complete look rather than a palette swap.

### The page

Three layers, the same on every theme:

1. **The page colour**, painted flat on the screen element exactly as F04
   left it. The scene is a layer *above* it, not a replacement, so the page
   still has one knowable colour — which is what F04's end-to-end check of
   each theme reads.
2. **The scene**, `aria-hidden`, `pointer-events: none`, clipped to the
   page and stacked below the content.
3. **The card**, opaque, holding the header, the wheel, the button and the
   result. Everything readable is on it (R14).

The wheel sits in a bezel with a rim in the theme's colour and a glow
behind it, so it is mounted in the scene rather than floating on it.

### The scenes as built

| Theme | The scene | Moves |
|---|---|---|
| Plain | Paper and ink: warm white light from above, a slate wash into the corners, a faint studio grid, one graphite hairline | Nothing. Stillness is the idea |
| Black Friday | Lit signage at night: one amber light source in a black room, two hard floor streaks, a heavy vignette | Hazard stripes crawling behind the card |
| Christmas | A green night: a string of lights overhead, a dark pine horizon, lamplight from below | Two layers of snow, at two speeds; the bulbs twinkle |
| New Year | Midnight and gold leaf, a star field, three fireworks across the top | The bursts; the stars breathe |
| Halloween | A full moon top right, bats under it, a cobweb in the corner, a pumpkin glow from off the bottom edge | The bats bob |
| Happy Birthday | Confetti and three balloons on white, warm pink deepening to the floor | Confetti drifts down; the balloons bob |

The heading takes a system font stack per theme — a serif for Christmas, an
italic serif for New Year, uppercase Palatino for Halloween, heavy
uppercase for Black Friday. Nothing is downloaded.

### Responsive behaviour

The scene adapts rather than being cropped: at 375px it must not push the
wheel or the Spin button off screen, and the wheel stays the focus at every
width.

On a phone the card fills nearly the whole width, so the strip above it is
most of the scene the player actually sees. The motif that names each
theme — the garland, the moon, the fireworks, the balloons — is placed
there deliberately. A firework a third of the way down the page tested
beautifully on a desktop and was invisible on a phone.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| Unrecognised theme stored | Falls back to plain, scene and all (F04 R8) |
| Reduced motion preferred | Ambient motion stops; the spin still runs (F03 R12) |
| A low-powered device | No stutter during the spin; effects are cheap by construction (R11) |

## 11. Acceptance criteria

- [x] Given each of the six themes, then the player page shows a scene recognisable as that occasion, not just a different background colour.
- [x] Given any theme, then the wheel's slice colours are unchanged.
- [x] Given every theme, then every text colour clears 4.5:1 against the surface behind it, including any surface added by this feature.
- [x] Given a new colour pair introduced by this feature, then it is covered by the contrast test.
- [x] Given a reduced-motion preference, then ambient background motion stops and the spin still runs in full.
- [x] Given a spin in progress, then no background effect overlaps the wheel, blocks a click, or shifts the layout.
- [x] Given the player page at 375px on every theme, then there is no horizontal scroll.
- [x] Given the admin page on any theme, then it is unthemed.
- [x] Given the existing test suite, then every test id still resolves and the suite passes.
- [x] Given no network, then every theme renders completely.

## 12. Verification

Built on 2026-11-15. Vitest went from 210 tests to 276, all green, with
`tsc -b` clean and no new lint warnings. The backend was not touched, so
PHPUnit and Playwright were not re-run (P01 R10 — end-to-end is opt-in).

All six themes were looked at in a real browser at 375, 768 and 1280, on
the loading state, the resting wheel, a spin in progress and the result
panel.

Four checks did real work rather than confirming the obvious:

- **Contrast across a gradient, not just at its ends.** The card and the
  button are two-stop gradients, so a test interpolates each one and
  re-checks every foreground at the quarter, half and three-quarter marks.
  It caught Birthday's button: the natural lighter stop was pink-600, where
  white is 4.59:1. The gradient stops short of it, at 5.76:1.
- **A new text colour cannot escape the check.** A second test asserts that
  every token whose name reads like text appears in the checked pair list.
  It is the guard that keeps the first test honest a year from now. It is
  what forced `danger` to become a token: the hard-coded rose-600 error
  text was 3.5:1 on the dark cards and had been since F04.
- **The reduced-motion promise is read off the stylesheet.** A test parses
  `index.css`, removes every `prefers-reduced-motion: no-preference` block,
  and fails if any `animation` declaration is left behind (R15). It also
  checks that every `scene-*` class a scene uses has a rule, and that the
  keyframes animate nothing but `transform` and `opacity` (R11).
- **The scene is behind the content in the DOM, not only in z-index.** A
  layer painted after the wheel would sit on top of it for the whole six
  seconds it turns, whatever its z-index says once a stacking context gets
  involved. The test asserts the order.

Also verified, by hand in the browser: no horizontal scroll at 375, 768 or
1280 on any theme; a click at the centre of the Spin button lands on the
button and not on a decorative layer; the admin page has no scene, no
`player-screen` and no `data-theme` element at all.

**The reduced-motion path was the easy one to verify, by accident.** The
browser used for the visual pass reports `prefers-reduced-motion: reduce`,
so every screenshot taken is the stopped scene — which is the stronger
check, since R16 is the rule that a scene must still read without motion.
The moving state was then confirmed separately by injecting the same
animation rules without the guard and watching the snow, the stripes and
the confetti move.

## 13. Decisions and risks

**Generated artwork rather than photographs.** The request was for background
photos; the admin chose generated artwork once the trade-offs were laid out.
The reasons it is the better answer here:

- a photograph shipped in a commercial promotion carries a licence, and a
  generic stock image usually looks cheaper than good generated art;
- a photo is hundreds of kilobytes to several megabytes, loaded on a phone
  on stall wifi, where the wheel is the thing that needs to arrive quickly;
- text contrast over a photograph is unpredictable, and the whole theme
  system rests on a contrast guarantee that is actually tested.

If real photography is wanted later — the shop's own, not stock — the honest
way is per-theme background image support with a scrim, which is a separate
feature.

**Contrast over a scene is the real risk.** A flat colour is easy to test; a
gradient with motifs over it is not. The rule is that text never sits
directly on the scene — a scrim gives it a known surface, and that surface is
what the test measures (R6). A scene that cannot meet this must be changed,
not excused.

*As built:* the scrim became an opaque card rather than a wash, which is
the strongest version of R6 — the colour under every letter is a token, and
it is the token the test measures. Where the card and the button are
gradients, both ends are tokens and the test walks between them.

The cost is a layout decision taken for a test: the content is a card on a
page rather than text on a page. That is also why the scene is only really
seen in the strips above and below the card on a phone, and why the motifs
live there.

The one translucent thing inside the card is the glow around the wheel. It
is held to 12px of overhang — half the gap to the elements either side — so
that it cannot reach a glyph. That is a stated limit rather than a hope:
a larger, softer halo looked better and was cut for this reason.

**Ambient motion is decorative, so it yields (R9).** This is the opposite of
the decision in F03, where the spin ignores the reduced-motion preference
because it is the function of the game. Falling snow is not the function of
anything, so it stops.

*As built:* every ambient animation is declared inside a single
`no-preference` block (R15), so with the preference set the rules never
apply at all — there is no override to forget. Anything that animates
opacity therefore carries a sensible static value too; the fireworks rest
as faint bursts rather than frozen at full brightness mid-expansion.

**Soft light comes from gradients, never from `filter: blur()`.** A blurred
layer repaints every frame, and these scenes animate for as long as the
page is open, on whatever phone turns up at the stall — at the same time as
a six-second spin. Radial gradients rasterise once. A test asserts no scene
declares a blur.

**Tiled fields loop by sliding exactly one tile.** The snow and the confetti
are one painted layer each rather than a DOM node per flake, and the slide
distance is a per-layer custom property equal to the tile height, so the
loop is invisible. Getting that wrong is the classic seam, and it is why
the distance is not baked into the keyframes.

**No new dependency was needed (R3).** Nothing was installed. The only
configuration change was adding `node` to the app's TypeScript `types`, so
that the test which reads `index.css` off disk compiles — Vitest stubs CSS
imports out, so `?raw` comes back empty and the file has to be read
directly.
