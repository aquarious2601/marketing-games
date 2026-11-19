# P04 — Many shops in one installation

| | |
|---|---|
| **ID** | P04 |
| **Status** | Draft |
| **Interface** | Platform |
| **Depends on** | [P02](./P02-database-upgrades.md), [F07](./F07-admin-login.md), [F19](./F19-one-person-one-number.md), [F23](./F23-a-daily-spin-limit.md) |
| **Agreed on** | — |
| **Amends** | [F04](./F04-branding-and-themes.md) R1, R2, R18, [F07](./F07-admin-login.md) R19, [F08](./F08-player-identification.md) R7, [F12](./F12-multiple-languages.md) R3, [F15](./F15-choosing-the-currency.md) R2, R8, [F23](./F23-a-daily-spin-limit.md) R2, R7 |

## 1. Summary

One installation stops being one shop's game and becomes a platform: an
owner has a company profile, shops, and games they build; a shop shows one
of those games; and every row in the database belongs to somebody.

It is a platform feature because almost nothing changes on screen. Two
edges are visible and unavoidable: the player arrives through a link that
names their shop's game rather than through `/`, and a link to a game a shop
no longer shows has to say something. Everything else — the modules, the
wheel, the identification, the limit — looks exactly as it does today for
the shop that today's data becomes.

## 2. Why

The product is a SaaS: each owner runs several shops. Nothing in the schema
knows that. There are seven entities and no tenant column;
`BrandingProvider::getOrCreate()` hands out *the* one campaign and creates it
when it is missing; and `player.phone`, `reward.name` and `user.username`
are each unique across the whole database.

That last one is not an inconvenience, it is a leak. With two owners on one
installation, a customer who registers at either is a single shared row — so
one owner's daily count includes the other's spins, and typing a phone
number at one owner's stall returns a customer, with the first name and
birthday [F08](./F08-player-identification.md) collects, who registered
somewhere else entirely.

The cost also grows with every feature. The withdrawn
[F24](./F24-the-campaigns-timezone.md) is one column of this work, and
[F23](./F23-a-daily-spin-limit.md)'s "how many times has this person played
today" is already a query that cannot answer the question a shop is actually
asking. Built before this lands, each of those is a retrofit; built after,
each is ordinary.

## 3. Actors

| Actor | Role |
|---|---|
| **Owner** | The paying customer. Has a company profile, shops and games, and never sees another owner's anything |
| **Shop** | A place with a stall. Picks the game it is running, and trades in its owner's timezone |
| **Admin** | Signs in and works inside one owner's data, as today, without noticing the scoping |
| **Player** | Arrives by a link, plays the game that shop is running, and is the same customer at any of that owner's shops |
| **Operator** | Creates the first owner, profile, shop and game from the console, because a platform feature should be verifiable without a user interface |

## 4. User stories

- As an **owner**, I want **several shops under one account**, so that **a
  chain is one login rather than one deployment per branch**.
- As an **owner**, I want **to say who my company is once**, so that **every
  game I build carries my name, my logo and my currency without my typing
  them again**.
- As an **owner**, I want **to build a game once and run it in whichever
  shops I choose**, so that **a promotion is configured once, not per
  branch**.
- As an **owner**, I want **my customers to be mine**, so that **nobody
  else's shop can look up a number I collected**.
- As a **shop**, I want **my own prize budget**, so that **my limit is not
  spent in another branch**.
- As a **player**, I want **the link on the stall to open the game that
  stall is running**, so that **I do not have to pick anything**.

## 5. Scope

### In scope

- `Account` with the owner's profile, `Shop`, `Game`, and the pairing that
  gives a game-at-a-shop its own link.
- The rule that an incomplete profile may create nothing.
- An owner column or a shop column on every existing table, and a request
  that knows which one it is for.
- Every repository query scoped, and a test that proves a missing scope is
  caught.
- The owner's timezone, which is where [F24](./F24-the-campaigns-timezone.md)
  should have put it.
- A [P02](./P02-database-upgrades.md) migration turning today's single
  campaign into one owner, one shop, one game, with its link.
- Console commands to create an owner, fill a profile, create a shop and a
  game, and print a shop's link.

### Out of scope

- **The admin screens** — the profile form, creating shops and games,
  switching which game a shop runs, copying a link or printing its QR code.
  That is the feature people will actually see, and it is **F25**; this one
  gives it something to stand on. P04 ships the API and console commands
  instead, so it can be verified and operated without waiting for a UI.
- **Sign-up, onboarding and billing.** An owner is created by the operator
  here. Self-service is a product, not a column.
- **Teams and roles.** One owner still has admins with
  [F07](./F07-admin-login.md)'s single role.
- **Signing in by email.** `user.username` stays globally unique so
  [F07](./F07-admin-login.md)'s login is untouched. The profile's contact
  email is who to reach, not how to sign in — an email identity is its own
  feature and the natural companion to sign-up.
- **Reporting across an owner's shops.** The Spins and Players modules stay
  per shop. A chain-wide dashboard is on [`ROADMAP.md`](./ROADMAP.md).
- **Moving a game between owners**, and any sharing of games or customers
  between owners. Both are explicitly impossible here.

## 6. Rules

### The model

| # | Rule |
|---|---|
| R1 | An **owner** is an `account`. Everything in the database belongs to exactly one account, directly or through its parent. |
| R2 | An account has many **shops**. A shop is a place: it has a name, and the spins that happened there. |
| R3 | An account has many **games**. A game is the promotion — campaign name, tagline, theme, a wheel with its prizes, and a daily spin limit — and it belongs to the account, not to a shop. |
| R4 | A game may be paired with a shop. A pairing is its own row, carrying the link key that game-at-that-shop is reached by. One game may be paired with many shops; one shop may have many pairings. |
| R5 | A shop runs **at most one** game at a time: exactly one of its pairings is current. A shop with no current pairing is not open for play. |
| R6 | A **player** belongs to an account, not to a shop. One customer visiting two of an owner's shops is one row, with one history; the same number at a different owner is a different person who shares nothing. |
| R7 | A **spin** belongs to a shop — it happened at a place — and records the game it was played on, so the log survives the shop moving to another promotion. |
| R8 | The **reward catalogue** belongs to the account, so one owner's prizes can be used by all of their games. |

### The owner's profile

| # | Rule |
|---|---|
| R9 | The account carries the owner's profile: **company name**, **company logo**, **contact email**, **timezone**, **currency**, and the **language a player page opens in**. All six are required. |
| R10 | Every one of an owner's shops trades in the account's timezone. An owner with shops in two timezones is two accounts. This is why the clock is not on the shop, and it is the answer [F24](./F24-the-campaigns-timezone.md) was looking for. |
| R11 | An account whose profile is incomplete may **create** nothing: no shop, no game, no reward. It may still edit what it already has, and anything already running keeps running — including every player page. |
| R12 | A refused creation answers `409` and names the missing fields. Not `422`: the payload is not wrong, the account is not ready, and a client needs to tell those apart to say anything useful. |
| R13 | Company name stops being optional ([F04](./F04-branding-and-themes.md) R2) and the logo stops being removable to nothing ([F04](./F04-branding-and-themes.md) R18). Both are the owner's identity and every game shows them, so the player page's text fallback for a missing logo becomes unreachable rather than wrong. |
| R14 | The currency moves from the game to the account ([F15](./F15-choosing-the-currency.md) R2, R8): one timezone implies one country. Changing it still re-labels amounts and never converts them, exactly as [F15](./F15-choosing-the-currency.md) R11 already holds. |
| R15 | The account's language is the player page's default, ahead of the browser's preference ([F12](./F12-multiple-languages.md) R3). A player's own choice still wins and is still remembered per browser ([F12](./F12-multiple-languages.md) R7). |

### Where a game is played

| # | Rule |
|---|---|
| R16 | A pairing's link key is opaque, unguessable and unique across the installation. It names no shop, no owner and no game. |
| R17 | The player's entry point is `/play/{key}`. It resolves the pairing, and from it the shop, the game, the account and therefore the wheel, the company's branding and the currency. |
| R18 | A key is live only while its pairing is the shop's current one. |
| R19 | A key whose pairing is **not** current shows a plain page saying this promotion has ended. Not a redirect to whatever the shop is running now: a customer scanned a specific offer, and quietly serving a different one is how a shop ends up arguing about a prize at the counter. Switching a shop's game therefore means reprinting, which is the honest cost of being truthful to the person holding the phone. |
| R20 | An unknown key shows the same page as an ended one, and says nothing about whether it ever existed. Neither page carries any company's branding, because the unknown case has none to carry and the two must be indistinguishable. |
| R21 | `/` serves the player page only while the installation has exactly one shop with a current pairing — which is what the migration leaves, so every existing link, bookmark and manual test keeps working. Otherwise `/` says a link is needed. |
| R22 | A player's session is bound to the pairing it identified against. Spinning uses the shop and game from the session, never from anything the request body carries. |

### Who sees what

| # | Rule |
|---|---|
| R23 | Every request resolves exactly one account before it touches data: from the key on player routes, from the signed-in user on admin routes. |
| R24 | A request that resolves no account reads nothing. There is no "all accounts" query outside the console commands. |
| R25 | Every repository method takes the account or shop it is for. None of them has a default, because a default is how one gets forgotten. |
| R26 | `player.phone` and [F19](./F19-one-person-one-number.md)'s `player.phone_tail` are unique **per account**, not per installation. This amends [F08](./F08-player-identification.md) R7: the same number is the same person within an owner's shops, and a different person across owners. |
| R27 | `reward.name` is unique per account. `user.username` stays unique per installation, so [F07](./F07-admin-login.md)'s login is unchanged. |
| R28 | `spin.reward_code` stays unique per installation. A code is typed at a counter by a human, and a code from another owner's shop simply does not resolve. |
| R29 | A URL that names a row belonging to another account answers `404`, not `403`. `403` confirms the row exists. |

### The day, and the limit

| # | Rule |
|---|---|
| R30 | The day's boundary ([F23](./F23-a-daily-spin-limit.md) R6) is midnight in the **account's** timezone. This amends [F23](./F23-a-daily-spin-limit.md) R7, which made it a deployment setting, and settles what [F24](./F24-the-campaigns-timezone.md) could not. |
| R31 | An account's timezone is required (R9), is an identifier the runtime recognises, and has no default — a default is a guess at the one fact only the owner knows. |
| R32 | `APP_TIMEZONE` survives only to seed the account the migration creates, and is then unused. The runbook stops asking for `TIMEZONE` once no account depends on it. |
| R33 | A daily spin limit counts spins **at that shop**. A customer visiting two of an owner's shops on one day gets each shop's allowance, because the spin and the prize it costs are the shop's. This amends [F23](./F23-a-daily-spin-limit.md) R2, which counted a person across the installation. The limit is the game's, the clock is the account's, and the counting is the shop's. |

### Moving today's data

| # | Rule |
|---|---|
| R34 | The migration is [P02](./P02-database-upgrades.md) steps: idempotent, asking the database rather than a version table, and safe to run twice. |
| R35 | It creates one account, one shop and one game from what is already there. The game takes the existing campaign's name, tagline, theme and limit with its wheel; the account takes the existing company name, logo and currency, plus `APP_TIMEZONE`; the pairing is made current and given a key. |
| R36 | The account it creates may be **incomplete**: there is no contact email in today's data to take, and possibly no logo, company name or currency either. Nothing already serving stops serving (R11) — the gate asks the owner for the rest the first time they try to create something. A migration does not invent an owner's email address. |
| R37 | Every existing player, spin, reward and admin user is attached to that account, and every existing spin to that shop. Nothing is deleted and nothing is renumbered. |
| R38 | Columns are added nullable, filled, then constrained — the pattern the existing steps already use — so an interrupted upgrade leaves a database that still serves. The per-installation unique indexes are dropped only after the per-account ones exist and are populated. |

### Operating it without a user interface

| # | Rule |
|---|---|
| R39 | `app:account:create`, `app:account:profile`, `app:shop:create`, `app:game:create` and `app:shop:run` (point a shop at a game) exist as console commands. |
| R40 | `app:shop:link` prints a shop's current link, which is the only way to get one before **F25**. |
| R41 | The commands are the one place allowed to work across accounts, and they take the account as an argument rather than inferring it. |

## 7. Data model

### New

| Entity | Field | Type | Notes |
|---|---|---|---|
| `Account` | `id`, `created_at` | | The owner. Named `Account` because `User` is already [F07](./F07-admin-login.md)'s login |
| | `company_name` | `VARCHAR(60)` | Was [F04](./F04-branding-and-themes.md)'s optional field; now required (R13) |
| | `logo_filename`, `logo_content_type` | | Moved off the campaign. The file's path gains the account |
| | `contact_email` | `VARCHAR(180)` | Who to reach. Not a login (see *Out of scope*) |
| | `timezone` | `VARCHAR(64)` | An IANA identifier (R31) |
| | `currency` | `CHAR(3)` | Moved off the campaign (R14) |
| | `language` | `CHAR(2)` | One of [F12](./F12-multiple-languages.md)'s four (R15) |
| `Shop` | `id`, `account_id`, `name`, `created_at` | | No clock: its owner has one (R10) |
| `Game` | `id`, `account_id`, `name`, `created_at` | | Plus the campaign columns that remain |
| `ShopGame` | `id`, `shop_id`, `game_id`, `url_key`, `is_current`, `created_at` | `url_key` `VARCHAR(32)` unique | The pairing (R4). At most one current row per shop |

All six profile columns are nullable in the schema and required by the
gate. The database cannot express "complete enough to serve, not complete
enough to create", and a `NOT NULL` would make the migration impossible
(R36).

### Changed

| Table | Change |
|---|---|
| `branding` | Becomes the game: gains `account_id` and `name`, loses `company_name`, `logo_filename`, `logo_content_type` and `currency` to the account. Keeps `campaign_name`, `tagline`, `theme` and `daily_spin_limit`. The table name stays for now — [section 13](#13-decisions-and-risks) |
| `wheel` | Gains `game_id`, not null |
| `reward` | Gains `account_id`; `name` unique becomes unique on (`account_id`, `name`) |
| `player` | Gains `account_id`; `phone` and `phone_tail` uniqueness becomes per account |
| `spin` | Gains `shop_id` not null and `game_id` nullable; `idx_spin_spun_at` becomes (`shop_id`, `spun_at`), which is the index [F23](./F23-a-daily-spin-limit.md)'s count now needs |
| `user` | Gains `account_id`; `username` unchanged |
| `prize` | Unchanged — it reaches its account through its wheel |

### The request's account

A `TenantContext` resolved once per request, holding the account and, on
player routes, the shop and game. `BrandingProvider::getOrCreate()` is
replaced: there is no longer *the* campaign to create
([F04](./F04-branding-and-themes.md) R1), and a request that cannot say
which game it means is a bug rather than a reason to make one. What the
player page calls its branding is now composed from two rows — the
account's identity and the game's dressing.

## 8. API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/play/{key}` | — | The wheel, the company's branding and the game's dressing for that pairing. Replaces `GET /api/wheel` |
| `GET`/`PUT` | `/api/admin/profile` | Admin | The six profile fields, and which of them are missing |
| `POST` | `/api/player/identify`, `/register`, `GET /me` | Session | Unchanged in shape; scoped to the session's account |
| `POST` | `/api/spin` | Session | Unchanged in shape; the shop and game come from the session (R22) |
| `GET`/`PUT` | `/api/admin/*` | Admin | Unchanged in shape; scoped to the signed-in user's account. Creating routes may answer `409` (R12) |

A `409` from a creating route carries the field names rather than prose, so
a client can render its own list:

```json
{ "error": "profile_incomplete", "missing": ["contactEmail", "timezone"] }
```

No admin route gains a shop parameter in this feature: the admin works on
the one shop its account has after migration. Choosing between several is
**F25**.

## 9. Interface

### Player view

Unchanged, with one addition: the page for a key that is not current, or not
known (R19, R20). A title, one line saying the promotion has ended, and
deliberately no branding — there is no company to brand it with when the key
is unknown, and the two cases must look identical.

### Admin view

Unchanged. The modules work on the account resolved from the session, which
for a migrated installation is the only account there is. The profile has an
API and a console command here; its form, and the banner that chases an
owner to fill it in, are **F25** — which is also the only place that creates
anything, so before F25 the gate is a console-side rule.

### Responsive behaviour

The ended-promotion page obeys the player page's rule: readable at 375px
with nothing to scroll.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| `/play/{key}` with a current key | The game plays |
| `/play/{key}` with a key whose pairing is not current | The ended page (R19) |
| `/play/{key}` with an unknown key | The same ended page (R20) |
| `/` with exactly one shop and a current pairing | The player page (R21) |
| `/` otherwise | A page saying a link is needed |
| A spin whose session names a pairing no longer current | Refused; the page re-reads and shows the ended page |
| An admin route touching a row of another account | `404` (R29) |
| Creating a shop, game or reward with an incomplete profile | `409`, naming the missing fields (R12) |
| Editing an existing game with an incomplete profile | Allowed (R11) |
| A player page whose account's profile is incomplete | Plays, with whatever branding exists (R11) |
| A profile saved with an unrecognised timezone | Refused, naming the field |
| A profile saved with a malformed contact email | Refused, naming the field |
| Removing the company logo | Refused (R13) |
| Two accounts registering the same phone | Two players, neither visible to the other (R26) |
| One account registering the same phone at two shops | One player, one history (R6) |

## 11. Acceptance criteria

- [ ] Given two accounts each with a player on `0912345678`, then each
      account's lookup returns its own player and neither can reach the
      other's.
- [ ] Given one account with two shops, when the same number registers at
      both, then there is one player row.
- [ ] Given one account with two shops and a limit of 1, when a customer
      spins at both on one day, then both spins succeed (R33).
- [ ] Given a limit of 1, when a customer spins twice at one shop on one
      day, then the second is refused.
- [ ] Given two accounts whose timezones differ, then each shop's day turns
      at its own account's midnight (R30).
- [ ] Given an account with a complete profile, then a shop, a game and a
      reward can be created.
- [ ] Given an account missing a contact email, then creating a shop, a game
      or a reward answers `409` and names `contactEmail` (R12).
- [ ] Given that same account, then editing its existing game still works
      and its player page still plays (R11).
- [ ] Given an account, then its logo cannot be removed and its company name
      cannot be blanked (R13).
- [ ] Given an account whose language is `vi`, then its player page opens in
      Vietnamese for a browser asking for English, and a player's own choice
      still overrides it (R15).
- [ ] Given an account whose currency is `VND`, then every game of that
      account labels amounts in `VND`.
- [ ] Given a current pairing, `GET /api/play/{key}` returns that game's
      wheel with its account's company name and logo.
- [ ] Given a pairing that is not current, `/play/{key}` shows the ended
      page and no wheel.
- [ ] Given an unknown key, the response is byte-identical to the previous
      case (R20).
- [ ] Given one shop with a current pairing, `/` still serves the player
      page (R21).
- [ ] Given an admin of account A, when a route names a row of account B,
      then the answer is `404` (R29).
- [ ] Given a spin, then its row names the shop and the game it was played
      on (R7).
- [ ] Given a single-campaign database, when `app:upgrade-database` runs,
      then one account, one shop, one game and one current pairing exist,
      every existing row is attached to them, and the account's timezone is
      `APP_TIMEZONE` (R35, R37).
- [ ] Given that migration, then the account is incomplete, nothing stops
      serving, and the first creation attempt names `contactEmail` (R36).
- [ ] Given that database, when the upgrade runs twice, then the second run
      changes nothing (R34).
- [ ] Given the upgrade, then no player, spin, reward or user is left
      without an account.
- [ ] Given a migrated installation, then every acceptance criterion of
      [F23](./F23-a-daily-spin-limit.md) still holds for its one shop.
- [ ] Every repository method requires its account or shop, with no default
      (R25).

## 12. Verification

By the suites:

- A **two-account fixture** used by most of the backend tests, because a
  scoping fault is invisible with one account in the database. Every test
  that reads anything gets a second account's rows it must not see.
- **`TenantScopingTest`** (new) — walks every admin route with an account
  that does not own the row and expects `404`.
- **`ProfileGateTest`** (new) — each of the six fields missing in turn, the
  `409` and its `missing` list, and that editing and playing are unaffected.
- **`MigrationTest`** — a single-campaign database before, the four new rows
  after, nothing orphaned, an incomplete account, and a second run that is a
  no-op.
- **`DailySpinLimitTest`** — extended to two shops of one account, and to
  two accounts in different timezones.
- The existing suites, which should need changes only where they assumed one
  campaign.

By hand:

- Scanning a stall's link on a phone, and the ended page after the shop is
  pointed at another game.
- A player page opening in the account's language rather than the browser's.

## 13. Decisions and risks

**Three owners of three different facts.** The split is worth saying in one
line, because it is the thing that will be misremembered: the **account**
owns who the company is and everything that is the same wherever it trades —
the clock, the currency, the language a page opens in; the **game** owns the
promotion, including how many spins a day it gives; the **shop** owns the
place, and the spins are counted there.

**Why the clock is the owner's and not the shop's.** Your rule: an owner's
shops are all in one timezone, and shops in another timezone are another
account. That is a stronger constraint than the schema would need, and it
buys a real simplification — one clock per account means a chain can never
half-configure itself, and the whole of
[F24](./F24-the-campaigns-timezone.md) collapses into one profile field.

**Why `Account` is a separate row from the login.** You described this as the
user's profile, and that is how it should read on screen — it is *their*
company. Underneath it is its own row because `User` is already
[F07](./F07-admin-login.md)'s login, and a platform where "user" means two
things is a platform where a scoping bug is one typo away. It also means a
second login for the same company costs nothing later, where merging the two
would cost a migration.

**"Stores inherit" read as "a shop selects".** The chosen option was an
account-level game that shops inherit; what you described was a shop picking
the game it wants to show. This specifies the second. Field-level
inheritance means every column needs an *inherited or set here* state — in
the data, in the API and on every control — which is a large feature in its
own right and a hard one to explain. A shop selecting one of its owner's
games gives the same answer for a chain running one promotion, and the
pairing row is where per-shop overrides could later live if they are ever
wanted.

**Why the gate is nullable columns and a rule, not `NOT NULL`.** The
database cannot say "complete enough to serve, not complete enough to
create". A `NOT NULL` would also make the migration impossible, because
today's data contains no contact email and may contain no logo — and
inventing an owner's email address is not something a migration gets to do.

**Why the gate blocks creating and not editing.** An owner mid-signup should
not be able to build a half-branded game, but an owner whose installation
was migrated must not find their running campaign locked. The same rule
answers both: nothing already serving stops serving.

**Why `409` and not `422`.** The payload is correct; the account is not
ready. A client that cannot tell those apart cannot say anything useful,
and "profile incomplete" wants a different screen from "this field is
wrong".

**Why the ended page rather than a redirect.** Your call, and worth
recording the trade: printed QR codes outlive promotions, so this guarantees
a reprint whenever a shop switches game. The alternative silently serves a
different offer to somebody who scanned a specific one, which is an argument
at the counter rather than a dead link.

**Why `404` and not `403` across accounts.** `403` tells you the row exists.
On a platform, that is enough to count a competitor's shops.

**Why the limit is per shop.** The spin and the prize are the shop's, and a
chain-wide allowance would refuse a customer at a branch they have never
visited. The cost is that a determined customer can tour the branches, which
is a real visit to a real shop and not obviously a loss.

**The `branding` table keeps its name, for now.** It has been the campaign
since [F15](./F15-choosing-the-currency.md) put a currency on it and
[F23](./F23-a-daily-spin-limit.md) added a limit, and this feature makes it
the game while moving four of its columns to the account. Renaming it is a
mechanical step touching every one of those features; doing it inside a
migration that is already moving every row is how a migration stops being
safe to run twice. It is a separate step, after.

**The risk this feature is.** It touches every table, every repository and
every controller at once, and its fault mode is not a crash but one
customer's data appearing in another's shop. That is why the two-account
fixture is a rule rather than a suggestion, and why R25 forbids a default
argument: a scoped query that can be called unscoped eventually is.

**Why no admin UI here.** A platform feature that needs a user interface to
be exercised cannot be verified until that interface exists, and the
interface is the larger half. The API and console commands make the model
real, testable and operable on the day it lands; **F25** then gives it a
face.

## 14. Open questions

- **A company trading in two currencies**, in one country, one timezone. R14
  says it cannot, which follows from your rule but is a stronger claim than
  the timezone one. If it ever bites, a currency on the game overriding the
  account's is a small change; the reverse is not.
- **Does an owner ever need two games running at one shop at once** — two
  stalls, two promotions? R5 says no, and the pairing table would allow it
  without a schema change if the answer turns out to be yes.
- **Whether `branding` is renamed** to `game`, and in which feature.
- **What a deleted shop does to its spins.** The same question
  [F08](./F08-player-identification.md) section 14 left open for a deleted
  player, now with a second owner of the problem.
