# F30 — The theme belongs to the game

| | |
|---|---|
| **ID** | F30 |
| **Status** | Draft |
| **Interface** | Both |
| **Depends on** | [P02](./P02-database-upgrades.md), [F04](./F04-branding-and-themes.md), [F06](./F06-theme-scenes.md), [F27](./F27-the-store-and-its-games.md), [F28](./F28-the-gift-sheet.md) |
| **Agreed on** | — |
| **Amends** | [F04](./F04-branding-and-themes.md) R1, R22, [F27](./F27-the-store-and-its-games.md) R2, R10, R13 |

## 1. Summary

The theme moves off the store and onto the game. Each game chooses its own
look; the store no longer has one.

## 2. Why

[F27](./F27-the-store-and-its-games.md) R13 put the theme on the store on the
grounds that a season belongs to the shop — Christmas is the whole counter's,
not one poster's. Two games in, that reasoning does not hold. A gift sheet
handed out all year is not in a season, and a Black Friday wheel is in one
for a week; a single setting makes the shop choose which of its promotions is
allowed to look right.

A theme is not the shop's identity. The company name and the logo are: they
are the same on every card the shop prints, and a customer who sees two of
them should see one business. The theme is the card's design, and the cards
are printed per promotion. That is why this is a move and not an override:
a store theme kept as a default would be a setting whose only job is to be
contradicted, and a second place for the admin to go looking when a page is
the wrong colour.

The cost of the move is that a shop changing season now changes it once per
game. That is the right cost. There are two games, and a shop that genuinely
wants both repainted is doing two deliberate things, not one thing it might
have meant.

## 3. Actors

| Actor | Role |
|---|---|
| Shop owner / admin | Chooses each game's look in that game's editor |
| Customer | Sees the colours of the game whose link they followed |

## 4. User stories

- As an **admin**, I want **each game to carry its own theme**, so that **a
  Christmas wheel and a year-round gift sheet can each look like what they
  are**.
- As an **admin**, I want **one place to set it**, so that **a page's colour
  is explained by the game I am looking at and nothing else**.

## 5. Scope

### In scope

- A required **theme** on the game, from [F04](./F04-branding-and-themes.md)
  R7's list, defaulting to `plain`.
- **Removing** the theme from the store: the column, the field in the store's
  payload, and the picker in the Store module.
- A theme picker in the **game editor**, where the name, tagline and limit
  already are.
- The scene ([F06](./F06-theme-scenes.md)) following the game's theme.
- An upgrade that gives every existing game the store's current theme before
  the store's column goes, so nothing looks different the moment it runs.

### Out of scope

- **Per-game logo, company name, currency or language.** Those stay the
  store's ([F27](./F27-the-store-and-its-games.md) R10). They are the
  business, not the promotion, and this feature is the argument for the
  distinction rather than against it.
- **New themes**, and themes of a game's own making. The list is
  [F04](./F04-branding-and-themes.md) R7's and a theme is still a named set
  of tokens that a contrast test has passed (R9, R11, R28).
- **A default for new games other than `plain`.** A new game does not inherit
  from anything — see R9.
- **Previewing a theme from the admin.** The game's link is one click away
  and shows the real thing.

## 6. Rules

### Where the theme lives

| # | Rule |
|---|---|
| R1 | A **game carries a theme**: one of [F04](./F04-branding-and-themes.md) R7's themes. It is required and never null. |
| R2 | The **store carries no theme**. This amends [F27](./F27-the-store-and-its-games.md) R2, R10 and R13, and [F04](./F04-branding-and-themes.md) R1 in so far as the branding record held one. |
| R3 | A game's player page draws **its own game's theme**, and nothing else decides it. This amends [F04](./F04-branding-and-themes.md) R22's "the configured theme", which now has exactly one place it is configured. |
| R4 | Every rule [F04](./F04-branding-and-themes.md) makes about a theme applies unchanged: the same closed list (R7), `plain` as the default and as the value a stored name that is not recognised falls back to (R8), tokens and nothing but tokens (R9, R28), the same contrast floor (R11), the same refusal of an unknown value on the way in (R12), identical slice colours on every theme (R10), and an admin page the theme does not touch (R27). |
| R5 | The **scene** ([F06](./F06-theme-scenes.md)) is the game's theme's scene. A scene is part of a theme, not a choice beside it. |
| R6 | The theme travels in the branding a player page already receives, as the same single `theme` string it has always been. No payload changes shape and no page makes a second request. |
| R7 | The pages with **no game** — the ended promotion and the unknown link — are unaffected, because they already carry no theme at all ([F27](./F27-the-store-and-its-games.md) R25): a customer holding a printed link must not be able to tell a finished promotion from a typo, and a colour would tell them. |
| R8 | A game's theme may be changed while the game is **live**. A theme is paint. |
| R9 | A **new game starts at `plain`**, not at the theme of the last game created or of the store that used to have one. There is nothing left to inherit from, and a quiet inheritance would be the store's theme back under another name. |

### The upgrade

| # | Rule |
|---|---|
| R10 | A step adds `theme` to `game`, not null, defaulting to `plain`, and sets every existing game to **the store's current theme** in the same step. Nothing looks different the moment it runs: the one game the shop has is the one the store's theme was chosen for. |
| R11 | A later step **drops** `theme` from the store, and only after R10's step has given the games theirs. A run that stops between the two leaves a database that still works — the games have their themes and the store has a column nobody reads. |
| R12 | Both steps ask the database what is there and report themselves done when it already is, as every step does ([P02](./P02-database-upgrades.md)). A dry run names what it would do and writes nothing. |
| R13 | On an installation with no store row and no games, both steps are no-ops and a fresh database is created with the theme on `game` only. |

### The admin

| # | Rule |
|---|---|
| R14 | The **game editor** gains a Theme picker, listing [F04](./F04-branding-and-themes.md) R7's themes. It sits with the name, the tagline and the limit, which are the promotion's fields. |
| R15 | The **Store module loses its theme picker** ([F04](./F04-branding-and-themes.md) R13's control, as [F27](./F27-the-store-and-its-games.md) R16 left it). What remains there is the company name, the logo, the currency, the language and the timezone — the business. |
| R16 | The Games list is unchanged: no theme column. A game's look is a thing to see, not a thing to scan. |

## 7. Data model

| Entity | Field | Type | Notes |
|---|---|---|---|
| `Game` | `theme` | `VARCHAR(32) NOT NULL DEFAULT 'plain'` | One of [F04](./F04-branding-and-themes.md) R7's values |
| `Store` | `theme` | — | **Removed** |

## 8. API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/admin/games/{id}` | session | Gains `theme` |
| `PUT` | `/api/admin/games/{id}` | session | Accepts `theme`; absent means `plain`, as the store's PUT has always treated it ([F04](./F04-branding-and-themes.md) R8) |
| `GET` | `/api/admin/store` | session | **Loses** `theme` |
| `PUT` | `/api/admin/store` | session | **Loses** `theme`; a payload still carrying one is ignored rather than refused, because an old tab must not be able to fail a save of the company name |
| `GET` | `/api/play/{key}` | public | Its branding's `theme` is the game's |
| `GET` | `/api/wheel` | public | Same |
| `GET` | `/api/game` | public | Same |

`GET /api/branding/logo` is untouched. The player-facing payloads keep their
shape exactly: `theme` was a single string and still is, and only the
question it answers changed, from "what has the shop chosen?" to "what has
this game chosen?".

## 9. Interface

### Player view

No new element and no new state. The page draws its game's theme and scene
exactly as it drew the store's. Two of the store's games opened on two phones
look different when their themes differ and identical when they do not.

### Admin view

The game editor's form gains **Theme**, a select of the themes, beneath the
tagline. Its refusal, when one is somehow sent, reads as the store's picker
read: the field named, and the list of what is allowed.

The Store module's Appearance block loses the picker. The logo and the
company name stay where they are.

### Responsive behaviour

Nothing new. One select in a form that already stacks at 375px.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| `theme` is a name not on [F04](./F04-branding-and-themes.md) R7's list | `422`, the field named, nothing stored ([F04](./F04-branding-and-themes.md) R12) |
| `theme` is absent from a game's submission | `plain` |
| `theme` is `null` or `""` | `plain`, for the same reason: an empty select is not a choice of a theme that does not exist |
| A stored theme is a name the application no longer knows | `plain` on the way out, unchanged in the database ([F04](./F04-branding-and-themes.md) R8) |
| `theme` is sent to `PUT /api/admin/store` | Ignored; the rest of the save proceeds |

## 11. Acceptance criteria

- [ ] Given two live games with different themes, when each link is opened,
      then each page draws its own game's theme.
- [ ] Given a game's theme is changed, when its page is reloaded, then it
      draws the new one and the other game is unchanged.
- [ ] Given a game set to `plain` and another to `christmas`, then the plain
      one is plain.
- [ ] Given a new game, then its theme is `plain`.
- [ ] Given a request setting a game's theme to a name not on the list, then
      the answer is `422` and nothing is stored.
- [ ] Given a game, then the scene drawn is that game's theme's scene.
- [ ] Given the store's payload, then it carries no theme, and the Store
      module shows no theme picker.
- [ ] Given a payload with a theme sent to the store, then the save succeeds
      and no theme is stored.
- [ ] Given a database whose store theme is `christmas` and one game, when
      the upgrade runs, then that game's theme is `christmas` and its page
      looks exactly as it did.
- [ ] Given the upgrade runs twice, then the second run reports both steps
      done and changes nothing.
- [ ] Given a dry run, then both steps are named and the database is
      untouched.
- [ ] Given the upgrade has run, then `doctrine:schema:update --dump-sql`
      reports nothing to update.
- [ ] Given every theme, then the contrast test passes for it on a game as it
      did on the store.
- [ ] The four fast suites pass.
- [ ] Checked by hand: a wheel and a gift sheet with different themes, each
      on a phone at 375px, and the Store module with no picker in it.

## 12. Open questions

- **Does a shop with twenty games want a "set all" control?** Not at two.
  The move's one cost is repeating a seasonal change per game, and the moment
  that is a chore is the moment to answer it — with a control that says what
  it does, not with a default that reintroduces the store's theme quietly.
- **Should the tagline's neighbours keep growing?** The game editor now holds
  the name, the tagline, the limit and the theme. If a promotion turns out to
  need its own logo as well, then "the store's identity" has stopped meaning
  anything and both levels want re-reading together rather than drilling
  through one field at a time.
