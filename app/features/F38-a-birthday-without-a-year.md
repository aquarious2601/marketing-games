# F38 — A birthday without a year

| | |
|---|---|
| **ID** | F38 |
| **Interface** | Both |
| **Depends on** | [F08](./F08-player-identification.md), [F11](./F11-admin-tables.md), [F12](./F12-multiple-languages.md), [P02](./P02-database-upgrades.md) |
| **Amends** | [F08](./F08-player-identification.md) R9, R10 (the birthday was a full date) |
| **Status** | Agreed |
| **Agreed on** | 2026-11-26 |

## 1. Summary

Registration asks for the day and the month of a customer's birthday, and
not the year, because a birthday gift needs the date and not the age.

## 2. Why

The shop collects a birthday so it can send something on it. That needs two
numbers out of three. The third is the one that says how old somebody is,
and it is the one that would matter if the table ever went somewhere it
should not.

It is also a question that costs something to ask. A date field on a phone
opens on the current year and makes the customer scroll back thirty of them,
at a counter, with somebody waiting. Two short lists are quicker and have no
wrong answer to get right.

Nothing in the application has ever read the year: no age check, no
eligibility rule, nothing on a screen but the date itself. It has been
collected because a date field collects it.

## 3. Actors

| Actor | Role |
|---|---|
| **Customer** | Gives a day and a month at registration, and is not asked their age. |
| **Shop owner** | Sees the day and month on a customer's page, which is what a card or a gift needs. |

## 4. User stories

- As a **customer**, I want to give my birthday without my age, so that the
  shop has what it needs to send me something and nothing it does not.
- As a **shop owner**, I want the form to be quick at the counter, so that
  registering somebody is not a scroll through thirty years.

## 5. Scope

### In scope

- A day picker and a month picker in place of the date field.
- Storing the day and the month for every customer.
- Showing a birthday as a day and a month, in the admin's language.
- An upgrade that fills the two from the dates already on file.

### Out of scope

- **Deleting the years already collected.** Asked and answered: they stay
  (R5). The application stops reading them; it does not reach into the table
  and take them.
- **Sending anything on a birthday.** This feature is about what is
  collected. The card, the message and the list of whose birthday it is
  today are a feature that will want this one to exist first (§14).
- **Any other field of the form.** The name, the surname and the number are
  unchanged.

## 6. Rules

| # | Rule |
|---|---|
| R1 | Registration asks for a day and a month. No year is asked for anywhere, in any language. |
| R2 | Two controls side by side: a day, 1 to 31, and a month named rather than numbered, in the reader's language. |
| R3 | A pair that is not a date — 31 February, 31 April — is refused with a sentence that says so. 29 February is accepted: it is a birthday somebody has. |
| R4 | Both are required, as the date they replace was ([F08](./F08-player-identification.md) R9). |
| R5 | A customer registered before this keeps the year already on file. Nothing is deleted, and nothing new is written there. |
| R6 | The year is not shown anywhere and is not sent to any page. |
| R7 | A birthday is shown as a day and a month, in the admin's language — "12 March", "12 mars" — on the customer's page and in the customers table ([F11](./F11-admin-tables.md)). |
| R8 | The spin log still carries no birthday at all ([F08](./F08-player-identification.md) R24, unchanged). |
| R9 | The month's name is formatted by the page from the number, in the reader's own language. No list of month names is typed into this repository in four languages. |
| R10 | Every label this adds exists in all four languages ([F12](./F12-multiple-languages.md) R9). |

## 7. Data model

| Entity | Field | Type | Notes |
|---|---|---|---|
| Player | `birth_day` | smallint, not null | 1–31. |
| Player | `birth_month` | smallint, not null | 1–12. |
| Player | `birthday` | date, **becomes nullable** | The full date, where one was collected (R5). Never written again. |

Upgrade steps (P02), ordered and idempotent:

1. `player.birth_day` — add it, nullable.
2. `player.birth_month` — add it, nullable.
3. Fill both from `player.birthday` for every row that has one.
4. Require both, once every row has them.
5. Let `player.birthday` be null, so a customer registered from now on can
   have a birthday without having a date.

Step 5 is what makes R5 and R4 true at the same time: the column stays for
the rows that filled it, and stops being something every row must have.

## 8. API surface

| Method | Path | Change |
|---|---|---|
| `POST /api/player/register` | `birthday` is replaced by `birthDay` and `birthMonth`, both integers. |
| `GET /api/admin/players` | each row's `birthday` is replaced by `birthDay` and `birthMonth`. |
| `GET /api/admin/players/{id}` | the same. |

No endpoint sends a year (R6).

## 9. Interface

### Player view

The details step's third field becomes two, side by side: **Day** and
**Month**. The month lists names, not numbers. The pair is validated when the
form is submitted, with one message under the two controls.

### Admin view

A customer's page and the customers table show "12 March", formatted by the
page from two numbers in the admin's language.

### Responsive behaviour

At 375px the two controls sit side by side and fill the width between them:
a day is two characters and a month name is the rest.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| Either control left unchosen | Refused: the birthday is required (R4). |
| 31 February, 31 April, 31 June, 31 September, 31 November | Refused, naming the month. |
| 29 February | Accepted (R3). |
| A day outside 1–31 or a month outside 1–12 arriving at the endpoint | Refused. The controls cannot produce it; another client can. |
| A row whose `birthday` is null and whose day and month are set | Normal, and the shape of every customer registered from now on. |

## 11. Acceptance criteria

- [ ] Given the registration form, then there is no year control anywhere on
      it (R1).
- [ ] Given the month control, then it lists names in the reader's language
      (R2, R9).
- [ ] Given 31 and February, then it is refused with a sentence naming the
      month (R3).
- [ ] Given 29 and February, then it is accepted (R3).
- [ ] Given either control unchosen, then the form refuses (R4).
- [ ] Given a customer registered before the upgrade, then their year is
      still in the database afterwards (R5).
- [ ] Given any payload this feature sends, then no year is in it (R6).
- [ ] Given a customer's page, then their birthday reads as a day and a
      month in the admin's language (R7).
- [ ] Given the spin log, then it carries no birthday (R8).
- [ ] Given the upgrade on a table of customers, then every row has a day
      and a month taken from the date it had (§7).
- [ ] Given the upgrade runs twice, then the second run changes nothing.
- [ ] Every label this adds exists in all four languages (R10).
- [ ] The four fast suites pass.

## 12. Verification

`php vendor/bin/phpunit` — 784 tests. `IdentityControllerTest` carries R1,
R3 and R4: eleven pairs that are not a birthday, each refused against the
`birthday` field; the 29th of February accepted; and a year sent by some
other client not stored, which is R1 read as a promise rather than as a
form. `PlayerControllerTest` carries R6 and R7 — the admin's payload has
`birthDay` and `birthMonth` in it and no `birthday` at all.
`DatabaseUpgradeTest` carries §7's five steps.

`npm test` — 977 tests. `identity.test.ts` carries the same rules on the
page, which is where somebody at a counter meets them: both pickers
required, the impossible pairs refused, the 29th accepted, and nothing asked
about a year. `months.test.ts` carries R9 and the two things that would be
quietly wrong if the browser were asked carelessly — the order of the names
and the timezone they are formatted in. `PlayerPage.test.tsx` walks the
whole registration with the two pickers, and `PlayersModule.test.tsx`
asserts R6 from the other end: the row shows the day and the month, and
cannot show 1994 because the payload has no year in it.

`npm run typecheck` and `npm run lint` are clean.

**The upgrade, run against the real database.** On development, with
customers already in the table: both columns added, every row filled from
the date it had, both required, and `birthday` made optional. A second run
reported every step as already applied, and `doctrine:schema:update
--dump-sql` then had nothing to say.

**R5, checked rather than assumed.** After the upgrade the years are still
in the table — that is the rule — and no endpoint sends one.

## 13. Decisions and risks

**Why the years stay.** Deleting them is the tidier end state and it is not
this feature's call to make: they were collected from real people under no
promise that they would be thrown away, and a column dropped is a column
nobody can get back. The owner chose to keep them. What changes is that
nothing asks for one, nothing writes one, and nothing shows one — so the
year on file ages out of relevance rather than being deleted out of it.

The honest cost: the table now holds something the application does not use.
That is a thing to be deliberate about rather than quiet about, which is why
it is written here and in §7.

**Why two pickers rather than DD/MM.** 03/12 is the third of December in one
country and March the twelfth in another, and the customer typing it and the
owner reading it may not be in the same one. A named month has no second
reading.

**Why the month names are not translated here.** Every browser can already
name a month in the reader's language. Typing twelve names into four
dictionaries would be forty-eight strings to maintain and forty-eight chances
to be subtly wrong in a language nobody on the project reads.

**The risk.** `birthday` becoming nullable means any code that reads it has
to cope with null. There is one such place today — the presenter — and this
feature replaces what it sends. Anything added later that wants a full date
will find it absent for most customers, which §14 is about.

## 14. Open questions

- The feature this one is for: whose birthday is it today, and what does the
  shop send them? It needs a list by day and month, which this makes
  possible for the first time.
- Should a customer be able to correct their birthday? Today nobody can,
  which was easier to live with when the field was a date somebody typed
  once and harder once it is two pickers somebody may fumble.
