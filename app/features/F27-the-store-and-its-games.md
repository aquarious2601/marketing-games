# F27 — The store and its games

| | |
|---|---|
| **ID** | F27 |
| **Status** | Agreed |
| **Interface** | Both |
| **Depends on** | [P02](./P02-database-upgrades.md), [P05](./P05-one-app-a-folder-per-game.md), [F01](./F01-wheel-prize-configuration.md), [F04](./F04-branding-and-themes.md), [F09](./F09-admin-modules.md), [F13](./F13-reward-configuration.md), [F15](./F15-choosing-the-currency.md), [F19](./F19-one-person-one-number.md), [F23](./F23-a-daily-spin-limit.md) |
| **Agreed on** | 2026-11-19 |
| **Amends** | [F04](./F04-branding-and-themes.md) R1, R3, R28, [F09](./F09-admin-modules.md) R1, R2, R3, R9, [F12](./F12-multiple-languages.md) R3, [F15](./F15-choosing-the-currency.md) R4, R7, R8, R9, R10, [F23](./F23-a-daily-spin-limit.md) R1, R6, R7, R20, R22 |

## 1. Summary

The one campaign splits in two: a **store** that holds everything every game
shows, and **games** that each hold a name, what they give away, their own
per-person limit and their own link.

## 2. Why

There is one game because there is one row. `branding` holds the company's
name and logo next to the campaign's name, tagline and spin limit, and the
wheel hangs off nothing at all — so "create a second game" today means a
second installation, a second database and a second login for the same shop.

Most of that row is not the game's. The company name, the logo and the
currency are the shop's and would be typed again, identically, for every
promotion it ever runs. The name, the tagline, the prizes and the limit are
the promotion's and change with each one. One row cannot tell those apart,
which is why nothing here can have two of anything.

Splitting them is also what makes a second *kind* of game possible
([F28](./F28-the-gift-sheet.md)). A gift sheet has no wheel and no odds, but
it has the same company name, the same logo, the same reward catalogue, the
same customers and the same counter. Those belong to the store; only the
giving-away part belongs to the game.

This is the narrow version on purpose. One installation still serves one
store — the chain of stores under separate owners is
[P04](./P04-many-shops-in-one-installation.md), which stays a draft. What
this feature buys is the level above a game, which P04 also needs and which
is the whole of what a second game is waiting for.

## 3. Actors

| Actor | Role |
|---|---|
| **Admin** | Fills the store in once, then creates and edits games under it |
| **Player** | Arrives by the link printed on the stall and plays that game |
| **Store** | The shop: a name, a logo, a currency, a clock, a language |
| **Game** | One promotion: a name, a type, what it gives away, a limit, a link |

## 4. User stories

- As an **admin**, I want **to say who my shop is once**, so that **every
  game I create already carries my name, my logo and my currency**.
- As an **admin**, I want **several games side by side**, so that **I can run
  the wheel on the counter and a second promotion at the door without
  rebuilding either**.
- As an **admin**, I want **each game to have its own link**, so that **the
  QR code on a poster opens that promotion and only that one**.
- As an **admin**, I want **one reward catalogue**, so that **a prize is
  described once and offered by whichever game I like**.
- As a **player**, I want **the link I scanned to open the promotion it
  advertised**, so that **I am not shown a different offer than the poster**.
- As an **admin**, I want **my customers to be my customers**, so that
  **somebody who played the wheel is the same person when they play the next
  game**.

## 5. Scope

### In scope

- A `store` row holding company name, logo, currency, theme, language and
  timezone.
- A `game` row holding name, type, tagline, per-person limit, link key and
  whether it is live. The wheel and its prizes belong to a game.
- Several games live at once, each reached at `/play/{key}`.
- `/` keeps working while exactly one game is live.
- The reward catalogue and the player list stay the store's, shared by every
  game.
- A **Store** module in the admin, and the Game module becoming a **Games**
  list with an editor per game.
- The timezone becoming a field of the store, which retires `APP_TIMEZONE`.
- The currency picker leaving the reward editor, which is the feature that
  was put on hold — see R16.
- A [P02](./P02-database-upgrades.md) upgrade turning today's single campaign
  into one store and one live wheel game, with every existing spin pointing
  at it.

### Out of scope

- **A second game type.** This gives the store a shape that can hold one.
  [F28](./F28-the-gift-sheet.md) is the gift sheet.
- **Several stores, accounts, owners or tenants.** One installation, one
  store. [P04](./P04-many-shops-in-one-installation.md) is where that lives,
  and nothing here contradicts it: P04's account is this store grown an
  owner and a `shop` beneath it.
- **Deleting a game.** A game is turned off (R22), which is what "this
  promotion is over" actually means, and keeps its spin log readable. Deleting
  a promotion that people played is a data decision, not a button.
- **QR codes.** The link is shown and copied here. Turning it into an image is
  a small feature of its own and is on [`ROADMAP.md`](./ROADMAP.md).
- **Scheduling.** A game is on or off by hand. Start and end dates are on
  [`ROADMAP.md`](./ROADMAP.md) and need the store's clock, which this feature
  is what finally gives them.
- **Per-game branding.** A game may not override the logo, the company name
  or the theme. If a promotion needs its own look, that is a theme decision,
  not a second branding record.
- **Reporting across games.** The Spins module gains a Game column and a
  filter (R29); a dashboard does not.

## 6. Rules

### The model

| # | Rule |
|---|---|
| R1 | Exactly one **store** row exists, created with defaults on first use. This is [F04](./F04-branding-and-themes.md) R1's branding record, renamed to what it actually is. |
| R2 | The store carries what every game shows: **company name**, **logo**, **currency**, **theme**, the **language** a player page opens in, and the **timezone** its day is counted in. |
| R3 | A **game** is one promotion: a **name**, a **type**, a **tagline**, a **per-person limit**, a **link key**, and whether it is **live**. |
| R4 | The store has many games. A game belongs to exactly one store. |
| R5 | A game's **type** is chosen when it is created and cannot be changed afterwards. A type decides what "what it gives away" means — slices and odds for a wheel, a plain list for a sheet — so changing it would leave a configuration that describes nothing. To change a type, create another game. |
| R6 | A wheel and its prizes belong to a **game**, not to the installation. Today's wheel becomes the wheel of the game the upgrade creates (R32). |
| R7 | The **reward catalogue** is the store's. One list of rewards, offered by whichever games the admin points at them ([F13](./F13-reward-configuration.md), [F26](./F26-a-slice-takes-its-rewards-name.md)). |
| R8 | A **player** is the store's, not a game's. One person is one row ([F19](./F19-one-person-one-number.md) R1) however many of the store's games they play. |
| R9 | A **spin** records the game it was played on, so the log still reads correctly after a game is turned off or another is added. |

### What moved where, and what did not

| # | Rule |
|---|---|
| R10 | To the store: company name, logo, currency, theme. These are the shop's identity and every game shows them. |
| R11 | To the game: the campaign name — now the game's **name** ([F04](./F04-branding-and-themes.md) R3) — the tagline ([F04](./F04-branding-and-themes.md) R28), the daily limit ([F23](./F23-a-daily-spin-limit.md) R1) and the wheel. These describe one promotion. |
| R12 | The **tagline stays with the game** although it looks like branding, because the words the application supplies when none is written — "One spin, one prize. Good luck." — are about spinning. A sheet of gifts cannot carry that sentence, and a default that is wrong for half the games is worse than a field in two places. |
| R13 | The **theme goes to the store**, because a season belongs to the shop: Christmas is the whole counter's, not one poster's. |
| R14 | This feature **moves** fields; it does not change whether they are required. Company name stays optional ([F04](./F04-branding-and-themes.md) R2), the logo stays removable ([F04](./F04-branding-and-themes.md) R18), the tagline and the limit stay blank-able. Only R15 is new. |
| R15 | The **timezone** is a required field of the store: an identifier the runtime recognises, with no default, because a default is a guess at the one fact only the shop knows. This amends [F23](./F23-a-daily-spin-limit.md) R7, which made it a deployment setting, and settles what the withdrawn [F24](./F24-the-campaigns-timezone.md) could not — not because a dropdown got better, but because there is now a row that is obviously the shop and obviously not the promotion. |
| R16 | The **currency is the store's**, and the reward editor's currency picker goes with it ([F15](./F15-choosing-the-currency.md) R7, R8, R9). An amount-off reward is labelled in the store's currency and the editor says which one it is without offering to change it. A picker there would now re-label every reward of every game from inside a form about one reward. The Store module's picker ([F15](./F15-choosing-the-currency.md) R10) is where it is changed, and changing it still re-labels and never converts ([F15](./F15-choosing-the-currency.md) R11). |
| R17 | The store's **language** is the player page's default, ahead of the browser's preference ([F12](./F12-multiple-languages.md) R3). A player's own choice still wins and is still remembered per browser ([F12](./F12-multiple-languages.md) R7). Left blank, the browser decides exactly as today. |
| R18 | `branding.currency` stays nullable and keeps [F15](./F15-choosing-the-currency.md) R4's meaning — *nobody has chosen yet* — on the store ([F15](./F15-choosing-the-currency.md) R4, R5). |

### Where a game is played

| # | Rule |
|---|---|
| R19 | Every game has a **link key**: opaque, unguessable, unique across the installation, and naming no store, game, type or number. At least 60 bits of entropy, in an alphabet with no look-alike characters, so it can be read off a poster if the camera fails. |
| R20 | The player's entry point is **`/play/{key}`**. It resolves the game, and from it the store, the branding, the currency and the language. |
| R21 | A key is **permanent**. It is minted when the game is created and never changes, so a printed poster survives the game being turned off and on again. |
| R22 | A game is **live** or not. Live means open for play; not live means the promotion is over or has not started. |
| R23 | **Several games may be live at once**, each on its own link. The wheel at the counter and a second game at the door are two live games, not a setting to switch between. |
| R24 | A key whose game is **not live** shows a plain page saying this promotion has ended. Not a redirect to a game that is live: somebody scanned a specific offer, and quietly serving a different one is how a shop ends up arguing about a prize at the counter. |
| R25 | An **unknown** key shows the same page as a game that is not live, and says nothing about whether it ever existed. Neither page carries the store's branding, because the unknown case has none to carry and the two must be indistinguishable. |
| R26 | **`/`** serves the player page while exactly one game is live, so every existing link, bookmark, QR code and manual test keeps working — which is what the upgrade leaves (R32). With no game live, or more than one, `/` says a link is needed and names nothing. |
| R27 | A player's **session is bound to the game** they identified against. Playing uses the game from the session, never a game named in the request body. |
| R28 | Opening a second game's link identifies the player again **for that game**. They are the same person ([F19](./F19-one-person-one-number.md)) with the same history; what they are not is already identified somewhere they have not been. |

### The person, the limit and the day

| # | Rule |
|---|---|
| R29 | The per-person limit is the **game's** ([F23](./F23-a-daily-spin-limit.md) R1): how many times one person may play *this* game in a day. Blank is no limit, 1 to 99 otherwise, zero still refused ([F23](./F23-a-daily-spin-limit.md) R4). |
| R30 | Each game counts its own. A limit spent on the wheel leaves the gift sheet's allowance untouched, because they are two promotions with two budgets. |
| R31 | A day runs midnight to midnight in the **store's** timezone (R15). This amends [F23](./F23-a-daily-spin-limit.md) R6 and R7: the clock moves from the deployment to the store, and spins are still stored in UTC ([F23](./F23-a-daily-spin-limit.md) R9), so no stored data depends on it. |

### The upgrade

| # | Rule |
|---|---|
| R32 | A [P02](./P02-database-upgrades.md) step turns today's data into one store and **one live wheel game**: the company name, logo, currency and theme to the store; the campaign name, tagline and spin limit to the game; today's wheel and prizes to that game; a freshly minted key; live. Every existing spin points at it. |
| R33 | The game's name, where today's campaign name is blank, is the company name, and failing that "Wheel". A game with no name is unmanageable in a list, and this runs without anybody present to ask. |
| R34 | `APP_TIMEZONE` seeds the store's timezone in that step and is read by nothing afterwards. `provision.sh` stops requiring `TIMEZONE`, and [P03](./P03-deployment.md)'s runbook stops asking for it. This amends [F23](./F23-a-daily-spin-limit.md) R7 and R8 — a timezone the runtime does not recognise is now a refused save rather than an instance that will not boot. |
| R35 | Every step is ordered, idempotent and asks the database what it looks like before changing it ([P02](./P02-database-upgrades.md)). Run twice, the second run reports every step as already done. |

### The admin

| # | Rule |
|---|---|
| R36 | The admin becomes five modules: **Store**, **Games**, **Players**, **Rewards**, **Spins**, each with its own URL ([F09](./F09-admin-modules.md) R1, R2). `/admin` opens **Games**, because that is where the work is; `/admin/game` redirects there so every existing link and bookmark lands somewhere sensible ([F09](./F09-admin-modules.md) R3). |
| R37 | The **Store** module is the branding section of today's Game module, moved whole, plus the language and the timezone. Nothing of it is new but those two fields. |
| R38 | The **Games** module lists the store's games: name, type, whether it is live, the number of times it has been played, and its link. Each row opens that game's editor, and the list has **New game**. |
| R39 | **New game** asks a name and a type, and nothing else. It mints the key and creates the game **not live**, so a half-configured promotion is never reachable by a link. |
| R40 | A game's **editor** holds its name, its tagline, its limit, and the reward configuration its type calls for — for a wheel, [F01](./F01-wheel-prize-configuration.md)'s prize list unchanged. The limit moves here from the campaign section ([F23](./F23-a-daily-spin-limit.md) R20). |
| R41 | Each row offers its **link to copy**, in full, including the origin, because what gets printed is the whole URL. |
| R42 | A game is turned **live or off** from the list, with one control and no confirmation step — it is reversible, and R24 means turning it off is visible to anybody holding the link. |
| R43 | A game may not go live while its configuration is invalid: a wheel whose prizes do not total 100 ([F01](./F01-wheel-prize-configuration.md) R8) or whose slices have no rewards ([F13](./F13-reward-configuration.md) R7). The refusal names what is wrong. |
| R44 | The **Spins** module gains a **Game** column and a filter on it. With two games in one log, "what went out today" is ambiguous without it. |
| R45 | The **Players** and **Rewards** modules are unchanged. Both are the store's and neither becomes per game. |

## 7. Data model

| Entity | Field | Type | Notes |
|---|---|---|---|
| `store` | `id` | int | One row (R1). Today's `branding` table, renamed |
| | `company_name` | varchar(60) null | Unchanged ([F04](./F04-branding-and-themes.md) R2) |
| | `logo_filename` | varchar null | Unchanged |
| | `logo_content_type` | varchar null | Unchanged |
| | `currency` | char(3) null | Null means unchosen ([F15](./F15-choosing-the-currency.md) R4) |
| | `theme` | varchar(32) | Default `plain` ([F04](./F04-branding-and-themes.md) R8) |
| | `language` | char(2) null | One of the four ([F12](./F12-multiple-languages.md) R1); null means the browser decides |
| | `timezone` | varchar(64) | **Required** (R15). Seeded from `APP_TIMEZONE` |
| | `updated_at` | datetime | |
| `game` | `id` | int | |
| | `store_id` | int | Not null |
| | `name` | varchar(60) | Not null (R33) |
| | `type` | varchar(32) | `wheel` today; `gift-sheet` in [F28](./F28-the-gift-sheet.md). Immutable (R5) |
| | `tagline` | varchar(120) null | Moved from `branding` |
| | `daily_limit` | smallint null | Moved from `branding`. 1–99 or null |
| | `link_key` | varchar(16) | **Unique**, opaque (R19) |
| | `is_live` | bool | Default false (R39) |
| | `created_at` | datetime | |
| | `updated_at` | datetime | |
| `wheel` | `game_id` | int | Not null, unique. The wheel is one game's |
| `spin` | `game_id` | int | Not null. Backfilled by R32 |

`player`, `reward`, `user`, `prize` are unchanged.

## 8. API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/admin/store` | session | The store, with [F15](./F15-choosing-the-currency.md) R6's three currencies |
| `PUT` | `/api/admin/store` | session | Save it |
| `POST` | `/api/admin/store/logo` | session | Unchanged, moved |
| `DELETE` | `/api/admin/store/logo` | session | Unchanged, moved |
| `GET` | `/api/admin/games` | session | The list, with each game's link and play count |
| `POST` | `/api/admin/games` | session | Create: name and type (R39) |
| `GET` | `/api/admin/games/{id}` | session | One game |
| `PUT` | `/api/admin/games/{id}` | session | Name, tagline, limit |
| `PUT` | `/api/admin/games/{id}/live` | session | Turn it on or off (R42, R43) |
| `GET` | `/api/admin/games/{id}/wheel` | session | [F01](./F01-wheel-prize-configuration.md)'s payload, per game |
| `PUT` | `/api/admin/games/{id}/wheel` | session | Replace it |
| `GET` | `/api/play/{key}` | public | Resolve a key: binds the session's game, returns the store's branding and the game's type and tagline |
| `GET` | `/api/wheel` | public | Unchanged shape; the game comes from the session (R27) |
| `POST` | `/api/spin` | public | Unchanged shape; the game comes from the session |

`GET /api/branding` keeps its path and its shape and now answers from the
store plus the session's game, so the player page needs no new call to draw
its header.

## 9. Interface

### Player view

Unchanged, on every screen, for the game the link resolves to. The header
shows the store's company name and logo and the game's tagline; the wheel,
the identification, the result and the limit screens are exactly as they are
today.

Two pages are new and both are deliberately plain — no logo, no company
name, no theme:

- **This promotion has ended** (R24), for a key whose game is not live.
- **A link is needed** (R26), for `/` when no single game is live. It says
  that the game is reached by the link on the stall, and names nothing.

Both are translated in all four languages ([F12](./F12-multiple-languages.md)
R9), because a player sees them.

### Admin view

**Store** — the branding section as it stands, plus a language picker and a
timezone picker. Save is the section's own, as [F04](./F04-branding-and-themes.md)
R5 has it.

**Games** — a table: Name, Type, Live, Plays, Link. The link cell shows the
URL with a copy control. **New game** opens a two-field form. A row opens
the editor: the game's own fields at the top, its reward configuration below.

**Spins** — one more column, Game, and one more filter.

### Responsive behaviour

The player pages keep the phone-first rule: at 375px the Spin button and the
result are reachable without scrolling, and the two plain pages are a
heading and a sentence.

The Games table follows [F11](./F11-admin-tables.md): on a phone the link
cell wraps rather than scrolling the table sideways, because copying a link
is the one thing an admin does there from a phone.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| A game created with no name | `422`, a violation on the field. A list of games needs names |
| A game created with an unknown type | `422`. The type is a closed list |
| An attempt to change a game's type | `422`, naming R5 |
| A timezone the runtime does not recognise | `422` on that field. Nothing is saved and the instance keeps serving (R34) |
| Turning a game live with an invalid configuration | `409`, naming what is wrong (R43). Not `422`: the request is fine, the game is not ready |
| `GET /api/play/{key}` with an unknown key | `404`, and the page of R25 |
| `GET /api/play/{key}` for a game that is not live | `404`, and the same page. Indistinguishable from unknown by design |
| `GET /api/wheel` with no game in the session | `409`. The page sends the player back to the link they came from |
| `POST /api/spin` naming a game in its body | The body is ignored; the session decides (R27) |
| `GET /` with none or several games live | The page of R26, `200`. Not an error: the installation is working and the visitor is in the wrong place |
| A second store row, by any path | Impossible: the store is resolved as the single row, never created twice (R1) |

## 11. Acceptance criteria

- [ ] Given a fresh database, when the upgrade runs, then one store and one live wheel game exist, the game carries today's campaign name, tagline and limit, and the store carries the company name, logo, currency and theme.
- [ ] Given an installation upgraded from today's data, when a player opens `/`, then they see exactly what they saw before the upgrade.
- [ ] Given the upgrade has run, when it is run again, then every step reports itself already done and nothing changes.
- [ ] Given `APP_TIMEZONE=Europe/Paris` before the upgrade, when it runs, then the store's timezone is `Europe/Paris`, and removing the variable afterwards changes no behaviour.
- [ ] Given a store whose timezone is `Asia/Ho_Chi_Minh`, when a player spins at 23:30 UTC, then the spin counts towards the next day's allowance.
- [ ] Given two games are live, when a player opens each link, then each shows its own name, tagline and prizes, and both show the store's logo and company name.
- [ ] Given two games are live, when a player uses up the wheel's daily limit, then the gift game still lets them play.
- [ ] Given a game is turned off, when its link is opened, then the page says the promotion has ended and carries no company name, logo or theme.
- [ ] Given a key that was never minted, when it is opened, then the page is byte-for-byte the one a turned-off game shows.
- [ ] Given two games are live, when `/` is opened, then the page says a link is needed and names no game.
- [ ] Given one game is live, when `/` is opened, then that game is played there.
- [ ] Given a player identified on one game's link, when they open another game's link, then they are asked to identify again, and their row and their history are the same ones.
- [ ] Given a game created from the Games module, then it is not live, has a 12-character key, and no two games share a key.
- [ ] Given a wheel whose probabilities total 97, when it is turned live, then the refusal is `409` and names the total.
- [ ] Given an amount-off reward is edited, then the editor shows the store's currency as text and offers no picker.
- [ ] Given the store's currency changes from EUR to VND, then every amount-off reward in every game is re-labelled and no number has changed.
- [ ] Given a URL for another installation's game id, when it is requested, then the answer is `404`.
- [ ] `/admin` opens the Games module; `/admin/game` redirects there; the five modules each load only their own data ([F09](./F09-admin-modules.md) R6).
- [ ] The Spins module shows a Game column and filters on it.
- [ ] Given a spin recorded before the upgrade, then its row names the game the upgrade created.
- [ ] The four fast suites pass.
- [ ] Checked by hand in a browser: both links on a phone at 375px, the ended page, the needs-a-link page, copying a link, and creating a game from empty to live.

## 12. Open questions

- **Should the tagline follow the theme up to the store?** R12 keeps it on
  the game because the default sentence is about spinning. If the tagline
  turns out to be the shop's slogan rather than the promotion's, moving it is
  one column and one form field — say so and it moves.
- **Should a game be allowed to override the theme?** Out of scope here
  (section 5). A Halloween game beside a Christmas one is the first thing
  that would ask for it.
- **What happens to a game's spins if a reward is deleted?** Unchanged by
  this feature — [F13](./F13-reward-configuration.md) already answers it —
  but worth re-reading once one catalogue serves several games, because a
  reward that looks unused may be a turned-off game's.
- **Does the Games list need a per-game spin log link?** The Spins filter
  (R44) answers the same question in one more click. Left out until somebody
  asks twice.
