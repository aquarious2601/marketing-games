# F34 — The customer's own card

| | |
|---|---|
| **ID** | F34 |
| **Interface** | Both |
| **Status** | Agreed |
| **Depends on** | [F08](./F08-player-identification.md), [F12](./F12-multiple-languages.md), [F13](./F13-reward-configuration.md), [F16](./F16-a-code-on-every-win.md), [F31](./F31-claiming-at-the-counter.md), [F33](./F33-a-barcode-the-counter-can-scan.md), [P02](./P02-database-upgrades.md) |
| **Amends** | [F08](./F08-player-identification.md) §9 (a step after registering) |
| **Agreed on** | 2026-11-20 |

## 1. Summary

Every customer gets a code of their own, shown once as a barcode the moment
they register so they can photograph it, and staff can find them by scanning
that photo instead of asking for a phone number.

## 2. Why

A customer walks away from the stall with nothing. The game runs on the
shop's tablet, the screen is wiped for the next person
([F10](./F10-hand-over-to-the-next-player.md)), and what they are left
holding is a phone number they have to recite at the counter and a reward
code they may or may not have written down. [F33](./F33-a-barcode-the-counter-can-scan.md)
gave the win a barcode, and immediately ran into the same wall: a barcode on
a screen that is about to be wiped is a barcode nobody keeps.

This is the smallest thing that gives them something to keep. One screen,
once, at the moment they are already holding their phone and already being
asked for their details — photograph this. From then on the photo is how the
counter finds them, and a scan replaces the part of the conversation that
goes *"zero nine one two…", "sorry, again?"*.

It is also the step before the wallet. A pass in Apple or Google Wallet is a
real project — issuer accounts, signing certificates, an approval queue —
and it needs a stable customer code to put on the front of it. That code is
what this feature creates, so none of it is thrown away when the wallet is
built: the pass will carry this barcode.

## 3. Actors

| Actor | Role |
|---|---|
| **Customer** | Registers, photographs their card, shows the photo at the counter |
| **Counter staff** | Scans the photo, or finds them by number as they do today |
| **Owner** | Nothing new. The card needs no setting and no decision |

## 4. User stories

- As a **customer**, I want **a card of my own to photograph**, so that **I
  can be found at the counter without reciting my phone number**.
- As **counter staff**, I want **to scan a customer's card**, so that **I get
  the right person first time, with no spelling and no typing**.
- As **counter staff**, I want **their card on their page in the admin**, so
  that **somebody who lost the photo can still be given it**.
- As a **customer**, I want **the barcode to give nothing away**, so that **a
  photo on my phone is not a picture of my phone number**.

## 5. Scope

### In scope

- A code of their own for every customer, issued at registration and
  backfilled for everybody who already exists.
- One screen after the registration form: the barcode, the code, and an
  instruction to photograph it.
- The Customers filter accepting a customer code, and a complete one opening
  that customer.
- The card on the customer's page in the admin, for somebody who lost it.
- The four languages.

### Out of scope

- **Apple Wallet and Google Wallet.** Deferred deliberately, not forgotten —
  §2 says why, and this feature is what the pass will carry.
- **Points, stamps and anything a card might count.** The application counts
  plays and the rewards they win; a stamp scheme is earning, spending,
  expiry, and a control for staff to add one. It is its own feature and
  really two.
- **Identifying at the stall by card.** The phone number stays the way a game
  is started. The stall has no scanner, so a customer would be typing ten
  characters where they type a number they know by heart (R20).
- **Re-showing the card at the stall.** The reason is
  [F28](./F28-the-gift-sheet.md) R18's and
  [F23](./F23-a-daily-spin-limit.md) R15's: anybody may type anybody's number
  into a stall phone. Recovery is R17's, over a counter, with a person
  standing there.
- **Printing it.** Nothing in the application prints yet, and a card on a
  phone is the one a customer still has next month.
- **Changing the reward code.** F13 R18 and F16 R4 stand untouched.

## 6. Rules

### The code

| # | Rule |
|---|---|
| R1 | Every customer has a code of their own, issued when the customer record is created and in the same transaction ([F08](./F08-player-identification.md) R6). |
| R2 | **Ten characters in two groups of five** — `XXXXX-XXXXX` — from F13 R18's alphabet, so no `O`/`0` and no `I`/`L`/`1`. Ten rather than eight so that a customer code and a reward code can never be the same string, and so staff can see at a glance which of the two they are holding. |
| R3 | Unique across every customer, guaranteed by a unique index and not by the generator — [F16](./F16-a-code-on-every-win.md) R3's reasoning, unchanged. |
| R4 | Every customer who already exists is given one by the upgrade ([P02](./P02-database-upgrades.md)), so "find them by their card" is true of the whole list rather than only of people who registered after today. |
| R5 | The code is **not a secret and not a credential**. It names a customer to staff who are already signed in, and grants nothing at all to whoever holds it. It is random anyway, because a sequential number would tell every customer how many the shop has. |
| R6 | Nothing re-issues a code. A customer keeps the one they were given, so the photo they took in January still works in June. |

### Showing it

| # | Rule |
|---|---|
| R7 | A customer the registration form has **just created** is shown their card: the barcode ([F33](./F33-a-barcode-the-counter-can-scan.md)), the code in characters beneath it, and one line telling them to photograph it. |
| R8 | **Only on creation.** A returning customer who types their number is shown nothing, for F23 R15's and F28 R18's reason: anybody may type anybody's number into a stall phone, and a screen that hands over a stranger's card on demand is worse than a customer who has to recite a number. |
| R9 | The **server** decides which of those two happened. Registering may return somebody who already existed (F08 R7), so the response carries the card only when that request created them — the page cannot ask for a card and cannot show one by mistake. |
| R10 | The card is a step on the way to the game, not a detour: one control continues, and nothing shows it again in that session. |
| R11 | The screen fits 375×812 with no scrolling, with the barcode no smaller than F33 R8's floor. |
| R12 | A customer who does not photograph it has lost nothing they had before: their phone number identifies them exactly as it does today (R20). |

### Finding them by it

| # | Rule |
|---|---|
| R13 | The Customers filter accepts a customer code as well as a phone number and a reward code (F31 R2, F16 R8). One box still, because staff do not know which of the three they are about to be handed. |
| R14 | A complete customer code that matched exactly one customer opens that customer's page, as a complete reward code does (F31 R6). |
| R15 | Case, spaces and the hyphen are noise, as they are for a reward code (F16 R12) and for a scan (F33 R22). |
| R16 | A code that matches nobody says so and keeps what was scanned in the box (F33 R23). |
| R17 | The customer's page in the admin shows their card — the barcode and the code — so staff can show it to somebody who lost the photo. That is the whole recovery path, and the check on it is that a person is standing at the counter. |
| R18 | A card belongs to one customer and appears on that customer's page. Nothing lists cards, and the customer list does not show them: a screen full of other people's cards is a screen worth photographing. |

### Everywhere

| # | Rule |
|---|---|
| R19 | Every label this feature adds exists in English, French, Chinese and Vietnamese ([F12](./F12-multiple-languages.md)). |
| R20 | How a game is started does not change. The phone number identifies a player at the stall; this card is for the counter. |

## 7. Data model

| Entity | Field | Type | Notes |
|---|---|---|---|
| `player` | `code` | `VARCHAR(11)` | Ten characters and one hyphen. Unique, not null once the upgrade has run (R3, R4) |

The upgrade adds it nullable, fills every existing row with a fresh code, and
only then makes it not null and unique — three ordered steps, each of which
asks the database what it already has, as P02 requires. The fill is a loop in
PHP rather than one statement, because the codes have to come from the same
generator the application uses; it is idempotent because it only touches rows
whose code is still null.

## 8. API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/player/register` | public | Unchanged, but the response gains `card` |
| `GET` | `/api/admin/players` | admin | `search` accepts a customer code (R13) |
| `GET` | `/api/admin/players/{id}` | admin | The response gains `card` (R17) |

`POST /api/player/register` answers with the card **only** when it created
the customer (R9):

```json
{
  "player": { "firstName": "Anh", "phone": "0912345678" },
  "spinsLeft": 1,
  "card": "M9PXK-4T7VH"
}
```

and `"card": null` for somebody who already existed.

## 9. Interface

### Player view

One screen between the registration form and the game:

```
        Korean Cosmetics

          YOUR CARD
   ┌───────────────────────────┐
   │ ║│║││║│║││║│║│║││║│║│║│║  │
   └───────────────────────────┘
         M9PXK-4T7VH

   Take a photo of this. Show it
   at the counter and we will find
   you straight away.

        [ Continue ]
```

The barcode is the full width of the panel, which at 375px is a module of
about 2px — above F33 R8's floor, and the reason R2 chose ten characters
rather than twelve (§13).

### Admin view

On the customer's own page, under who they are and before their wins: the
same barcode and code, with a line saying it is theirs. Nothing on the list
(R18).

### Responsive behaviour

| Width | Behaviour |
|---|---|
| 375px | The card screen fits with no scrolling (R11); the barcode spans the panel |
| 768px | The barcode stops growing — a barcode wider than a scanner's window is harder to read, not easier |
| 1280px | As 768px |

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| Registering returned somebody who already existed | No card screen; straight to the game (R8, R9) |
| A customer from before this feature | Has a code, given by the upgrade (R4). They were never shown it; staff can (R17) |
| The scan matches nobody | F31's "nothing found", with the scanned text kept (R16) |
| A code that could be either kind | It cannot be: eight characters is a reward, ten is a customer (R2) |
| Two customers somehow share a code | Impossible by R3; the unique index fails the insert rather than issuing a duplicate |
| The card screen is reloaded | The game, not the card. A card is shown once (R10) and the page has nothing to show it from |

## 11. Acceptance criteria

- [x] Given a new customer is registered, then a code of ten characters in
      two groups of five is stored against them.
- [x] Given a code is generated, then it contains no `O`, `0`, `I`, `L` or
      `1` (R2).
- [x] Given two customers, then their codes differ, and a duplicate is
      refused by the index rather than issued (R3).
- [x] Given a database of customers from before this feature, when the
      upgrade runs, then every one of them has a code (R4).
- [x] Given the upgrade runs twice, then the second run issues nothing and
      changes nobody (P02).
- [x] Given a customer registers, then the response carries their card.
- [x] Given registering returned somebody who already existed, then the
      response carries no card (R9).
- [x] Given a customer has just registered, then the card screen shows the
      barcode and the code (R7).
- [x] Given the card screen, when the control is pressed, then the game
      begins and the card is not shown again (R10).
- [x] Given a returning customer identifies, then no card screen appears
      (R8).
- [x] Given a customer code typed into the Customers filter, then that
      customer is found (R13).
- [x] Given a complete customer code matching one customer, then their page
      opens (R14).
- [x] Given the same code in lower case, with spaces, or without its hyphen,
      then it finds the same customer (R15).
- [x] Given a customer code that matches nobody, then the message says so and
      the box keeps it (R16).
- [x] Given a customer's page, then their card is on it as a barcode and as
      characters (R17).
- [x] Given the customer list, then no card is on it (R18).
- [ ] Given the card screen at 375px, then it needs no scrolling (R11). No
      suite reaches this screen — see §12.
- [x] Every label this feature adds exists in all four languages (R19).
- [x] The four fast suites pass.

## 12. Verification

`php vendor/bin/phpunit` — 721 tests. `CustomerCodeTest` carries R2, R5
and R15, including the property the length exists for: two hundred generated
cards, none of them a reward code's length, so the counter's one box can take
either without being told which. `IdentityControllerTest` carries R1, R6, R7
and R9 — a new customer's card matches the one stored, a request that found
an existing customer is told `null`, and registering the same number twice
leaves the first card alone. `PlayerControllerTest` carries R13 to R18: found
by their card, found however it is spelled, the card on their page, and no
card anywhere on the list. `DatabaseUpgradeTest` carries R3 and R4 — every
customer already in the table given one, a second run issuing none, the
column required and uniquely indexed, and a dry run adding nothing.

`npm test` — 920 tests. `PlayerPage.test.tsx` carries R7, R8 and R10
through the whole path a customer walks: number, details, card, game. The
returning-customer test is the one that matters most, because R8 is a rule
about what must *not* appear. `CustomerModule.test.tsx` carries R17 and
`PlayersModule.test.tsx` carries R14. R16 — a card that matches nobody keeps
what was scanned — is the same code path F33 R23 already proves in that file,
and there is nothing card-specific left in it to test.

`npm run typecheck` and `npm run lint` are clean.

**Run against the real database.** The upgrade was run on the development
database rather than only on fixtures: dry run first, which reported the two
later steps honestly as "the column does not exist yet" rather than guessing;
then the real run, which added the column, issued cards to both existing
customers and constrained it. `doctrine:schema:update --dump-sql` then
reported nothing to do, so the entity and the database agree.

**One correction, found by running it.** The first version of the "required
and unique" test proved the constraint by setting the column to null and
expecting a failure. It passed in CI's MariaDB 10.11 and failed on
development's 10.4, which runs without strict mode and silently coerces the
null to an empty string. The test now asks the schema what it holds, which is
the same question with the same answer on both.

**Not seen in a browser.** R11 — the card screen at 375px without scrolling
— is unverified. The end-to-end suite registers through the API and never
types the form, so it never reaches this screen, and no suite in the
repository renders layout. The screen is the identification step's own
container with a barcode and one button, which is less than the result panel
F33 already fits; but that is reasoning, not a pass.

## 13. Decisions and risks

**Ten characters, and the reason is arithmetic.** Two things pushed in
opposite directions: a customer code must never be mistakable for a reward
code, which argues for a different length; and the barcode has to stay
scannable, which argues for a short one. Code 128 costs eleven modules a
character, so twelve characters is 187 modules with F33's quiet zones, and in
the player's panel at 375px that is 1.75px a module — under F33 R8's floor.
Ten is 165 modules and about 2px, comfortably over it. Ten also leaves 30¹⁰
codes, which is more customers than any shop will have.

**A code of their own rather than their phone number.** Encoding the number
would have needed no column at all, and the Customers filter already finds
numbers. It would also have made the thing in their camera roll a picture of
their phone number — readable by anybody who picks up the phone, or looks
over a shoulder at the counter. A random code says nothing about them.

**Shown once, at creation only.** The alternative is a screen that gives you
your card whenever you type your number, and that is precisely the screen
F28 R18 refused to build for vouchers. The number is not verified (F08 §13)
and never will be at a stall; the only moment the application can be sure the
person is who they say is the moment they are creating the record.

**The server says whether it created them.** F08 R7 lets `register` return an
existing customer, so "is this a new customer" is not something the page can
work out from what it sent. Putting `card` in the response only on creation
makes R8 true by construction rather than by the page remembering to check.

**A separate generator from the reward code's.** `CodeGenerator` makes reward
codes and says so in its name and its documentation. A customer code shares
its alphabet — the same reasons apply, a counter reading characters aloud —
but not its length or its purpose, and one class generating both would be a
class named after one of the two things it does. The alphabet moves to one
place that both read, so there is still a single answer to "which characters
are safe".

**Risk: this adds a step between registering and playing.** A customer at a
stall wants to spin, and the card screen is one press in the way. It is the
only moment the card can be shown at all (above), and the press is the same
press the game already asks for; but if a shop reports that the queue has
slowed, the honest fix is to put the card *after* the result rather than
before the game, and that is a change to R7 rather than an admission that the
card was wrong.

**The risk predicted here did not exist.** This section said the end-to-end
specs would break, because several of them register and then spin and a
screen between those two steps would fail them. They do not: `e2e/player.ts`
registers through `POST /api/player/register` and never types the form, so
the page meets an already-identified session and the card screen is never on
its path. Nothing in the suite needed repairing, and nothing in it was
changed — which is also why the suite cannot confirm R11 (§12).

**What this is not.** It is not a loyalty scheme. It counts nothing and
rewards nothing, and calling it a "card" is about what the customer keeps in
their phone, not about points. The scheme, if it comes, is a feature that
needs its own decisions about earning and spending — and it will sit on this
code rather than replace it.

## 14. Open questions

- **Should the card screen also appear for a customer who registered before
  this feature and comes back?** R8 says no, and R4 means they have a code
  they have never seen. The answer may be that the counter hands it over on
  request (R17) and that is enough — but if most of the shop's customers
  predate the feature, the card spreads very slowly, and that is worth
  measuring before adding a second way to show it.
