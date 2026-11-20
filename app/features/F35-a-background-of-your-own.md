# F35 — A background of your own

| | |
|---|---|
| **ID** | F35 |
| **Interface** | Both |
| **Status** | Agreed |
| **Depends on** | [F04](./F04-branding-and-themes.md), [F05](./F05-svg-logos.md), [F06](./F06-theme-scenes.md), [F12](./F12-multiple-languages.md), [F30](./F30-the-theme-belongs-to-the-game.md), [P02](./P02-database-upgrades.md), [P03](./P03-deployment.md) |
| **Amends** | [F04](./F04-branding-and-themes.md) R7 (a seventh look, which is not a palette) |
| **Agreed on** | 2026-11-20 |

## 1. Summary

A game can wear a **Custom** theme: a picture the shop uploads becomes the
page behind the wheel, while the colours of the words, the card and the
buttons stay one of the six palettes that have already been contrast-tested.

## 2. Why

The six themes are the six moments we thought of. A shop has moments we did
not — an anniversary, a brand campaign, a supplier's promotion, a holiday
that matters here and nowhere else — and for those the honest answer today
is "pick whichever of our six is least wrong".

A picture is also the one piece of design a shop already owns. They have the
poster, the social banner, the thing their agency made. Letting them put it
behind the wheel turns our six looks into an unlimited number without us
painting a seventh scene, and without the shop needing a designer.

What it must not do is cost us the guarantee the themes exist to keep. The
`Theme` enum says it in as many words:

> Fixed in code on purpose. Each exists because it is a moment worth running
> a promotion for; a colour editor instead would mean nobody has checked that
> the text is readable on the background.

That is still true, and this feature is built so it stays true: the shop
chooses the **picture**, never the colours. Every word on the page is still
printed on a surface from `themes.ts` that a test has measured.

## 3. Actors

| Actor | Role |
|---|---|
| **Shop owner** | Picks Custom for a game, picks which palette it borrows, uploads the picture, replaces or removes it. |
| **Player** | Sees the picture behind the game. Touches nothing, chooses nothing, and is never shown a broken page because of it. |

## 4. User stories

- As a **shop owner**, I want to put my own picture behind the game, so that
  a promotion looks like mine rather than like one of six.
- As a **shop owner**, I want to be told plainly when a file will not do, so
  that I can fix it instead of guessing.
- As a **player**, I want the prize and the Spin button to stay as readable
  as they were, so that a decorated page is still a usable one.

## 5. Scope

### In scope

- A seventh entry in the theme picker, **Custom**, chosen per game (F30 R1).
- A base theme chosen beside it: which of the six palettes Custom borrows.
- Uploading, replacing and removing one picture per game.
- Serving that picture to the player's page and painting it behind the game.
- A fixed veil over the picture, tuned by us, so it reads as a backdrop.
- The header's words moving onto a card when a picture is behind them, so
  nothing is ever printed on bare picture.

### Out of scope

- **Choosing colours.** No picker, no hex field, no palette derived from the
  picture. The colours are one of the six, unchanged. This is the whole
  reason the feature can be built without losing the contrast guarantee.
- **A picture for the store.** The theme belongs to the game (F30), and so
  does this. A shop that wants the same picture on two games uploads it
  twice.
- **Cropping, filters, focal points, or any editing.** The picture is used as
  it arrives. A shop that wants it cropped crops it before uploading.
- **SVG.** Logos accept it because a logo is a drawing and `SvgSanitiser`
  exists for exactly that (F05). A full-page background has nothing to gain
  from being a document, and a document is the part of the upload surface
  with sharp edges.
- **Animated backgrounds**, video, or a second picture for tablet and
  desktop.
- **A picture behind the admin.** This is the player's page only. The admin
  is a tool, not a poster.

## 6. Rules

### The theme

| # | Rule |
|---|---|
| R1 | The theme picker gains a seventh entry, **Custom**, chosen on the game's own screen exactly as the other six are (F30 R1). |
| R2 | Custom is not a palette. A game on Custom also names a **base theme**, one of the six, and wears that theme's colours unchanged — card, buttons, headings, panels, danger, wheel rim, every token in `themes.ts`. |
| R3 | The wheel's slice palette is untouched, on this theme as on every other (F04 R10). The picture reaches the page behind the wheel and nothing else. |
| R4 | A game on Custom with no picture yet looks exactly like its base theme. Uploading is a second step and the game is never half-dressed between them. |
| R5 | A game that leaves Custom keeps its picture on file; coming back to Custom finds it still there. Removing the picture is its own action (R12). |

### The picture

| # | Rule |
|---|---|
| R6 | One picture per game, uploaded on the game's own screen beside the theme picker. |
| R7 | PNG, JPEG or WEBP, decided by reading the file — not by its name, not by its extension, not by the content type the browser declared (F05 R2). |
| R8 | At most 5 MB. A player on a shop's wifi waits for this picture before the page is dressed. |
| R9 | At least 1200 pixels on its longest side. Below that it is a thumbnail stretched across a phone, and it will look like one. |
| R10 | At most 8000 pixels on either side, which is where a decoder's memory stops being somebody else's problem. |
| R11 | Replacing a picture deletes the one it replaces. No orphans accumulate in the upload directory. |
| R12 | Removing the picture leaves the game on Custom, looking like its base theme (R4). |
| R13 | The file lives under `var/uploads/backgrounds`, which the deploy links between releases (P03 R8–R11), so a picture survives the next deploy. |
| R14 | The picture's URL carries the game's `updatedAt` as `?v=`, so a replacement is seen immediately and an unchanged one is cached. |
| R15 | A picture recorded in the database but missing from disk is treated as no picture at all: the page renders the base theme rather than a broken one (F04 R26). |

### What the player sees

| # | Rule |
|---|---|
| R16 | The picture covers the whole page — scaled to cover, centred, fixed behind the content — on every screen size. |
| R17 | A veil of the base theme's page colour sits over the picture at a strength chosen by us, the same on every theme and every game. There is no control for it. |
| R18 | No text is ever printed on bare picture. The wheel's page already puts every word on its card; the gift sheet has never had one, and with a picture behind it its content takes the same card treatment. |
| R19 | The theme's painted scene (`ThemeScene`) is not drawn over a picture. The picture *is* the scene; drawing snow over somebody's photograph is a bug, not a feature. |
| R20 | The wheel keeps its rim and its glow, so it still belongs to the page rather than floating on top of a photograph. |
| R21 | At 375px the page still reaches the Spin button and the prize without scrolling — the rule that outranks every decoration in this repository. |

### Everywhere

| # | Rule |
|---|---|
| R22 | Every label this feature adds exists in all four languages (F12 R9). |
| R23 | A rejected upload says what was wrong in words a shop owner can act on — the size it was, the kinds accepted — not a status code. |
| R24 | Nothing about the picture reaches the player's payload except a URL. Not the filename it was uploaded under, not its size, not its type. |

## 7. Data model

| Entity | Field | Type | Notes |
|---|---|---|---|
| Game | `theme` | string(20), default `plain` | Gains a seventh accepted value, `custom`. Unchanged otherwise. |
| Game | `theme_base` | string(20), default `plain`, not null | The palette Custom borrows. Meaningless while `theme` is not `custom`, and deliberately kept rather than cleared, so switching away and back does not lose the choice. |
| Game | `background` | string(120), null | The stored filename. Null when no picture. |

Three upgrade steps (P02), ordered and idempotent:

1. `game.theme_base` — add the column, default `plain`.
2. `game.background` — add the column, nullable.
3. Nothing to backfill: every existing game is on one of the six, and
   `theme_base` only speaks when `theme` is `custom`.

The third is listed because a step that reports "nothing to do" honestly is
worth more than a step nobody wrote and nobody can see the absence of.

## 8. API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/play/{key}` | public | Branding gains `backgroundUrl`. |
| `GET` | `/api/branding/background/{key}` | public | Serves the picture for that game. |
| `POST` | `/api/admin/games/{id}/background` | admin | Upload, multipart, field `background`. |
| `DELETE` | `/api/admin/games/{id}/background` | admin | Remove. |
| `PUT` | `/api/admin/games/{id}` | admin | Gains `themeBase` beside `theme`. |

**What the player's payload says.** `theme` keeps its meaning — one of the
six, the thing the page has colours for. A game on Custom sends its *base*
there, and the fact that it is custom reaches the page only as a non-null
`backgroundUrl`:

```json
{ "theme": "birthday", "backgroundUrl": "/api/branding/background/k3f9?v=1763650000" }
```

The page is never handed a theme name it has no palette for. The admin's
payload is the other way round — `theme: "custom"`, `themeBase: "birthday"` —
because the admin screen is where the distinction is the point.

## 9. Interface

### Player view

Unchanged in structure. Behind it, when `backgroundUrl` is set: the picture,
the veil, then the page exactly as it is today minus the painted scene (R19).
The header's words gain the card treatment of R18.

### Admin view

On the game's screen, under the theme picker:

- Picking **Custom** reveals two controls, and nothing else on the screen
  moves: a **base theme** select (the six), and the picture control.
- The picture control shows the current picture small, with **Replace** and
  **Remove**, or an upload button when there is none.
- Rejections appear beside the control in words (R23).

### Responsive behaviour

| Width | Behaviour |
|---|---|
| 375px | The picture covers the viewport. Most of a wide picture is off-screen; this is expected and is why R9 asks for size rather than a shape. |
| 768px | As above. |
| 1280px | As above. The picture is fixed, so it does not drift as the page scrolls. |

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| File is not PNG, JPEG or WEBP by its contents | Rejected: the kinds accepted, named. |
| File claims one type and is another | Rejected the same way. Only the contents are believed (R7). |
| Over 5 MB | Rejected: the limit and the file's own size. |
| Longest side under 1200px | Rejected: what it was and what is needed. |
| Either side over 8000px | Rejected the same way. |
| Upload interrupted | Rejected: the upload did not complete. The picture on file is untouched. |
| Picture missing from disk when the player loads | Base theme, no error, nothing in the player's way (R15). |
| `theme_base` holds something unrecognised | Falls back to plain, as every stored theme already does (F04 R8). |
| Game on Custom with no picture | The base theme (R4). Not an error. |

## 11. Acceptance criteria

- [x] Given the theme picker, then Custom is in it alongside the six (R1).
- [x] Given a game on Custom with a base theme, then every colour on the
      player's page is that base theme's, unchanged (R2).
- [x] Given any theme, then the wheel's slices are the same colours (R3).
- [x] Given a game on Custom with no picture, then the page is its base
      theme and nothing is missing (R4).
- [x] Given a game that leaves Custom and returns, then its picture and base
      are still chosen (R5).
- [x] Given a PNG, a JPEG and a WEBP, then each is accepted (R7).
- [x] Given a file renamed to `.png` that is not one, then it is rejected
      (R7).
- [x] Given a file over 5 MB, then it is rejected and says the size (R8).
- [x] Given a picture 900px on its longest side, then it is rejected (R9).
- [x] Given a replacement, then the previous file is gone from disk (R11).
- [x] Given Remove, then the game stays on Custom and shows its base (R12).
- [x] Given a picture configured and deleted from disk, then the player's
      page renders the base theme and no error (R15).
- [x] Given a picture is replaced, then the URL changes (R14).
- [x] Given a game on Custom, then the player's payload carries a base theme
      name in `theme` and a non-null `backgroundUrl` (§8, R24).
- [x] Given a game not on Custom, then `backgroundUrl` is null and the page
      is unchanged from today (R19).
- [x] Given a picture behind the page, then every heading and every line of
      body text sits on a token surface, not on the picture (R18).
- [ ] Given the player's page at 375px with a picture, then the Spin button
      and the prize need no scrolling (R21). Seen at 375px, but on the
      identification step — see §12.
- [x] Every label this feature adds exists in all four languages (R22).
- [x] The four fast suites pass.

## 12. Verification

`php vendor/bin/phpunit` — 762 tests, 41 of them new. `BackgroundStoreTest`
carries R7 to R12: each accepted kind decided by reading the file, a text
file renamed `.png` refused, a name the uploader cannot influence, and the
three measurements with the numbers they report. `GameControllerTest` carries
R1, R2, R5, R6, R11, R12 and R23 — including the one that matters most for
R11, which uploads twice and asserts the first file is gone from disk.
`BackgroundControllerTest` carries R13 and R14 and the four ways of not
having a picture, all of which answer identically. `PlayControllerTest`
carries R2, R4, R15 and section 8: a custom game's payload says `birthday`
and a URL, and a picture deleted from under it says `birthday` and null.
`DatabaseUpgradeTest` carries R2 and R6 — both columns, the nullability each
of them means, a second run that changes neither, and a dry run that adds
neither. `ThemeTest` carries R2's two halves: Custom is in the picker and not
in the bases, and a stored base of `custom` reads as plain.

`npm test` — 950 tests, 30 of them new. `ThemeScene.test.tsx` carries R16, R17 and R19: the
picture replaces the painted scene rather than joining it, covers from the
middle out, wears the veil, and keeps every promise the painted scenes make
about being decoration. `PlayerPage.test.tsx` carries R2 and R19 end to end —
a branding with a picture paints `data-scene="custom"` while the page still
wears the birthday palette, and a branding without one is the page exactly as
it was. `SheetPage.test.tsx` carries R18, the rule this feature turns on:
with a picture the header is inside a card, and without one there is no card.
`GameSettings.test.tsx` carries R1, R2, R6, R12 and R23, including the
rejection message arriving from the server rather than being invented here.

`npm run typecheck` is R22's proof as well as its own: `fr`, `vi` and `zh` are
`Record<MessageKey, string>`, so a label added in English and forgotten
elsewhere is a type error rather than a blank on somebody's screen.
`npm run lint` is clean, and now runs as part of `test-all.ps1` — the fourth
suite was added the same afternoon, which is why this is the first feature
whose "four fast suites" line means four.

**Run against the real database.** The two steps were run on the development
database: both columns added, and `doctrine:schema:update --dump-sql` then
reported nothing to do, so the entity and the database agree.

**Seen in a browser, at 375px.** The development game was put on the custom
theme with the owner's own reference picture — the gold-and-cream balloons
`ThemeScene.tsx` was painted in imitation of — and loaded on a 375px
viewport. The picture covers the page, the veil ties it to the birthday
palette it borrows, the card carries every word, and the network log shows
one request to `/api/branding/background/{key}?v=…` answering 200. The game
was put back as it was afterwards.

What that pass does **not** cover is R21 on the screens that matter most for
it: what was on screen was the identification step, not the wheel with its
Spin button or the result panel. R21 stays unticked.

## 13. Decisions and risks

**Why Custom borrows a palette instead of having one.** `themes.ts` is a
contrast-tested file: every foreground is measured against every surface it
can land on, including both ends of each gradient and the blend between
them. A seventh palette typed by a shop owner would be the one palette in
that file nobody measured. Borrowing means the custom look inherits the
measurement along with the colours, and the test file needs no exception.

**Why words move onto a card (R18).** This is the rule the feature turns
on. Where a word sits on the page colour, that colour is a token and a test
has measured it. Put an arbitrary photograph there and the colour behind the
word stops being knowable — and a veil strong enough to make it knowable
again would wash the picture out to the point of not being worth uploading.
A card the words sit on keeps the guarantee by construction and lets the
picture stay a picture.

**Corrected while building.** This rule was written believing the player's
page printed its campaign name and company name straight onto the page
colour. It does not: `PlayerHeader` is inside `Stage`, and has been since
F04's scenes arrived — the comment on `Stage` says exactly why. The page
that *does* print on bare colour is the gift sheet, which never had a card
at all. So the rule is unchanged in what it promises and changed in where it
lands: the wheel's page needed nothing, and `SheetPage` gained a card that
appears only when a picture is behind it.

**Why the veil is ours and not a slider.** A slider is a control whose wrong
settings are on the one page a player must be able to read, and whose right
setting depends on an image we have never seen. One value, tuned against a
busy picture and a plain one, is a thing we can be responsible for.

**Risk: a shop uploads a picture that is simply ugly behind a wheel.** We
cannot prevent that and should not try. What we can prevent is unreadable,
and that is what R18 and R3 are for. A picture that fights the wheel is a
picture the shop will change.

**Risk: the picture is the slowest thing on the page.** 5 MB over shop wifi
is seconds, and the wheel must not wait for it. The page renders the base
theme and the picture arrives behind it — the same way the logo already
behaves (F04 R26), and the reason R15 exists at all.

**Risk: `var/uploads/backgrounds` grows.** R11 deletes on replace and R12 on
remove, which covers the two ways a file stops being wanted. A game deleted
without removing its picture first would leave one behind; whether deleting
a game sweeps its picture is listed below rather than assumed here.

## 14. Open questions

- Does deleting a game delete its picture? R11 covers replacement and R12
  removal; a deleted game is a third path, and F27's deletion rules are
  where that belongs if the answer is yes.
- Should the admin see the picture as the player will see it — veil, card
  and all — rather than as a thumbnail? A preview is a second rendering of
  the player's page in a screen that has never had one, which is a feature
  of its own if it is worth having.
