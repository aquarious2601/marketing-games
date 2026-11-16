# F16 — A code on every win

| | |
|---|---|
| **ID** | F16 |
| **Status** | Agreed |
| **Interface** | Both |
| **Depends on** | [F09](./F09-admin-modules.md), [F10](./F10-hand-over-to-the-next-player.md), [F13](./F13-reward-configuration.md) |
| **Agreed on** | 2026-11-16 |

## 1. Summary

Every spin that wins something is issued its own unique code, free products
included, and staff can find that spin by typing the code into the Spins
module instead of asking the player for their phone number.

## 2. Why

[F13](./F13-reward-configuration.md) R19 gave a code to discounts only, and
said a free product is "claimed by showing the screen, as it always was".
That sentence was true when it was written and is not true now:
[F10](./F10-hand-over-to-the-next-player.md) made the page clear itself when
the device is handed to the next player. At a stall with one tablet, the
screen a player would show is wiped by whoever spins after them — usually
within seconds, and certainly before they reach the counter. The claim
mechanism for a free coffee is currently a screen that no longer exists.

So staff fall back to the Spins module and look the spin up by phone number,
which means asking for a phone number before handing over a coffee. The
roadmap has been carrying this as *prize reveal and claim*, with the
question "worth knowing whether that is good enough at a counter". It is
not.

A code also settles something a phone number cannot. Two free coffees won by
the same person on the same evening are two identical rows, and nothing on
either one says which has already been handed over. A code per spin makes
each win a thing that can be pointed at.

## 3. Actors

| Actor | Role |
|---|---|
| **Player** | Reads a code off the result panel and quotes it at the counter |
| **Staff** | Types the code into the Spins module, finds the one spin, hands the prize over and marks it claimed |

## 4. User stories

- As a **player**, I want **a code for whatever I win**, so that **I can
  claim it after somebody else has used the tablet**.
- As **staff**, I want **to find a spin by its code**, so that **I do not
  have to ask for a phone number to give away a coffee**.
- As **staff**, I want **the code to survive being read aloud and typed in**,
  so that **a busy counter is not a spelling test**.

## 5. Scope

### In scope

- A code on every claimable win, so free products join the discounts.
- The Spins module's existing filter accepting a code as well as a phone
  number.
- Normalising what staff type: case, spaces and the hyphen.

### Out of scope

- **A code for a losing spin.** There is nothing to claim
  ([F13](./F13-reward-configuration.md) R15), and a code printed under
  *Maybe next time* is an invitation to carry it to the counter and be
  turned away.
- **Giving old free-product spins a code.** See R5. A code the player was
  never shown matches nothing they hold.
- **Code expiry.** A voucher with no end date is a real liability, and the
  roadmap carries it as its own candidate. A lifetime needs a policy, a
  column, and a rule about what the counter sees once it has passed.
- **A QR code.** The roadmap's *prize reveal and claim* sketched one too.
  Eight characters can be read down a telephone and typed by somebody whose
  camera will not focus; a QR code is an optimisation of a flow that has to
  work without it first.
- **Changing the alphabet, the length or the grouping.** F13 R17 and R18
  stand exactly as they are.

## 6. Rules

### Issuing

| # | Rule |
|---|---|
| R1 | Every spin whose reward is claimable — free product, percent off, amount off — is issued a code at the moment of the spin, in the same transaction that records it (F02 R12). This **replaces [F13](./F13-reward-configuration.md) R19**. |
| R2 | A losing spin is issued no code. F13 R15 is unchanged: it is drawn, recorded and logged like any other slice, and it is the one that carries nothing. |
| R3 | The code is unique across every spin ever recorded, which the unique index on `spin.reward_code` — not the generator — is what guarantees (F13 R17). |
| R4 | The alphabet, the length and the grouping are F13 R18's, untouched: eight characters in two groups of four, with no `O`/`0` and no `I`/`L`/`1`. |
| R5 | A spin recorded before this feature keeps what it has. A free-product spin from before today has no code and is not given one. |
| R6 | The player is shown the code on the result panel wherever there is one (F13 R20), so a free product now shows one too. |
| R6a | Where there is a code, the panel's instruction is about the code rather than about the screen. "Show this screen to a member of staff" is the sentence F10 made untrue, and it stays only on the panel that has no code to give. |

### Finding a spin by its code

| # | Rule |
|---|---|
| R7 | The Spins module's filter accepts either a phone number or a code. One box, because staff type what is in front of them and two boxes would make them choose first. |
| R8 | What is typed is normalised before it is matched: upper-cased, spaces and hyphens removed, and the canonical hyphen put back. `a7k3m9px`, `A7K3 M9PX` and `A7K3-M9PX` all find the same spin. |
| R9 | A code is matched from its start, so the row appears as the last character is typed rather than only once the code is complete. |
| R10 | A phone number is matched as F09 R18 already matches one: any part of the stored number. |
| R11 | A spin matches when **either** its code or its player's number matches. |
| R12 | Input that cannot be the start of a code — too long, or holding a character the alphabet excludes — is matched against phone numbers only. A phone number is exactly that kind of input, so typing one still searches for a person. |
| R13 | A complete code matches at most one spin (R3): one row, or the "nothing matched" message. |
| R14 | The row found carries its usual claim control (F13 R22), so a code brought to the counter is claimed without a second screen. |
| R15 | Filtering by code necessarily leaves out losing spins, which have no code — the same shape of exclusion as F09 R18's, where filtering by number leaves out the spins that have none. |
| R16 | The total beside the list still counts what matched rather than what came back (F09 R21). |
| R17 | The filter's label and placeholder say both the things it takes, in all four languages (F12). |

## 7. Data model

No change. `spin.reward_code` is already `varchar(12)`, nullable and unique
(F13), and this feature only widens which spins get one written into it.
Nothing to migrate, so [P02](./P02-database-upgrades.md) gains no step — and
by R5 there would be nothing to backfill even if it had one.

## 8. API surface

No new endpoints.

| Endpoint | Change |
|---|---|
| `GET /api/admin/spins` | The `phone` query parameter becomes `search`, because it no longer only takes a phone number |
| `POST /api/spin` | `reward.code` is now non-null for a free product too |
| `PUT /api/admin/spins/{id}/claim` | Unchanged |

The parameter is renamed rather than joined by a second one. Two would need
a rule for what happens when both arrive, and the admin page is the only
client there has ever been, so the rename costs nothing while the
alternative leaves behind a name that lies.

## 9. Interface

### Player view

Unchanged in shape. The result panel already shows the code whenever the
server sends one, so a free product now shows the same block a discount has
shown since F13.

### Admin view

The Spins module's filter is relabelled **Phone or code**, with a
placeholder showing both shapes. The code column itself is unchanged; what
changes is that a dash in it now means *this spin won nothing*, where before
it meant that or *a free product*.

### Responsive behaviour

Unchanged. The admin tables keep F11's horizontal scroll, and the player
panel's code block is the one F13 sized.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| A code typed in lower case, with spaces, or without the hyphen | Found (R8) |
| A code typed with a character the alphabet excludes — `O`, `I`, `L`, `0`, `1` | Treated as a phone filter (R12), which matches nothing, and the list says so |
| A complete code belonging to no spin | "Nothing matched", not an error |
| A partial code shared by two spins | Both rows, newest first — a prefix is not a promise of one |
| A filter that is blank or whitespace | The whole log, as today |
| A code brought for a losing spin | Cannot exist (R2), so it matches nothing |

## 11. Acceptance criteria

- [x] Given a wheel whose prize is a free product, when a player spins it,
      then the response carries a code matching the F13 pattern and the
      result panel shows it.
- [x] Given a losing slice, when it is drawn, then the spin is recorded with
      no code and the player is shown none.
- [x] Given twenty-five free-product spins, then all twenty-five codes
      differ.
- [x] Given a spin with the code `A7K3-M9PX`, when staff type `a7k3m9px`
      into the Spins filter, then that spin is the only row listed.
- [x] Given the same spin, when staff type `A7K3`, then it is listed.
- [x] Given a phone number typed into the filter, then numbers are searched
      and a spin appears only if it is that player's.
- [x] Given a spin found by its code, when staff press Claim on the row,
      then it is marked claimed (F13 R22).
- [x] Given a free-product spin recorded before this feature, then its code
      column still shows a dash (R5).
- [x] Given the filter matches nothing, then the list says nothing matched
      rather than showing an empty table.

## 12. Verification

`php vendor/bin/phpunit` — 446 tests. `RewardIssueTest` covers R1, R2, R3
and R6 through real spins, which is the only way to exercise that the code
is issued inside the recording transaction; `SpinLookupTest` covers R7–R16
against the real database, with rows written directly so the codes are the
ones named above; `CodeGeneratorTest` covers the normalising of R8 and R12
directly, including that every code the generator produces survives the
round trip through it.

`npm test` — 537 tests. `SpinsModule.test.tsx` covers the relabelled filter,
finding a spin by a code typed carelessly, and that the claim control still
works on the row that came back; `PlayerPage.test.tsx` covers R2, R6 and
R6a on the result panel.

Every acceptance criterion above holds under those two suites. The status
stays `Agreed` rather than `Done` for the reason the README gives: `Done`
wants the end-to-end run as well, and that run is the user's
(see the repository's `CLAUDE.md`).

**Not looked at in a browser.** The admin screens still need an account this
session could not create, so the criteria that end "and staff see it" are
carried by the tests rather than by a look.

## 13. Decisions and risks

- **One filter box, not two (R7).** A counter is the worst possible place to
  ask somebody which field they want. The two kinds of input cannot be
  confused by the server — a code holds letters the alphabet allows, a phone
  number holds digits and punctuation — so the box takes either and the
  staff member just types. The cost is that a short numeric filter like `23`
  can match both a phone fragment and the start of a code, and shows both.
  That is an extra row, not a wrong answer.
- **Matched from the start, not exactly (R9).** The filter is debounced and
  refetched as it is typed, so an exact match would mean the row appearing
  only on the eighth character and the list reading "nothing matched" for
  the seven before it. A prefix makes the list narrow as you type, which is
  what every other filter in the admin does.
- **`needsCode()` is gone.** F13 had a `RewardType::needsCode()` separate
  from `isClaimable()`, because a discount needed a code and a free product
  did not. R1 makes them the same question, and two methods that must always
  agree are two things to keep in step for no gain. The one caller now asks
  `isClaimable()`, which is also exactly what R1 and R2 say.
- **No backfill (R5).** The tempting version of this feature issues codes
  for the free-product spins already in the log, so the column is full. But
  a code is a thing a player carries, and one invented tonight for a spin
  from last week matches nothing anybody holds. Staff looking for that prize
  have the phone number, as they always did.
- **Risk: the dash in the code column changes meaning.** It used to mean
  "free product or losing"; it now means "losing". Nothing breaks, but
  anybody who learned the old reading will misread the new one for as long
  as pre-F16 rows are on the first page of the log. It is not worth a
  migration to avoid.
- **Risk: a free product is now claimed by a code somebody has to type.**
  Showing a screen was faster, while the screen was still there. If a shop
  says their counter wants something faster than eight characters, the
  answer is the roadmap's QR code, built on top of this rather than instead
  of it.

## 14. Open questions

- None.
