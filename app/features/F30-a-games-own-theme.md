# F30 — A game's own theme

| | |
|---|---|
| **ID** | F30 |
| **Status** | Draft |
| **Interface** | Both |
| **Depends on** | [P02](./P02-database-upgrades.md), [F04](./F04-branding-and-themes.md), [F06](./F06-theme-scenes.md), [F27](./F27-the-store-and-its-games.md), [F28](./F28-the-gift-sheet.md) |
| **Agreed on** | — |
| **Amends** | [F04](./F04-branding-and-themes.md) R22, [F27](./F27-the-store-and-its-games.md) R10, R13 |

## 1. Summary

A game may carry a theme of its own; left blank it shows the store's, which
is what every game does today.

## 2. Why

[F27](./F27-the-store-and-its-games.md) R13 put the theme on the store
because a season belongs to the shop — Christmas is the whole counter's, not
one poster's. That is still true of a season. It is not true of a game: the
gift sheet is a different promotion with a different link, often printed on
a different card, and it needs to look like itself rather than like the wheel
standing next to it. F27's own open questions named this as the first thing
that would ask for it, and it asked immediately: the sheet went live beside
the wheel and both pages drew the same colours.

Blank is what keeps R13 honest. The shop still sets a season in one place and
every game follows it; a game only breaks ranks when somebody deliberately
makes it, and it rejoins by being emptied.

## 3. Actors

| Actor | Role |
|---|---|
| Shop owner / admin | Sets the store's season, and a game's own look where one promotion needs it |
| Customer | Sees one game's colours on that game's page |

## 4. User stories

- As an **admin**, I want **to give one game its own theme**, so that **a
  gift sheet does not have to look like the wheel just because they share a
  counter**.
- As an **admin**, I want **to leave it blank**, so that **changing the
  season still means changing one setting, not one per game**.

## 5. Scope

### In scope

- A nullable **theme** on a game, from the same list of themes the store
  chooses from ([F04](./F04-branding-and-themes.md) R7).
- Resolving the **effective theme** — the game's, or the store's when the
  game's is blank — on the server, in the branding a player page already
  receives.
- A theme picker in the **game editor**, with an entry that means *follow the
  store* and names which theme that currently is.
- The scene ([F06](./F06-theme-scenes.md)) following the effective theme.
- An upgrade step that adds the column with no theme set, so nothing looks
  different the moment it runs.

### Out of scope

- **Per-game logo, company name, currency or language.** Those are the
  shop's identity and the shop's money and the shop's words
  ([F27](./F27-the-store-and-its-games.md) R10); a logo per promotion is a
  different feature and nobody has asked for one.
- **New themes.** The list is [F04](./F04-branding-and-themes.md) R7's, as
  it is.
- **A theme of a game's own making** — custom colours, an uploaded palette.
  [F04](./F04-branding-and-themes.md) R9 and R11 stand: a theme is a named
  set of tokens that a contrast test has passed, not a colour picker.
- **Previewing a game's theme from the admin.** The link is one click and
  shows the real thing.

## 6. Rules

### What a game's theme is

| # | Rule |
|---|---|
| R1 | A game may carry **its own theme**: one of [F04](./F04-branding-and-themes.md) R7's themes, or nothing. |
| R2 | A game's player page uses the **effective theme**: the game's own if it has one, otherwise the store's. This amends [F04](./F04-branding-and-themes.md) R22 — "the configured theme" now has two places it can be configured, and one answer. |
| R3 | **Blank means follow the store**, and it is the only thing that means it. A game set to `plain` is plain, even while the store is `christmas`: `plain` is a theme somebody chose ([F04](./F04-branding-and-themes.md) R8 makes it the *value* used when none is recognised), and a promotion that wants no decoration must be able to say so. The column is therefore nullable rather than defaulted. |
| R4 | Emptying a game's theme returns it to the store's, immediately and with nothing else changed. |
| R5 | Every rule [F04](./F04-branding-and-themes.md) makes about a theme applies to a game's: the same closed list (R7), the same tokens and nothing but tokens (R9, R28), the same contrast floor (R11), the same refusal of an unknown value (R12), and identical slice colours (R10). A game's theme is not a new kind of thing — it is the same value in a second place. |
| R6 | The **store keeps its theme**, and the Store module keeps its picker. [F27](./F27-the-store-and-its-games.md) R10 and R13 are amended only in that the store's theme is now the default every game falls back to, rather than the only theme there is. |
| R7 | The **scene** ([F06](./F06-theme-scenes.md)) is the effective theme's scene, because a scene is part of a theme and not a separate choice. |
| R8 | The theme is resolved **on the server**. A player page receives one theme in the branding it already receives and never learns that there were two places it could have come from. |
| R9 | The admin is told what blank means, by name: the *follow the store* entry reads as the store's current theme, not as an empty option. An admin choosing between "Store's theme (Christmas)" and "Christmas" is choosing between *follow* and *fix*, and the difference only matters next season. |

### The upgrade

| # | Rule |
|---|---|
| R10 | The upgrade adds a nullable `theme` column to `game` and sets nothing. Every existing game therefore shows the store's theme, which is what it showed before the step ran ([P02](./P02-database-upgrades.md): a step that changes nothing visible is the only safe kind of schema step). |
| R11 | The step asks the database whether the column is there and does nothing when it is, as every step does. |

## 7. Data model

| Entity | Field | Type | Notes |
|---|---|---|---|
| `Game` | `theme` | `VARCHAR(32) NULL` | One of [F04](./F04-branding-and-themes.md) R7's values, or `NULL` for *follow the store* (R3). No default. |

`Store.theme` is unchanged: `VARCHAR(32) NOT NULL`, default `plain`.

## 8. API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/admin/games/{id}` | session | Gains `theme` (`string\|null`) and `storeTheme` (`string`), the latter so the picker can name what blank means (R9) |
| `PUT` | `/api/admin/games/{id}` | session | Accepts `theme`: one of the themes, or `null` |
| `GET` | `/api/play/{key}` | public | Its branding's `theme` is the effective one (R2, R8) |
| `GET` | `/api/wheel` | public | Same |
| `GET` | `/api/game` | public | Same |
| `GET` | `/api/admin/store` | session | Unchanged: the store's own theme, which is what the Store module edits |

The player-facing payloads keep their shape exactly. `theme` was always a
single string and still is; only the question it answers changed, from "what
has the shop chosen?" to "what should this page draw?".

## 9. Interface

### Player view

No new element. The page draws the effective theme's tokens, and its scene,
exactly as it draws the store's today. Two of the store's games opened side
by side on two phones look different from each other when their themes
differ, and identical when they do not.

### Admin view

The game editor gains a **Theme** picker beside the game's name and tagline —
the fields that are the promotion's rather than the shop's. Its first entry
is *Store's theme (<name>)*, selected while the game's theme is blank; below
it, the themes, exactly as the Store module lists them.

The Store module is untouched. Its picker still sets the season, and its
label is now worth reading as what it is: the default.

### Responsive behaviour

Nothing new. One picker in a form that already stacks at 375px.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| `theme` is a name not on [F04](./F04-branding-and-themes.md) R7's list | `422`, with the field named, as the store's picker already answers ([F04](./F04-branding-and-themes.md) R12) |
| `theme` is `null` | Accepted: *follow the store* (R3) |
| `theme` is `""` | Treated as `null`, because an empty select posts an empty string and the admin meant *follow the store* |
| `theme` is set on a game that is live | Accepted. A theme is paint, and a running promotion may be repainted |
| The store's theme changes while a game has its own | The game is unaffected (R3) |

## 11. Acceptance criteria

- [ ] Given a game with no theme of its own, when its page is opened, then it
      draws the store's theme.
- [ ] Given a game set to `halloween` while the store is `christmas`, when
      its page is opened, then it draws `halloween`, and the store's other
      games draw `christmas`.
- [ ] Given a game set to `plain` while the store is `christmas`, when its
      page is opened, then it draws `plain`.
- [ ] Given a game with its own theme, when it is emptied, then its page
      draws the store's.
- [ ] Given a request setting a game's theme to a name not on the list, then
      the answer is `422` and nothing is stored.
- [ ] Given a game with its own theme, then the scene is that theme's scene.
- [ ] Given a game's payload, then it carries one `theme`, and the page makes
      no second request to find out which.
- [ ] Given the upgrade runs on a database with games, then every game's
      theme is `NULL` and every page looks as it did.
- [ ] Given the upgrade runs twice, then the second run reports the step as
      done and changes nothing.
- [ ] Given every theme, then the contrast test passes for a game's theme as
      it does for the store's.
- [ ] The four fast suites pass.
- [ ] Checked by hand: a wheel and a gift sheet with different themes, opened
      one after the other on a phone at 375px.

## 12. Open questions

- **Should the tagline's neighbours follow?** The game editor now holds the
  name, the tagline, the limit and the theme. If a promotion turns out to
  need its own logo too, that is the point at which "the store's identity"
  stops meaning anything and the two levels should be re-read together,
  rather than drilled through one field at a time.
- **Should a game's theme show in the Games list?** A swatch per row would
  say at a glance which games have broken ranks. Left out until an admin has
  more games than fit on a screen.
