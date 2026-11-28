# F39 — Codes a scanner reads as numbers

| | |
|---|---|
| **ID** | F39 |
| **Interface** | Both |
| **Depends on** | [F13](./F13-reward-configuration.md), [F16](./F16-a-code-on-every-win.md), [F31](./F31-claiming-at-the-counter.md), [F33](./F33-a-barcode-the-counter-can-scan.md), [F34](./F34-the-customers-own-card.md), [P02](./P02-database-upgrades.md) |
| **Amends** | [F13](./F13-reward-configuration.md) R18, [F34](./F34-the-customers-own-card.md) R2 (the alphabet), [F33](./F33-a-barcode-the-counter-can-scan.md) R5 (the symbology's mode) |
| **Status** | Agreed |
| **Agreed on** | 2026-11-26 |

## 1. Summary

Reward codes and customer cards become digits only, which lets the barcode
use Code 128's numeric mode and come out roughly half as wide.

## 2. Why

A barcode is read by a scanner pointed at a phone screen across a counter,
and the thing that decides whether that works is how wide each bar is. Code
128 has a mode — code set C — that encodes **two digits in one symbol**, and
it is available only to data that is all digits.

Today's codes are ten and eight characters from a thirty-character alphabet,
which must be encoded one character per symbol. The same information as
digits, even at greater length, is a narrower barcode:

| | characters | modules | |
|---|---|---|---|
| Card before | 10 from the old alphabet | 145 | one symbol each |
| Card after | 12 digits | 101 | two digits a symbol |
| Reward before | 8 from the old alphabet | 123 | |
| Reward after | 10 digits | 90 | |

Those numbers were measured rather than reasoned about, and the first draft
of this section had them wrong in the application's favour by forgetting the
check symbol. The saving is larger than it claimed: a card is 30% narrower
and a reward code 27%, while both got longer to read.

Wider bars at the same screen width is the whole difference between a
scanner that reads it and one that has to be moved around until it does.

Digits are also easier at the counter in two smaller ways: a number can be
read aloud without the "B as in bravo" that a letter needs, and a phone
keypad types them without switching to a second keyboard.

## 3. Actors

| Actor | Role |
|---|---|
| **Counter staff** | Scan or type a code. Mostly notice nothing except that scanning works more often. |
| **Customer** | Reads a number off their own screen. |

## 4. User stories

- As **staff**, I want a code my scanner reads the first time, so that the
  queue moves.
- As a **customer**, I want a code I can read out over the phone without
  spelling it.

## 5. Scope

### In scope

- Both generators producing digits.
- A reward code of ten digits, a customer card of twelve.
- The encoder using code set C where the data allows it.
- The columns that hold them, widened.
- A command that deletes the customers and plays issued under the old
  format, so no code of the old vintage survives anywhere (§7).

### Out of scope

- **Supporting codes of the old format.** There will be none: §7 removes
  them. This is only defensible because the shop is still in test, and it is
  written down here because it would not be defensible later.
- **Any change to what a code means.** A reward code still claims one
  reward; a card still identifies one customer and grants nothing.
- **The game's link key**, which is not scanned and stays as it is.

## 6. Rules

### The codes

| # | Rule |
|---|---|
| R1 | Both codes are digits, and nothing else. |
| R2 | A reward code is ten digits, shown as `4821 739 506` — four, three, three. |
| R3 | A customer card is twelve digits, shown as three groups of four. |
| R4 | The grouping is for reading. It is not in the barcode, and a code typed without it, or with hyphens instead of spaces, is the same code. |
| R5 | Every digit comes from `random_int`. A code that can be guessed is a reward anybody can claim ([F13](./F13-reward-configuration.md) R19) or a customer anybody can point at. |
| R6 | Ten digits is one in ten billion and twelve is one in a thousand billion. Both are checked for uniqueness by the database's index rather than by looking first ([F34](./F34-the-customers-own-card.md) R3). |

### The barcode

| # | Rule |
|---|---|
| R7 | An all-digit code of even length is encoded in code set C: start symbol 105, one symbol per pair of digits. |
| R8 | Anything else is encoded exactly as it is today, in code set B. The encoder keeps both, because a format can change again and a barcode that silently stopped encoding would be worse than a wide one. |
| R9 | The check symbol and the stop pattern are unchanged ([F33](./F33-a-barcode-the-counter-can-scan.md) R6, R7): modulo 103 over the symbol values, the start symbol counted once. |
| R10 | The invariant [F33](./F33-a-barcode-the-counter-can-scan.md) proves stays true of every symbol in both sets: an even number of bar modules. |
| R11 | The readable code stays under the bars ([F33](./F33-a-barcode-the-counter-can-scan.md) R3), in its groups, as the typing fallback. |

### At the counter

| # | Rule |
|---|---|
| R12 | The one box still takes a phone number, a customer card or a reward code, and the person using it still does not have to say which ([F34](./F34-the-customers-own-card.md) R15). |
| R13 | A number that could be either is looked up as both, which is what the customer filter already does: it asks the phone columns and the card column and shows what matches. |
| R14 | A card is twelve digits and a local phone number is ten, so the two rarely collide by length — but nothing depends on that, because R13 does not care. |
| R20 | A complete code **arriving** opens the one customer it found ([F34](./F34-the-customers-own-card.md) R20). A complete code already in the address bar is somebody coming back to the list, and opens nobody. |

## 7. The data this replaces

Every code issued so far was made from the old alphabet. Supporting two
vintages at a counter means a scanner that works for some customers and not
others, and no way to tell which by looking.

The shop is in test, so there is a third option that will not exist later:
delete them. A console command removes every customer and every play — the
cards and the reward codes with them — leaving the catalogue, the wheels,
the gift sheets and the games untouched.

| # | Rule |
|---|---|
| R15 | `app:forget-the-test-customers` deletes every row of `player` and every row of `spin`. |
| R16 | It deletes nothing else. The reward catalogue, the prizes on a wheel, the gifts on a sheet and the games are what the shop configured, and this command is about what customers left behind. |
| R17 | It says what it is about to delete, counted, and does nothing until the word `forget` is typed. `--force` skips the question, for a non-interactive run. |
| R18 | It reports what it deleted. |
| R19 | It is safe to run twice: the second run deletes nothing and says so. |

## 8. Data model

| Entity | Field | Was | Is |
|---|---|---|---|
| Player | `code` | varchar(11), unique | varchar(14), unique — twelve digits and two spaces |
| Spin | `reward_code` | varchar(12), unique | varchar(12), unique — ten digits and two spaces, which fits already |

One upgrade step widens `player.code`. `spin.reward_code` is already wide
enough, which the step for it says rather than pretending to act.

## 9. Interface

Nothing moves. The result panel, the gift sheet, the card screen and the
customer's page all show what they showed, with digits in it — and a barcode
that is visibly narrower at the same height.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| A code typed with spaces, hyphens, or neither | The same code (R4). |
| A code typed with letters in it | Not a code; the box treats it as it treats any other unmatchable input. |
| An odd-length run of digits in the encoder | Code set B, as today (R8). |
| A code longer than its format | Not a code. |

## 11. Acceptance criteria

- [ ] Given a reward is won, then its code is ten digits (R1, R2).
- [ ] Given a customer registers, then their card is twelve digits (R1, R3).
- [ ] Given a code typed with spaces, hyphens or neither, then it is the same
      code (R4).
- [ ] Given two hundred generated codes, then no two are the same (R5, R6).
- [ ] Given an all-digit code, then the encoder uses start symbol 105 and one
      symbol per pair (R7).
- [ ] Given a twelve-digit card, then the barcode is 101 modules wide, against 145 for the card it replaces (R7).
- [ ] Given a code with a letter in it, then the encoder uses code set B
      (R8).
- [ ] Given any code, then the check symbol is the modulo-103 sum (R9).
- [ ] Given every symbol in both code sets, then its bar modules are even
      (R10).
- [ ] Given a card or a reward code at the counter's box, then it finds the
      right thing (R12, R13).
- [ ] Given a code typed or scanned into the box, then the one customer it
      found opens (R20).
- [ ] Given that customer's page and "All customers", then the list stays on
      screen (R20).
- [ ] Given the command, then it deletes every customer and play and nothing
      else (R15, R16).
- [ ] Given the command without `--force`, then nothing is deleted until the
      word is typed (R17).
- [ ] Given the command twice, then the second run deletes nothing (R19).
- [ ] The four fast suites pass.

## 12. Verification

`php vendor/bin/phpunit`. `CodeGeneratorTest` and `CustomerCodeTest` carry
R1 to R5: two thousand codes with nothing but digits in them, the groups,
the lengths, every spelling of a code reading back the same, and five
hundred codes proving that no position is secretly constant — which is the
test that would catch a generator with far less entropy than it looks like
it has. `SpinLookupTest` carries the counter's end of it, with the code the
acceptance criteria name. `ForgetTheTestCustomersCommandTest` carries R15 to
R19, and most of it is about what the command leaves alone: the catalogue,
the prizes, the games. `DatabaseUpgradeTest` carries §8.

`npm test`. `code128.test.ts` carries R7 to R11 — the start symbol, a pair
of digits encoded as the number it spells, the check symbol computed by hand
from the standard, the three spellings of one code encoding identically, and
code set B still used for anything the numeric mode cannot take. It also
measures the thing the feature is for: 101 modules against 145.

**A correction, caught by the test.** §2's table was wrong when it was
written — 134 and 112 modules, arrived at by forgetting that the check
symbol is a symbol. The measured numbers are 145 and 123, so the saving is
larger than the feature claimed when it was agreed. The table says so rather
than quietly reading better.

`npm run typecheck` and `npm run lint` are clean.

**Run against the real database.** The widening step ran on development, is
idempotent, and `doctrine:schema:update --dump-sql` had nothing to say
afterwards.

**Not seen in a browser by me.** The codes appear on the player's result
panel, the card screen and the admin's customer page, and the admin screens
need a password that is the owner's. What a test cannot answer either way is
§14's first question: whether the shop's own scanner likes the narrower
barcode better, which is the point of all of this.

## 13. Decisions and risks

**Why lengthen rather than keep ten and eight.** A digit carries less than a
character from a thirty-character alphabet, and a reward code is the thing
that claims a reward. Ten digits and twelve digits keep both out of guessing
range, and the barcode is still narrower than today's because the numeric
mode wins by more than the extra digits cost.

**What numbers cost.** A card and a phone number stop being distinguishable
by shape, which the old alphabet did for free. R13 is why that is survivable:
the counter's box has always asked both questions of whatever it is handed
and shown what matched. The lengths make a double match unlikely rather than
impossible, and a double match is two rows on screen rather than a wrong
answer.

**Why the old codes are deleted rather than supported.** Supporting both
means a scanner that reads some customers' cards and not others, with
nothing on screen to say which — and the fix would be exactly this deletion,
later, with real customers in the table. The shop is in test today. §7 is
written as a feature rule rather than a one-off script so that what was
deleted, and what deliberately was not, is on the record.

**Found in production, within the hour.** Opening a customer carries the
search into the address bar so that coming back keeps it ([F09](./F09-admin-modules.md)
R12), and the list opens the single customer a complete code matches
([F34](./F34-the-customers-own-card.md) R20). Those two had lived together
happily because a complete code could not be a phone number. This feature
made it one: ten digits typed into the box to find somebody became, on the
way back, a complete code with exactly one match — so the list opened that
customer again and "All customers" stopped working.

R20 is the rule that was always meant: the list opens somebody when a code
*arrives*, from a scanner or from typing. A code already in the address bar
is a person coming back. The fix is a flag armed by the box and spent by the
navigation, and the two tests for it were checked against the bug — the
first version of one of them passed with the bug still present, because it
asked whether the customer's page was on screen one render before it would
have been.

**What the counter said about it afterwards.** That the way back worked was
not the same as it being right: it came back to a list of one, holding the
code of the customer just served, in the box a scanner types into.
[F31](./F31-claiming-at-the-counter.md) R31 made the way back the whole
list, so nothing carries a code onto a customer's page any more. R20 still
stands, for the reload and the bookmark that do.

## 14. Open questions

- Should the barcode's height or quiet zone change now that it is narrower?
  A narrower code at the same height is easier to aim at, so probably not,
  but it is worth a look with the shop's own scanner.
- A check digit inside the code — a mistyped digit is currently a code that
  does not exist rather than one that is caught. Worth it only if typing
  turns out to be common, which scanning is meant to prevent.
