# F31 — Claiming at the counter

| | |
|---|---|
| **ID** | F31 |
| **Status** | Agreed |
| **Interface** | Admin |
| **Depends on** | [F09](./F09-admin-modules.md), [F13](./F13-reward-configuration.md), [F16](./F16-a-code-on-every-win.md), [F19](./F19-one-person-one-number.md), [F27](./F27-the-store-and-its-games.md), [F28](./F28-the-gift-sheet.md) |
| **Amends** | [F09](./F09-admin-modules.md) R13, R18, [F13](./F13-reward-configuration.md) R21 |
| **Agreed on** | 2026-11-19 |

## 1. Summary

Staff find a returning customer by their phone number or by the code on the
ticket they are holding, see everything that customer has won and what is
still owed to them, and hand each reward over from that one screen — which
also records who handed it over.

## 2. Why

The claim works today and is in the wrong place.

A customer comes back with a ticket. Staff open the **Spins** module, which
is a log of every spin ever made, newest first — and on a wheel most of those
spins won nothing. They type the code into the filter, read the row that comes
back among the others, and press a small control inside it
([F13](./F13-reward-configuration.md) R22). It works, and every part of it is
aimed at the wrong question: a log answers *what went out today*, and the
person at the counter is asking *what does this customer have coming*.

Three things follow from that mismatch.

**A customer is not one row.** Somebody who has played on three evenings, or
played the gift sheet once ([F28](./F28-the-gift-sheet.md) gives every reward
on its list at a time), has several wins and some of them are already
collected. The log shows them scattered among everybody else's, and nothing
on screen says "this customer still has two things to collect".

**Most of the screen is noise.** A losing spin has no code and nothing to
hand over ([F13](./F13-reward-configuration.md) R15, R24). At a counter it is
not merely useless, it is in the way.

**A claim has no author.** `spin.claimed_at` records the moment and nothing
else, so a prize that is disputed — or handed over twice by two people — has
no record of who did it. The roadmap has been carrying this as the half of
*claim verification* that was never built.

The reward catalogue, the codes and the normalising of what staff type all
exist. What is missing is a screen built for the person standing at the till.

## 3. Actors

| Actor | Role |
|---|---|
| **Customer** | Comes back with a ticket, or with the number they played on |
| **Staff** | Types either one, reads what is owed, hands it over, and is recorded as having done so |
| **Owner** | Reads the same screen later to see what a customer was given |

## 4. User stories

- As **staff**, I want **to type a code or a phone number and land on the
  customer**, so that **I can see everything they are owed instead of one
  row**.
- As **staff**, I want **what is still to collect separated from what is
  already collected**, so that **I do not hand the same prize over twice**.
- As **staff**, I want **to hand a reward over with one deliberate press**,
  so that **the queue moves and nothing is claimed by accident**.
- As an **owner**, I want **to know which member of staff handed a prize
  over**, so that **a dispute has an answer**.
- As an **owner**, I want **the spin log to stop listing spins that won
  nothing**, so that **what I read is what left the shop**.

## 5. Scope

### In scope

- The Players module's filter taking a reward code as well as a phone number.
- A customer's page that lists what they have won, outstanding first, with
  the hand-over control on each one.
- Recording which admin account claimed a reward, and showing it.
- The Spins module listing only spins that won something.

### Out of scope

- **The numbers.** Customers per day, claim rates and what a campaign costs
  are [F32](./F32-what-the-game-costs-and-brings.md). This feature counts nothing it does not need for a sentence on
  screen.
- **Code expiry.** A voucher with no end date is a real liability and is its
  own decision, as [F16](./F16-a-code-on-every-win.md) already says. Nothing
  here expires, and a win from six months ago is collected like any other.
- **A QR code.** Still the roadmap's. Eight characters have to work first,
  and after this feature they work on a better screen.
- **CSV export of the log.** Unchanged and still on the roadmap. It is the
  answer for the rows this feature stops enumerating, and it must export the
  losing spins too.
- **Searching by name.** The box takes a number or a code, which are the two
  things a customer can hand over. A name is typed differently by every
  member of staff and by the customer themselves.
- **Editing or deleting a customer.** Deleting is the roadmap's, with
  [F08](./F08-player-identification.md) section 14's question still open.
- **An account per member of staff.** [F07](./F07-admin-login.md) already
  allows as many admin accounts as a shop wants to create, and R19 records
  whichever one is signed in. Creating them is still a console command, and
  making that a screen is not this feature.
- **A history of claims and un-claims.** R20 keeps one author, the current
  one. An append-only trail is a different feature with a different table.

## 6. Rules

### Finding the customer

| # | Rule |
|---|---|
| R1 | The Players module's filter takes **either a phone number or a reward code**, in one box. One box for [F16](./F16-a-code-on-every-win.md) R7's reason: staff type what is in front of them, and two boxes make them choose first. This **amends [F09](./F09-admin-modules.md) R18**, which says the filter is a phone filter. |
| R2 | What is typed is normalised exactly as [F16](./F16-a-code-on-every-win.md) R8 normalises it: upper-cased, spaces and hyphens removed. `a7k3m9px`, `A7K3 M9PX` and `A7K3-M9PX` all find the same customer. |
| R3 | A code is matched from its start, as [F16](./F16-a-code-on-every-win.md) R9 matches one, so the result narrows as it is typed rather than appearing only on the eighth character. |
| R4 | Input that cannot be the start of a code — too long, or holding a character the alphabet excludes ([F16](./F16-a-code-on-every-win.md) R12) — is matched against phone numbers only. A phone number is exactly that kind of input. |
| R5 | A customer matches when **either** their number matches or any of their wins' codes does. |
| R6 | When the filter matches exactly one customer, their page opens directly. A complete code is that case, so a ticket is one action rather than two. |
| R7 | A code belonging to a spin with **no customer** — one predating [F08](./F08-player-identification.md), or one whose customer was deleted ([F08](./F08-player-identification.md) R19) — cannot be shown on a customer's page. The list says so in as many words and names the Spins module, where that spin still carries its control (R26). It is a prize the shop owes somebody, so it is never silently nothing. |
| R8 | A blank or whitespace filter lists customers as it does today. |
| R9 | The list keeps reporting how many customers matched rather than how many rows it returned ([F09](./F09-admin-modules.md) R21). |
| R32 | R6 opens a customer, and Enter opens one, **only when the rows on screen are the answer to what is in the box now**. The list is refetched after a pause, so between a keystroke and that pause the single row showing belongs to an earlier filter — and opening it means opening somebody else's page under a code that is not theirs. |

### The customer's page

| # | Rule |
|---|---|
| R10 | The page states who they are — name, number, when they first played — and how many times they have played. |
| R11 | It lists **every win that can be claimed**, in two sections: **to collect** first, then **collected**. At a counter what is owed is the question; what is settled is the reassurance. |
| R12 | A win shows the game it was won on, the reward, its code, and when it was won. A collected one also shows when it was collected and by whom (R21). |
| R13 | Their spins that won nothing are **not listed**, and the count says so: "played 12 times, won 3". Nothing is hidden — a number that does not match its list is a lie, and this one matches. |
| R14 | Wins from one gift sheet ([F28](./F28-the-gift-sheet.md)) are grouped under that sheet, newest sheet first, because one play produced them all. Each is still handed over on its own, so each keeps its own control. |
| R15 | Every win to collect carries a hand-over control that marks it collected ([F13](./F13-reward-configuration.md) R22), and every collected one carries the control that takes it back ([F13](./F13-reward-configuration.md) R23). |
| R16 | The control is a deliberate press. Pressing Enter in the search box searches and never claims. |
| R17 | A win recorded before [F16](./F16-a-code-on-every-win.md) has no code ([F16](./F16-a-code-on-every-win.md) R5) and is listed and collected like any other. It is a prize somebody is owed; the code is how it is *found*, not what makes it real. |
| R18 | Handing a reward over moves it from one section to the other in place, without a reload and without losing the search. |
| R31 | The way back from this page is **the whole list**, which is what the control already says it is. It carries no search: by the time staff press it, the customer in front of them has been served and the next one is holding out a ticket. The search that found this customer is still one Back away, in the history, which is where "the way I came" belongs. |

### Who handed it over

| # | Rule |
|---|---|
| R19 | A claim records the admin account that made it, alongside the moment it already records. This **amends [F13](./F13-reward-configuration.md) R21**, where a claim was a time alone. |
| R20 | Taking a claim back clears both the time and the account: an un-done claim did not happen. See section 13 for what that costs. |
| R21 | The name shown is the account's username, as it is in the frame around the admin ([F07](./F07-admin-login.md)). |
| R22 | A claim made before this feature has a time and no account. It is shown with a dash, never with a guess. |

### The Spins module

| # | Rule |
|---|---|
| R23 | The Spins module lists only spins that **won something**. This **amends [F09](./F09-admin-modules.md) R13**, which lists every spin. Its reason for listing anonymous spins ([F09](./F09-admin-modules.md) R15) stands untouched and matters more now: an anonymous win can be claimed nowhere else (R7). |
| R24 | The header states how many spins won nothing over the same period, so the module admits what it is leaving out — the same discipline as its cap ([F09](./F09-admin-modules.md) R16). |
| R25 | A status filter offers **everything**, **to collect** and **collected**, defaulting to everything. The module's question is what went out; the counter's question has its own screen now. |
| R26 | Its filter and its claim control are unchanged ([F16](./F16-a-code-on-every-win.md) R7, [F13](./F13-reward-configuration.md) R22). |
| R27 | The cap stays at the most recent 200 and keeps saying so ([F09](./F09-admin-modules.md) R16). |

### Everything on screen

| # | Rule |
|---|---|
| R28 | Every label, status and message this feature adds exists in all four languages ([F12](./F12-multiple-languages.md)). |
| R29 | The customer's page works at 375px with no horizontal scroll, and the hand-over control is reachable without one. Staff at a stall hold a phone, not a laptop — the same discipline the player page is held to. |
| R30 | Both modules stay behind a session ([F07](./F07-admin-login.md) R17, R22). |

**Corrected while building (R6).** The rule says a filter matching exactly
one customer opens that customer. Taken literally it navigates away
mid-typing, as soon as a phone fragment happens to match one person — taking
the box being typed into with it. What ships opens the customer only when
what has been typed is a **complete code**, which is the case the rule was
written for and the one input that is finished the moment it matches. Any
single row is still one click away.

**Also while building: the search lives in the URL.** The customer is a page
now, and [F09](./F09-admin-modules.md) R12 kept the history inside the row
precisely so that opening it could not lose the search somebody typed to
find it. The filter travels as `?search=`, and R18 stays true for a page:
`/admin/players?search=A7K3` is also something a staff member can reload or
bookmark mid-queue.

**Found at the counter, and it cost this half its reasoning (R31, R32).**
The customer's page used to link back *with* the search, which is how that
same decision was first written. The shop's report: "All customers" came
back to a list of one, with the previous code still in the box. Three things
were wrong at once. The control promised the whole list and did not give it.
The box takes focus for the scanner ([F33](./F33-a-barcode-the-counter-can-scan.md)
R20), so the next scan was typed *onto* that code — twenty-two digits,
matching nobody. And worse: the moment those appended digits passed through a
card's twelve, the one row on screen was still the customer the old code had
found, and R6 opened them. Somebody else's page, under a code that is not
theirs, with a prize about to be handed over on it.

R31 is the control telling the truth. R32 is the rule R6 was always missing:
a single match is only a match when the list it is in answers what is in the
box. The search still lives in the URL for the list's own sake — reload,
bookmark — but nothing carries it onto a customer's page any more, because
nothing there read it except the back link, and a query string nobody reads
is one somebody later believes.

## 7. Data model

One column.

| Entity | Field | Type | Notes |
|---|---|---|---|
| `spin` | `claimed_by_id` | int, null | FK to `user`. Null for an unclaimed spin and for a claim made before this feature (R22). `ON DELETE SET NULL`: deleting an admin account must not delete the record that a prize was handed over |

[P02](./P02-database-upgrades.md) gains one step: add the column, nullable,
with no backfill. There is nothing to backfill — the account that claimed a
reward last month was not recorded, and inventing one would be a lie in a
column built to settle disputes.

## 8. API surface

No new endpoints.

| Method | Path | Change |
|---|---|---|
| `GET` | `/api/admin/players` | `phone` becomes `search`, because it no longer only takes a phone number — the same rename [F16](./F16-a-code-on-every-win.md) made on the spins endpoint, for the same reason |
| `GET` | `/api/admin/players/{id}` | The player's spins become their **wins**, each with its code, its claim state, its game, its sheet when it has one, and who claimed it. The losing ones are replaced by two counts: played, won |
| `GET` | `/api/admin/spins` | A `status` parameter — `all`, `open`, `claimed` — and the list is wins only (R23). The response gains the count of spins that won nothing (R24) |
| `PUT` | `/api/admin/spins/{id}/claim` | Shape unchanged. It now writes the signed-in account, and its response carries who claimed it |

The players endpoint answers with the customer and their wins in one
response, because the counter must not need a second request to show what is
owed.

## 9. Interface

### Admin view

**Players**, renamed to **Customers** in the tab strip, because that is what
the person at the counter is and the module is about to be read by staff
rather than by the owner. The filter is relabelled **Phone or code**, with a
placeholder showing both shapes.

The customer's page, in order: who they are; **To collect**, as cards rather
than table rows — the reward in the largest type on the card, the code under
it, the game and the date beside it, and the hand-over button at the end;
then **Collected**, the same cards quieter, each saying when and by whom, with
the control that takes it back. A customer with nothing outstanding says so
rather than showing an empty section.

**Spins** keeps its table ([F11](./F11-admin-tables.md)), its filter and its
claim control, and loses the rows that won nothing. Its header gains one
sentence: how many spins won nothing over the same stretch.

### Responsive behaviour

The cards are one column at 375px and two from 768px. The hand-over button is
full width on a phone, at the bottom of its card, where a thumb is. The Spins
table keeps [F11](./F11-admin-tables.md)'s horizontal scroll.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| A code typed in lower case, with spaces, or without the hyphen | Finds the customer (R2) |
| A code holding `O`, `I`, `L`, `0` or `1` | Treated as a phone filter (R4), which matches nothing, and the list says so |
| A complete code belonging to no spin | "Nothing matched", not an error |
| A code whose spin has no customer | The message of R7, naming the Spins module |
| A partial code shared by two customers | Both customers, and neither page opens by itself (R6 wants exactly one) |
| Hand-over pressed on a win somebody else just collected | The server's answer wins and the card shows collected, with who. Two members of staff at one counter is the case this exists for |
| Hand-over pressed on a losing spin | Cannot be offered (R11), and the server refuses it anyway ([F13](./F13-reward-configuration.md) R24) |
| The session expires between opening the page and pressing the control | The overlay the admin frame already shows ([F07](./F07-admin-login.md) R22); nothing is claimed |
| A customer with no wins at all | The page states what they played and says there is nothing to collect |

## 11. Acceptance criteria

- [x] Given a customer whose win has the code `A7K3-M9PX`, when staff type
      `a7k3m9px` into the Customers filter, then that customer's page opens.
- [x] Given the same customer, when staff type `A7K3`, then they are the only
      one listed.
- [x] Given a phone number typed into the filter, then customers are matched
      by number and a code is not needed.
- [x] Given a customer with two wins to collect and one already collected,
      when their page is opened, then the two are listed first under *to
      collect* and the third under *collected*.
- [x] Given a customer who has played twelve times and won three, when their
      page is opened, then three wins are listed and the page says they
      played twelve times.
- [x] Given a win to collect, when staff press hand over, then it moves to
      *collected* without the customer being fetched again, and the link back
      to the list still carries the search that found them. (Written as "the
      search is still in the box"; on a page of its own that is what it
      means.)
- [x] Given a collected win, then it names the admin account that claimed it
      and when.
- [x] Given a claim recorded before this feature, then it shows its time and
      a dash for the account.
- [x] Given a collected win, when staff take the claim back, then both the
      time and the account are cleared.
- [x] Given one gift sheet that issued six rewards, when the customer's page
      is opened, then the six are grouped under that sheet and each has its
      own control.
- [x] Given a code whose spin has no customer, when it is typed into the
      Customers filter, then the message names the Spins module rather than
      saying nothing matched.
- [x] Given a wheel whose spins mostly lost, when the Spins module is opened,
      then only the spins that won something are listed and the header says
      how many won nothing.
- [x] Given the Spins module, when the status filter is set to *to collect*,
      then every row listed is an uncollected win.
- [x] Given a win recorded before F16 and so without a code, then it is
      listed on its customer's page and can be collected.
- [ ] Given a customer's page at 375px, then there is no horizontal scroll
      and every hand-over control is reachable.
- [x] Given a customer's page reached from a search, when "All customers" is
      pressed, then the whole list is shown and the box is empty (R31).
- [x] Given a list showing one customer, when a complete code that matches
      nobody is typed, then no customer's page opens (R32).
- [x] Every label this feature adds exists in English, French, Chinese and
      Vietnamese.
- [x] The four fast suites pass.
- [ ] Checked by hand: a ticket's code typed at 375px, the hand-over, and the
      name of the account that made it.

## 12. Verification

`php vendor/bin/phpunit` — 657 tests. `PlayerControllerTest` covers R1 to R7
and R10 to R14 against the real database, including the regression the code
search invites: a customer found by a code still counts every play, where
matching on the join that counts spins would have said one.
`RewardIssueTest` covers R19 to R22 through the claim endpoint, with two
accounts, so "a second press keeps the first author" is a fact about the
rule rather than about one session. `SpinControllerTest` and `SpinLookupTest`
cover R23 to R27. `DatabaseUpgradeTest` covers the step: the column, its
key, and that it backfills nobody.

`npm test` — 648 tests. `CustomerModule.test.tsx` covers R10 to R22 — the
two groups and their order, the sheet grouping, a win with no code, the
hand-over in place, the dash for an unsigned claim, and the undo.
`PlayersModule.test.tsx` covers R1 to R9 including R6 as narrowed above and
R7's message. `SpinsModule.test.tsx` covers R23 to R25 and the author's
column.

R31 and R32 arrived later, with the counter's report. R31 is two assertions
on the back link's `href` — with a search in the address bar and without —
and R32 is a list of one, a complete code typed that matches nobody, and no
customer's page either before the refetch or after it. R32's test was
checked against the bug: without the guard it opens the customer the
previous code found. What found the bug in the first place was the real
admin driven in a browser, which is also where the appended twenty-two
digits were read off the box. `npm run typecheck` and `npm run lint` are clean — lint reports the
same `set-state-in-effect` warning every module in this admin reports.

**Not looked at in a browser.** Every screen here is behind the admin
login, and the account's password is not this session's to type. So R29 —
375px, no horizontal scroll, the hand-over control reachable — is the one
criterion the suites cannot answer, and it is left unticked rather than
assumed. The cards are a flex column at 375px by construction, which is why
they are cards and not rows in [F11](./F11-admin-tables.md)'s table.

## 13. Decisions and risks

- **The counter is the customer's page, not a screen of its own.** The
  alternative considered was a dedicated claim desk: one box, one card, one
  button, nothing else. It is a better screen for exactly one ticket and a
  worse one for everything around it — the customer who won three things,
  the customer who lost their ticket and has only their number, the owner
  looking up what somebody was given last week. A customer-shaped screen
  answers all of those, and the ticket becomes a way of *finding* the
  customer rather than a thing with a page of its own.
- **The code searches for a person (R1).** It would have been simpler to
  leave the code where [F16](./F16-a-code-on-every-win.md) put it, in the
  Spins filter. But a code identifies a win, a win has an owner, and the
  owner is what the counter needs on screen. Both boxes take both things
  now, which costs one shared matcher and means staff never have to know
  which module a ticket belongs to.
- **Losing spins leave both lists (R13, R23).** They stay in the database,
  they are counted in both headers, and
  [F32](./F32-what-the-game-costs-and-brings.md) is where they become a number
  worth reading. What they never were is worth a row at a counter. The risk
  is that the Spins module stops being the complete record it was, which
  R24's sentence and the roadmap's CSV export are the answers to — and the
  export must carry them.
- **One author, cleared on undo (R20).** An append-only trail of claims and
  un-claims is the thorough answer and is its own feature with its own
  table. What this records is who handed the prize over, which is the
  question a dispute actually asks. The cost is real and worth stating: a
  member of staff who claims a reward and immediately takes it back leaves
  no trace of having done so.
- **Recording the account only means something if there is more than one.**
  [F07](./F07-admin-login.md) allows as many as a shop creates, and today a
  shop probably has one. The column is right anyway: it costs one nullable
  integer now, and retrofitting it later means every claim before the change
  has a dash forever — which is exactly what R22 already has to say about
  the claims made before today.
- **Risk: two members of staff, one counter.** Nothing locks a win while
  somebody is looking at it. The last press wins and the card then shows the
  truth, which is the honest behaviour for two people with one customer
  between them; a lock would be a worse failure the first time somebody
  walked away from a screen.
- **Risk: "Customers" renames a module people have bookmarked.** The URL
  stays `/admin/players`, so nothing breaks; only the word on the tab
  changes. Renaming the route as well would be a second rename for no gain.

## 14. Open questions

- None.
