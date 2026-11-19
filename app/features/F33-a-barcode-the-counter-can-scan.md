# F33 — A barcode the counter can scan

| | |
|---|---|
| **ID** | F33 |
| **Interface** | Both |
| **Status** | Agreed |
| **Depends on** | [F12](./F12-multiple-languages.md), [F13](./F13-reward-configuration.md), [F16](./F16-a-code-on-every-win.md), [F28](./F28-the-gift-sheet.md), [F31](./F31-claiming-at-the-counter.md), [P05](./P05-one-app-a-folder-per-game.md) |
| **Amends** | [F28](./F28-the-gift-sheet.md) R13 |
| **Agreed on** | 2026-11-20 |

## 1. Summary

Every reward code a customer is shown becomes a Code 128 barcode with the
code printed under it, and the counter's search box is ready to receive a
scan, so finding a win is one beep instead of eight characters typed.

## 2. Why

[F16](./F16-a-code-on-every-win.md) gave every win a code and said what
would come next: *"if a shop says their counter wants something faster than
eight characters, the answer is the roadmap's QR code, built on top of this
rather than instead of it."* The shop has said so. This is that feature, as a
barcode rather than a QR code, because a counter scanner is what the shop
has.

Eight characters is four seconds and a spelling conversation —
`M` or `N`, `V` or `W` — repeated for every customer who comes back. The
alphabet already removes the worst confusions
([F13](./F13-reward-configuration.md) R18), which is why typing works at
all, but it works at the speed of somebody reading a phone screen upside
down across a counter. A scanner reads the same eight characters in one
movement and cannot misread a `V` as a `W`.

[F31](./F31-claiming-at-the-counter.md) put the claim on the customer's own
page and made a complete code open it directly (R6). That rule was written
for a code typed by hand, and it is exactly the rule a scanner needs: the
scan is a code typed very fast. So most of what makes scanning work is
already built, and what is missing is a barcode to point the scanner at and
a field that is listening.

The code stays readable underneath, in characters, because a scan that fails
must not leave staff stuck. That is not a fallback bolted on afterwards —
printing the characters under the bars is what every barcode on every product
in the shop already does, for the same reason.

## 3. Actors

| Actor | Role |
|---|---|
| **Customer** | Shows the barcode at the counter, from the photo they took of the result screen |
| **Counter staff** | Scans it, or reads the characters under it when the scan will not take |
| **Owner** | Buys the scanner, and is the one who finds out which kind it is (section 14) |

## 4. User stories

- As **counter staff**, I want **to scan the code off a customer's phone**, so
  that **serving somebody who won is as quick as serving somebody who did
  not**.
- As **counter staff**, I want **the code printed under the barcode**, so
  that **a scan that will not take costs me four seconds rather than the
  sale**.
- As **counter staff**, I want **the search box already listening when I open
  the Customers tab**, so that **I can scan without clicking into a field
  first**.
- As a **customer**, I want **a barcode on my result**, so that **the thing I
  photographed is the thing the shop can read**.

## 5. Scope

### In scope

- A Code 128 encoder and an SVG barcode, shared by both games
  ([P05](./P05-one-app-a-folder-per-game.md) R4).
- The barcode on the wheel's result panel, under the label and above the
  characters.
- The gift sheet's codes reachable as barcodes, one gift at a time.
- The Customers module's search box focused on arrival, and a scan's Enter
  opening the one customer it matches.
- What a scanner sends around the code — spaces, tabs, a carriage return —
  ignored.
- The four languages ([F12](./F12-multiple-languages.md)).

### Out of scope

- **A QR code.** Still the roadmap's, and now for a narrower reason: a QR
  code is what a phone camera reads, and the shop is buying a counter
  scanner. The encoder this feature adds does not make one.
- **Printing a slip.** The barcode lives on screens. A printed ticket needs a
  print stylesheet, a printer at the stall, and a decision about what happens
  to the customer who throws the slip away — its own feature, and the one to
  write if section 14 turns out badly.
- **Changing the code.** The alphabet, the length and the grouping are F13
  R18's and F16 R4's, untouched. A code that fits a barcode better but reads
  worse across a counter is a worse code.
- **Code expiry.** Still unowned, as F16 and F31 both say.
- **Scanning in the Spins module.** Its filter still accepts a code typed by
  hand (F16 R8). The counter's screen is the customer's page
  ([F31](./F31-claiming-at-the-counter.md)), and that is the one that learns
  to listen.
- **One barcode for a whole visit.** Tempting for a gift sheet of six, and it
  needs an identifier that does not exist — see section 13.
- **Claiming by scan.** A scan finds the win. Handing it over stays a
  deliberate press (F31 R18).

## 6. Rules

### The barcode

| # | Rule |
|---|---|
| R1 | Wherever a customer is shown a reward code, they are shown a **Code 128** barcode of it as well. Nothing about the code changes: eight characters, two groups of four, F13 R18's alphabet. |
| R2 | The barcode encodes the eight characters **without the hyphen**. The hyphen is grouping for human eyes; a scanner reads data, and `CodeGenerator::normalise` already treats a hyphen as noise, so a scanned code and a typed code arrive at the same string. |
| R3 | The code is printed in readable characters **immediately under the bars**, hyphen included. A scan that will not take has to leave staff something to type. |
| R4 | Code set B, a start symbol, a modulo-103 check symbol and a stop symbol. The check symbol is always computed: a scanner that cannot verify what it read reports nothing, which is what we want it to do rather than report a code that is nearly right. |
| R5 | The barcode is inline SVG. No image request, no canvas, sharp at any zoom, and nothing new for the player page to load. |
| R6 | Dark bars on a light tile, **whatever the theme**. The themes are dark ([F06](./F06-theme-scenes.md)) and a scanner wants the contrast of ink on paper, so the tile is the one thing on the player page that does not take its colours from the theme. |
| R7 | A quiet zone of at least ten module widths each side of the symbol, inside the tile. Without it the scanner reads the edge of the tile as a bar. |
| R8 | At 375px the module is at least **1.8px** wide and the bars at least 48px tall. Those are the two numbers a scan actually depends on, which is why they are rules and not styling. The width is stated below in the unit that governs it. |
| R9 | The SVG has an accessible name that is the code, so a screen reader says the code instead of announcing an image. |
| R10 | A code the encoder cannot encode renders **nothing** — no bars, no partial symbol — and the characters stay. An issued code cannot contain such a character (R1), so this is about a bug, and a barcode that is wrong is worse than a barcode that is absent. |

### The wheel's result panel

| # | Rule |
|---|---|
| R11 | Where the result panel shows a code (F16 R6), the order is the label, then the barcode, then the characters (R3). |
| R12 | The panel still fits 375×812 with no scrolling — the repository's standing rule for the player page. The prize and the button come first: if something has to give, it is the height of the bars, down to R8's floor. |
| R13 | A losing panel gets no barcode, for F16 R2's reason — there is nothing to scan. |
| R14 | A win recorded before F16, which has no code (F16 R5), gets no barcode either. There is nothing to encode. |

### The gift sheet

| # | Rule |
|---|---|
| R15 | The sheet's list is unchanged: up to six gifts, each with its name and its code, no scrolling (F28 R3, R13). |
| R16 | A gift on the list can be **opened**, and opening it replaces the list with that one gift: its name, its barcode, its code, and a control back to the list. **This amends F28 R13**, which described a list and nothing else. |
| R17 | Six barcodes are not an option. Shrunk to fit a phone they are six barcodes that do not scan, which is strictly worse than six codes that can be typed — and one at a time is how the counter claims them anyway (F28 section 3). |
| R18 | The one-gift view fits 375×812 with no scrolling, and gives the bars the full width of the panel. A bigger barcode is a barcode that scans. |
| R19 | Going back leaves the sheet as it was. Nothing is re-issued, nothing re-fetched and no code changes: F28 R9 mints the codes once, by one request, and this feature does not give anybody a second way to ask. |

### The counter

| # | Rule |
|---|---|
| R20 | The Customers module's search box takes focus when the module opens, so a scan has somewhere to land. A scanner types into whatever is focused; if that is nothing, the scan is lost silently. |
| R21 | A scan is the characters followed by Enter. Enter opens the single matching customer, exactly as a complete code typed by hand does (F31 R6), and never reloads the page. |
| R22 | Whatever the scanner sends around the code — a leading or trailing space, a tab, a carriage return, a line feed — is ignored. Scanners ship configured differently and the shop that buys one is not the shop that configures it. |
| R23 | A scan that matches nothing says so and **keeps what was scanned in the box**, so staff can read what the scanner actually made of it. A field that blanks itself on a bad scan hides the one clue there was. |
| R24 | A scan of a code that exists opens that customer's page with the win on it, collected or not (F31 R8). The scan finds; it does not claim. |

### Everywhere

| # | Rule |
|---|---|
| R25 | The encoder and the barcode component are shared code, not a game's: both games show codes, so by P05 R4 they live outside both game folders. |
| R26 | Every label this feature adds exists in English, French, Chinese and Vietnamese ([F12](./F12-multiple-languages.md)). |

## 7. Data model

Nothing. The code is already issued, already stored and already in both
payloads; this feature draws it differently and listens for it better.

| Entity | Field | Type | Notes |
|---|---|---|---|
| — | — | — | No column is added, changed or dropped |

## 8. API surface

Nothing. `GET /api/spin`'s result and `POST /api/sheet`'s gifts already carry
`code`, and `/api/admin/players?search=` already accepts one (F31).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| — | — | — | No endpoint is added or changed |

A barcode endpoint was the obvious alternative and is in section 13.

**Corrected while building: R8 said 2px, and the panel has 1.83px.** The
result panel is `min(17rem, 100%)` — 272px — and it is narrow on purpose:
it floats over the wheel so the rim, the pointer and the slices either side
of it stay visible, which is how a player sees *where* it stopped as well as
what it stopped on. Spending the panel's own padding on the barcode gives
the symbol 262px, and 262 over 143 modules is 1.83px. Two would need a
286px panel, and widening it to cover the wheel is a worse trade than a
slightly narrower bar.

The number that governs a scan is not CSS pixels anyway. A phone is about
65mm across 375 of them, so 1.83px is roughly **0.32mm — about 12.5 mil**,
where an entry-level counter imager is specified down to 4 or 5 mil. The
rule now states the measured figure, and the real floor it clears.

## 9. Interface

### Player view — the wheel

The result panel gains one tile between the label and the characters:

```
            YOU WON
         Free coffee

          YOUR CODE
   ┌───────────────────────┐
   │ ║│║││║│║││║│║│║││║│║  │   ← dark bars on light, R6
   └───────────────────────┘
          M9PX-K4T7            ← R3, unchanged in face and spacing

   Show this code at the counter
```

The tile is as wide as the panel's text column and about 56px of bars. The
characters keep the monospace face and the letter spacing F16 gave them —
they are still what somebody reads aloud.

### Player view — the gift sheet

The list is what it was. A gift is a control now, and pressing it swaps the
panel for one gift:

```
   Your gifts                     ← list (F28 R13, unchanged)
   10% off            M9PX-K4T7
   Free coffee        T3WY-H8NQ
   …

   ── pressing one ──▶

   Free coffee                    ← one gift (R16, R18)
   ┌─────────────────────────┐
   │ ║│║││║│║││║│║│║││║│║│║  │
   └─────────────────────────┘
          T3WY-H8NQ
   ‹ All my gifts
```

### Admin view

No new screen. The Customers module's search box is focused when the module
opens (R20) and already does the rest: F31 R6 opens the one match, and
`CodeGenerator::normalise` already copes with case, spaces and the hyphen.
What is new is Enter (R21), the scanner's own padding (R22) and keeping a
failed scan on screen (R23).

### Responsive behaviour

| Width | Behaviour |
|---|---|
| 375px | R8's floor. Measured: 1.83px modules and 48px bars in the wheel's panel, which is the narrowest place the barcode appears; the sheet's one-gift view has the page's full width and runs about 2.3px. |
| 768px | The tile stops growing with the panel — a barcode wider than a scanner's window is harder to read, not easier. Modules 3px. |
| 1280px | As 768px. This is a phone feature on a counter; the desktop case is an admin looking at the same page. |

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| The reward has no code (a loss, or a pre-F16 win) | No tile. The panel is exactly what F16 and F17 left (R13, R14) |
| A code with a character outside the alphabet | Nothing renders; the characters stay (R10) |
| The scan matches no customer | F31's "nothing found" message, and the scanned text stays in the box (R23) |
| The scan matches several customers | F31 R5's list, unchanged. Eight characters cannot match two wins, but a scanner pointed at the wrong label can send anything |
| Enter pressed on an empty box | Nothing. Not an error, and not a reason to clear the list |
| A scan arrives before the customer list has loaded | The text sits in the box and the search runs when the data is there. A scanner is faster than a network and must not be the thing that loses the code |

## 11. Acceptance criteria

- [x] Given a code of eight characters, when it is encoded, then the symbol is
      a start symbol, eight data symbols, a modulo-103 check symbol and a
      stop symbol.
- [x] Given every symbol in the table, then each is eleven modules of six
      elements with an even bar parity — the standard's own invariant, which
      a typo in the table breaks.
- [x] Given a known code, when it is encoded, then the check symbol matches
      the value computed by hand from the standard.
- [x] Given a code containing a hyphen, when it is encoded, then the hyphen is
      not in the symbol (R2).
- [x] Given a code with a character no code can contain, when it is encoded,
      then nothing renders and the characters remain (R10).
- [x] Given a winning result with a code, then the panel shows the barcode
      above the characters (R11).
- [x] Given a losing result, then the panel shows no barcode (R13).
- [x] Given a win with no code, then the panel shows no barcode (R14).
- [x] Given the barcode on any of the six themes, then its bars are dark on a
      light tile (R6).
- [x] Given the barcode, then its accessible name is the code (R9).
- [x] Given a sheet of six gifts, then the list is the list F28 R13
      describes, with no barcodes on it (R15).
- [x] Given a sheet of six gifts, when one is opened, then the panel shows
      that gift alone with its barcode and its code (R16).
- [x] Given an opened gift, when the back control is pressed, then the list
      returns with the same six codes and no request was made (R19).
- [x] Given the Customers module opens, then the search box has focus (R20).
- [x] Given a complete code typed into the focused box followed by Enter,
      then that customer's page opens (R21).
- [x] Given a code arriving with a trailing carriage return and a leading
      space, then it is treated as the same code (R22).
- [x] Given a code that matches nothing, then the message says so and the box
      still holds what was scanned (R23).
- [x] Given a scanned code whose win is already collected, then the page opens
      and shows it as collected; nothing is claimed by the scan (R24).
- [ ] Given the wheel's result panel at 375px, then it needs no scrolling to
      reach the prize, the barcode or the button (R12). The end-to-end suite
      checks exactly this and is the user's to run (`CLAUDE.md`).
- [ ] Given the one-gift view at 375px, then it needs no scrolling (R18).
- [x] Every label this feature adds exists in all four languages (R26).
- [x] The four fast suites pass.
- [ ] **Checked by hand with the shop's own scanner**: a barcode on a phone
      screen, scanned into the Customers box, opens the right customer. No
      test in this repository can answer this one — section 14.

## 12. Verification

`npm test` — 916 tests. `code128.test.ts` carries R2, R4 and R10, and 214 of
those tests are the symbol table checked against the standard's own
invariants: eleven modules, six elements and an even bar parity for every one
of the 107 symbols, with the stop symbol's thirteen stated as the exception
it is. That is the test the decision not to install a barcode library rests
on, together with a check symbol worked out by hand in the test's own comment
— 1450 modulo 103 is 8 — so the arithmetic is on the page rather than taken
from the code it is checking.

`Barcode.test.tsx` carries R5 to R10: the viewBox, the stretch, 34 bars, the
accessible name, black on white, and the ten modules of quiet each side
measured off the first and last bar. `PlayerPage.test.tsx` carries R11 to R14
— including the panel's order asserted as a list, label then bars then
characters, so moving the characters above the barcode fails a test that says
why they are below it. `SheetPage.test.tsx` carries R15 to R19: no barcodes
on the list, one gift opening alone, the hand-over kept off that screen, and
going back without a second request to the server. `PlayersModule.test.tsx`
carries R20 to R23, and the Enter test presses Enter without clicking
anything first, so it only passes while R20's focus holds.

R24 — a scan finds and does not claim — rests on two things already true: the
navigation test above ends on the customer's page, and F31's
`CustomerModule.test.tsx` already proves a collected win renders in the
collected section and that claiming happens on the hand-over button. There is
no claim request anywhere on the scan path to write a new test against.

`npm run typecheck` and `npm run lint` are clean; `php vendor/bin/phpunit` is
untouched by this feature and still passes, which is the point of a feature
that adds no column and no endpoint.

**Measured, not assumed.** The barcode's geometry was rendered from the real
encoder at a 375×812 viewport and measured in the browser: 262px of symbol
over 143 modules, 1.83px per module, 48px bars, in a panel 272px wide and
243px tall. That measurement is what corrected R8 above. It was a
reconstruction of the panel's widths rather than the page itself, because the
development database currently holds no game to play.

**Not seen in the running app.** R12 and R18 — no scrolling at 375px — are
the end-to-end suite's checks, and that suite is the user's to run
(`CLAUDE.md`). The panel is absolutely positioned and centred, so it cannot
lengthen the document, and at 243px it has room to spare in an 812px window;
but that is reasoning, not a pass, and both criteria stay unticked until
somebody runs it.

**And the one nothing here can answer**: whether the shop's scanner reads a
barcode off a phone screen at all. Section 14.

## 13. Decisions and risks

**Code 128 rather than Code 39.** Both encode this alphabet. Code 39 is
famously forgiving and self-checking, and it needs roughly twice the width
per character — for eight characters that is the difference between a barcode
that fits a 375px panel at a comfortable module width and one that has to be
squeezed to fit. Squeezing is the thing that stops a barcode scanning, so the
narrower symbology is the safer one here. Code 128's check symbol does the
job Code 39's self-checking does.

**Rather than a QR code.** A QR code is better on a screen, at any angle,
and is what a phone reads. It is also invisible to a 1D scanner, and a 1D
scanner is what the shop is buying. The roadmap keeps the QR code; this
feature does not pretend to be it.

**No barcode library.** The frontend has four runtime dependencies — axios,
React, React DOM and the router — and adding a fifth to draw thirty-two
symbols is a poor trade when the symbols are a closed, published table. The
risk of writing it by hand is a typo in that table, and the standard gives us
the test for exactly that: every symbol is eleven modules in six elements
with an even bar parity, so a mistyped entry fails the suite rather than
failing a customer. If the first real scan says otherwise, swapping in
`bwip-js` is a one-file change, and that is the honest escape hatch.

**Drawn in the browser, not served by the backend.** An endpoint returning a
PNG would have put the barcode in one place and made it printable later. It
also puts a network request between a customer and the thing they are about
to photograph, caches badly behind a code that must never be shown to the
wrong person, and would be the second place that knows what a code looks
like. The code is already in the payload; the panel can draw it.

**Risk, and the one that matters: a laser scanner cannot read a screen.** The
shop's scanner was described as a laser one, and a true flying-spot laser
needs the contrast of ink on paper — pointed at a lit phone it reads nothing.
Most units sold today as "laser scanners" are CCD linear imagers, which read
screens perfectly well, and the two are hard to tell apart from the outside.
This feature is built for the imager case, and the characters under the bars
(R3) are what makes it harmless if the shop's unit turns out to be the other
kind: the counter is no slower than it is today, and the barcode starts
working the day a different scanner arrives. Section 14 is how to find out in
a minute, and **printing a slip** is the feature to write if the answer is
bad.

**The gift sheet opens one gift rather than showing six barcodes.** Six
scannable barcodes do not fit a phone — that is arithmetic, not taste, and
F28 R3 chose six on exactly this kind of measurement. A sheet of six
unscannable barcodes would be a feature that looks finished and fails at the
counter.

**Rather than one barcode for the whole visit.** Scan once, see all six: it
is the better counter experience and it needs an identifier that does not
exist. Codes are per spin (F16 R3) and a sheet's rows are grouped after the
fact by `sheetId` (F31). Minting a visit code means a new column, a new
uniqueness guarantee, and a decision about what it means when one of its six
is collected and five are not. Worth its own feature if a shop running gift
sheets asks for it.

**The characters stay, and that was the shop's instruction.** They are also
what every barcode in a supermarket does. Nothing here is a reason to remove
them later.

## 14. Open questions

- **Is the shop's scanner a true laser or a CCD imager?** Answerable in a
  minute and by nobody but the shop: show any barcode on a phone at full
  brightness — a product barcode photographed off a packet will do — and
  point the scanner at it. If it beeps, this feature works as written. If it
  will not read a screen however the phone is held, the barcode is for a
  scanner the shop does not own yet, and the next feature is a printed slip.
