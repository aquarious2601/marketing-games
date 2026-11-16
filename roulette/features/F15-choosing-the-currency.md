# F15 — Choosing the currency

| | |
|---|---|
| **ID** | F15 |
| **Status** | Agreed |
| **Interface** | Admin |
| **Depends on** | [F04](./F04-branding-and-themes.md), [F12](./F12-multiple-languages.md), [F13](./F13-reward-configuration.md) |
| **Agreed on** | 2026-11-16 |

## 1. Summary

The admin picks the currency an amount-off reward is counted in, from the
reward form where it matters and from the branding section where the
campaign's other settings live — starting from the one their language
suggests.

## 2. Why

[F13](./F13-reward-configuration.md) gave the campaign a currency, stored it,
validated it and sent it to both pages. It never built a control to choose
one. The admin API has accepted `currency` on a `PUT` since F13 and no screen
has ever sent it, so every campaign in existence is counted in Vietnamese
đồng because that is what the column defaults to.

The gap shows up exactly where the currency matters: the amount-off field in
the reward editor is labelled with a symbol the admin cannot change. A shop
in Paris types `5` meaning five euros and the catalogue reads `5₫`.

And the application already knows something useful about which currency is
likely: the admin is reading it in a language they chose (F12 R3). A French
admin should not have to find a dropdown to say they mean euros.

## 3. Actors

| Actor | Role |
|---|---|
| **Admin** | Creates amount-off rewards and sets the campaign's currency |
| **Player** | Reads an amount they have won, in that currency. Chooses nothing. |

## 4. User stories

- As an **admin**, I want **to choose the currency where I type the amount**,
  so that **I find it at the moment I need it rather than hunting for it**.
- As an **admin**, I want **it to start on the currency my language
  suggests**, so that **the common case needs no decision at all**.
- As an **admin**, I want **one currency for the campaign**, so that **the
  wheel cannot offer €5 off beside ₫50,000 off**.

## 5. Scope

### In scope

- A currency picker in the reward editor, shown for the type that takes an
  amount.
- The same picker in the branding section, beside the theme.
- A per-language default, used only until a currency has been chosen.
- `CNY` added to the list, so every language the application speaks has a
  currency to default to.

### Out of scope

- **A currency per reward.** Confirmed again here: a shop trades in one
  currency ([F13](./F13-reward-configuration.md) R27). A wheel offering €5
  off beside ₫50,000 off is a wheel nobody can reason about, and it would
  need a currency column on `spin` as well so an old record still read
  correctly.
- **Converting amounts.** Changing the currency re-labels the numbers; it
  does not touch them. `50000` stays `50000`. See section 13.
- **Currencies beyond the five.** A closed list, for the reasons
  `Currency` already gives.
- **Letting the player choose.** The amount is the shop's, not the reader's.

## 6. Rules

| # | Rule |
|---|---|
| R1 | `CNY` joins the list, symbol `¥`, written before the number. |
| R2 | Each supported language has a default currency: `en` → `USD`, `fr` → `EUR`, `vi` → `VND`, `zh` → `CNY`. |
| R3 | A language with no entry in R2 falls back to `USD`. The map is keyed on the language, not the region. |
| R4 | `branding.currency` is **nullable**, and null means *nobody has chosen yet* — exactly as a null `tagline` means the admin has not written one (F04 R8). |
| R5 | The **effective** currency is the one chosen, or, where none has been, the default for the language of the request. |
| R6 | The admin API reports all three: the effective currency with its symbol, the chosen one or null, and the default for this admin's language. The player API reports only the effective one and its symbol — there is nothing there for a player to decide. |
| R7 | The reward editor shows a currency picker when, and only when, the type takes an amount (F13 R3). |
| R8 | That picker starts on the effective currency (R5), so an admin whose campaign has never chosen one sees their language's. |
| R9 | Saving an amount-off reward saves the picker's value as the campaign's currency. After that the campaign has chosen, and R5's default no longer applies to it. |
| R10 | The same picker is in the branding section beside the theme, on the same value, and saving the branding saves it. |
| R11 | Changing the currency **never** changes an amount. Every amount-off reward is re-labelled at once and no number moves. |
| R12 | Switching the interface language never changes a currency that has been chosen. It changes only what an unchosen campaign falls back to. |
| R13 | An amount-off reward cannot exist while the campaign's currency is unchosen, because R9 makes choosing it part of creating one. So a player is never shown an amount in a currency nobody picked. |
| R14 | The list, the symbols and the defaults are the server's, sent to the browser. Neither page carries its own table of them (F13 R28). |

## 7. Data model

| Entity | Field | Type | Notes |
|---|---|---|---|
| `Branding` | `currency` | `varchar(3)`, **nullable** | Was `NOT NULL DEFAULT 'VND'`. Null is "not chosen" (R4). |

Widening a column to nullable loses nothing, so `doctrine:schema:update`
applies it and [P02](./P02-database-upgrades.md) needs no new step. P02's
own step for this column is changed to add it nullable, so a pre-F13
database upgraded after today arrives in the same shape as one upgraded
before it.

A campaign that already holds a currency counts as having chosen, and R12
then leaves it alone. That is the safe reading — it is what the player has
been shown — but it has one sharp edge, found the day this shipped:

> the default currency proposed in the game config is vnd while the
> language is french

[P02](./P02-database-upgrades.md) R19's first version had written `'VND'`
into that column itself, back when it could not be null. F15 then read that
as a deliberate choice, so a French campaign opened its picker on đồng, and
the admin created `bon d'achat 20€` — twenty euros — against a campaign
counted in đồng. P02 R21 now takes back a `VND` nobody picked, but only
while no reward is counted in money: once an amount exists, no upgrade may
decide what it means. That campaign's currency was corrected by hand, which
is the right answer for a number a person typed.

## 8. API surface

No new endpoints. The branding payload gains two fields:

| Field | Audience | Meaning |
|---|---|---|
| `currency` | both | The effective code (R5) |
| `currencySymbol` | both | Its symbol |
| `ownCurrency` | admin | The chosen code, or `null` |
| `defaultCurrency` | admin | The default for this admin's language |
| `currencies` | admin | The list, each with code and symbol |

`PUT /api/admin/branding` already accepts `currency` and validates it against
the list. Absent still leaves the stored value alone (F13 R27), and there is
no way to *un*choose — nothing in the interface offers it, so building the
path would be building a door nobody can reach.

`POST`/`PUT /api/admin/rewards` accept an optional `currency` alongside an
amount-off reward, applied to the campaign (R9) in the same request, so the
admin's one save is one save.

## 9. Interface

### Admin view

In the **reward editor**, when the type is *Amount off*, the value field and
a currency `<select>` sit on one line — the amount and what it is counted in
are one answer, so they are one row. The field's suffix shows the chosen
symbol and updates as the select changes.

In the **branding section**, the picker sits beside the theme, labelled
**Currency**, with a line of help naming what it affects: every amount-off
reward, and nothing else.

Options read as the code and the symbol together — `EUR €`, `VND ₫` — so the
admin recognises either.

### Player view

Unchanged. The amount on the result panel is already formatted with the
campaign's symbol (F13 R28).

### Responsive behaviour

At 375px the amount and the currency stay on one line; the select is sized to
its content and the amount takes the rest.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| A currency not in the list | 422 against the `currency` field, as F13 already does |
| `currency` absent from a reward save | The campaign's currency is left alone |
| `currency` sent with a type that takes no amount | Ignored, like a value for such a type (F13 R3) |
| The campaign has no currency and the admin's language is unknown | `USD` (R3) |
| The amount is invalid *and* the currency is | Both violations come back, each against its own field |

## 11. Acceptance criteria

- [x] Given a French admin and a campaign that has never chosen, when they
      open the reward editor and pick *Amount off*, then the picker shows
      `EUR` and the suffix reads `€`.
- [x] Given the same, when they save the reward, then the campaign's
      currency is `EUR`.
- [x] Given a campaign counted in `VND`, when an English admin opens it,
      then it still reads `VND` — the language has not moved it (R12).
- [x] Given the currency is changed, then the amounts are relabelled and no
      stored amount changes.
- [x] Given the type is *Free product* or *Percentage off*, then no currency
      picker is shown, and no currency is sent when it is saved.
- [x] Given the branding section, when the currency is changed, then it is
      saved with the rest of the branding.
- [x] Given a Chinese admin, then the default is `CNY` and the symbol `¥`.
- [ ] Given the branding section is saved, then the Rewards tab shows the
      new symbol. _Each half is covered; the two screens have not been seen
      together, which needs a browser — see section 12._

## 12. Verification

`php vendor/bin/phpunit` — 401 tests. `CurrencyTest` covers R1–R3 including
the regional tags F12 already strips; `CurrencyChoiceTest` covers R2, R6,
R8, R10 and R12 against four `Accept-Language` headers, and asserts the
player is sent no choice at all; `RewardControllerTest` covers R7 and R9.

`npm test` — 536 tests. `BrandingSection.test.tsx` and
`RewardsModule.test.tsx` cover the two pickers, that they open on the right
value, that the amount field's suffix follows the select, and that a free
product carries no currency.

`npx playwright test` — 74 desktop specs and the admin specs at 375px, all
passing, including the no-horizontal-scroll check that the new one-line
amount-and-currency row could have broken.

**Not looked at in a browser.** Seeing either picker needs an admin
account, and creating one was not permitted in this session.

## 13. Decisions and risks

- **Null means unchosen, as it does for the tagline.** `Branding` already
  distinguishes "the admin's phrase" from "the default" with a nullable
  column and two getters (F04 R8). A currency is the same shape of fact, and
  copying the pattern means one idea in the entity rather than two.
- **The default resolves per request, the choice does not (R5, R12).** This
  is the whole safety of the feature. If the *stored* currency followed the
  interface language, an admin reading a Vietnamese campaign in French would
  convert ₫50,000 into €50,000 by doing nothing but switching a dropdown —
  a number untouched and its meaning multiplied by thirty thousand. The
  language may only decide what an unchosen campaign falls back to.
- **R13 is what keeps R5 from reaching a player.** A derived currency is a
  guess, and a guess must never be shown as the value of a prize. Because
  the only way to create an amount-off reward is through a form that saves
  the currency with it, no amount can exist while the currency is a guess.
- **Saving the currency from the reward form (R9).** It is a campaign
  setting changed from a reward's screen, which is the sort of thing that
  surprises people. It is right here because the admin is being *asked* the
  question at the only moment they certainly know the answer — they are
  typing an amount. The branding section (R10) is where they will look to
  change it later, which is why it is in both.
- **The code and the symbol in the option label.** `EUR €` rather than
  `Euro`. The code needs no translation, which keeps this list out of the
  four dictionaries, and the symbol is what will actually appear on the
  player's screen.
- **Risk: an admin changes the currency and expects the amounts to convert.**
  They do not (R11), and the help text under the picker says what it
  affects. A conversion would need rates, a date and a rounding rule, none
  of which belong in a prize wheel.
- **Risk: `CNY` is added for a language, not a request.** No Chinese shop has
  asked for it. It is here because R2 would otherwise have a hole in it, and
  a default of `USD` for a Chinese admin is a worse kind of wrong than an
  unused enum case.

## 14. Open questions

- None.
