# F04 — Branding and seasonal themes

| | |
|---|---|
| **ID** | F04 |
| **Status** | Done |
| **Interface** | Both |
| **Depends on** | [F01](./F01-wheel-prize-configuration.md), [F02](./F02-player-spin.md) |
| **Agreed on** | 2026-11-15 |

## 1. Summary

The admin sets a company name, a campaign name and a logo, and picks one of
four seasonal looks. The player sees the game dressed accordingly.

## 2. Why

The game currently looks like software. At a stall it needs to look like the
shop's promotion, and the four moments that matter commercially — Black
Friday, Christmas, New Year, Halloween — are the ones worth running it for.

Fixed themes rather than a colour editor is a deliberate limit: four looks
that have been checked for contrast and legibility beat an editor that lets
someone put white text on a yellow background the night before a market day.

## 3. Actors

| Actor | Role |
|---|---|
| Admin | Sets the names, uploads the logo, picks the theme |
| Player | Sees the branded, themed game |

## 4. User stories

- As an **admin**, I want **my shop's name and logo on the game**, so that
  **players know whose promotion it is**.
- As an **admin**, I want **to name the campaign**, so that **the page says
  what the promotion is rather than "Spin to win"**.
- As an **admin**, I want **to pick a seasonal look**, so that **the game
  matches the time of year without a designer**.
- As an **admin**, I want **a plain option**, so that **a year-round promotion
  is not stuck wearing a Halloween costume**.

## 5. Scope

### In scope

- Company name, campaign name, tagline, theme and logo, stored and editable.
- Themes: Plain (default), Black Friday, Christmas, New Year, Halloween, and
  Happy Birthday (added 2026-11-15).
- Logo upload, replace and remove.
- Theme applied to the player page.
- Branding shown in the player page header.
- A branding section in the admin, saved on its own.
- **Extended by [F06](./F06-theme-scenes.md), 2026-11-15.** A theme is now a
  full-page treatment rather than a palette. The colour rules below still
  hold; what a theme is allowed to paint with them is F06's business.

### Out of scope

- **Adding, editing or removing themes.** The four are fixed in code, as
  asked. A theme editor is a different feature and a much larger one.
- **Theming the admin page.** It stays plain so it is never mistaken for the
  player view.
- **Re-colouring the wheel slices.** The slice palette is accessibility-tested
  (F01 R14) and stays as it is, on every theme.
- ~~**Decorative motifs** — snowflakes, pumpkins and so on. Considered, not
  chosen.~~ **Reversed by [F06](./F06-theme-scenes.md), 2026-11-15:** colour
  alone made every theme look like the same page in a different shade.
- ~~**Fonts per theme.** Colour only.~~ **Narrowed by F06:** the heading may
  take a different *system* font stack per theme. Shipping a typeface is
  still out of scope — nothing is downloaded.
- **Several campaigns, scheduling, or switching theme by date** — roadmap.
- **Image cropping, resizing or optimisation.** The logo is served as
  uploaded.

## 6. Rules

### Branding

| # | Rule |
|---|---|
| R1 | Exactly one branding record exists, created with defaults on first use. |
| R2 | Company name is optional, trimmed, at most 60 characters. |
| R3 | Campaign name is optional, trimmed, at most 60 characters. |
| R4 | Both may be empty; the game must look right with neither set. |
| R5 | Branding is saved independently of the prize list, so saving one cannot discard the other. |
| R6 | Names are rendered as text, never as markup. |
| R28 | **Added 2026-11-15.** The line under the heading is configurable: optional, trimmed, at most 120 characters. When the admin has not set one, the page shows "One spin, one prize. Good luck." |
| R29 | The admin form shows the admin's own value, never the default pre-filled, so clearing the field returns to the default rather than saving it as a choice. |

### Themes

| # | Rule |
|---|---|
| R7 | The themes are exactly: `plain`, `black-friday`, `christmas`, `new-year`, `halloween`, `birthday`. **Amended 2026-11-15** — `birthday` was added after the feature shipped; see below. |
| R8 | `plain` is the default and the value used when a stored theme is not recognised. |
| R9 | A theme is a set of colour tokens and nothing else: it cannot ship markup, an image or a font file. **Amended 2026-11-15** — was a closed list of five colours; [F06](./F06-theme-scenes.md) adds the surfaces a scene needs, under the same rules. |
| R10 | The wheel's slice colours are identical on every theme. |
| R11 | Every text colour a theme defines clears WCAG AA (4.5:1) against the surface it sits on. A test enforces this for every theme, including any added later. **Amended 2026-11-15** — where a surface is a gradient, both ends and the blend between them are checked. |
| R12 | The API rejects an unknown theme rather than storing it. |
| R28 | Every theme token is an opaque six-digit hex. No gradients, no alpha: a translucent token is a surface whose real colour cannot be measured, so R11 would be checking a colour that is never on screen. **Added 2026-11-15.** |

### Logo

| # | Rule |
|---|---|
| R13 | A PNG, JPEG or WebP image may be uploaded. |
| R14 | SVG is refused. An SVG can carry script, and this one is served to every player. |
| R15 | The file must be at most 2MB. |
| R16 | The file must actually be an image of the claimed type, verified by inspecting its contents, not by trusting its name or the declared type. |
| R17 | Uploading a logo replaces any previous one, and the old file is deleted. |
| R18 | The logo can be removed, which deletes the file. |
| R19 | Uploaded files are stored outside the web root and served through a route, never linked to directly. |
| R20 | The stored filename is generated, never taken from the upload. |
| R21 | The logo is served with its real content type and a `nosniff` header. |

### What the player sees

| # | Rule |
|---|---|
| R22 | The player page uses the configured theme. |
| R23 | The header shows the logo when one is set, the campaign name as the page heading, and the company name beneath it. |
| R24 | With no campaign name, the heading falls back to "Spin to win". |
| R25 | Anything not set is simply absent — no gaps, no placeholders. |
| R26 | A logo that fails to load leaves the rest of the header intact. |
| R27 | The admin page is unaffected by the theme. |

## 7. Data model

One new table.

| Entity | Field | Type | Notes |
|---|---|---|---|
| `branding` | `id` | `INT` PK auto | |
| | `company_name` | `VARCHAR(60)` null | R2 |
| | `campaign_name` | `VARCHAR(60)` null | R3 |
| | `theme` | `VARCHAR(20)` not null | default `plain` |
| | `logo_filename` | `VARCHAR(80)` null | Generated (R20) |
| | `logo_content_type` | `VARCHAR(40)` null | Served back verbatim (R21) |
| | `updated_at` | `DATETIME` not null | |

Files live in `var/uploads/branding/`, outside `public/` (R19).

## 8. API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/branding` | none | Read the branding |
| PUT | `/api/admin/branding` | none | Save names and theme |
| POST | `/api/admin/branding/logo` | none | Upload a logo (multipart) |
| DELETE | `/api/admin/branding/logo` | none | Remove the logo |
| GET | `/api/branding/logo` | none | Serve the logo |

Unauthenticated like everything else so far — see F01 R15.

`GET /api/wheel` gains a `branding` object alongside `prizes`, so the player
page still loads in one request:

```json
{
  "prizes": [],
  "branding": {
    "companyName": "AA Store",
    "campaignName": "Black Friday Giveaway",
    "theme": "black-friday",
    "logoUrl": "/api/branding/logo?v=1763200000"
  }
}
```

`logoUrl` is null when no logo is set. The query string changes when the logo
does, so a replaced logo is not served from cache.

`PUT /api/admin/branding` takes `{ companyName, campaignName, theme }` and
rejects invalid input with 422 in the same shape as F01.

## 9. Interface

### Player view

A header above the wheel:

- the logo, centred, capped in height so a large upload cannot push the wheel
  off screen;
- the campaign name as the heading, or "Spin to win" when unset;
- the company name below in smaller text, when set;
- the tagline beneath that (R28).

The page background, heading, button and result panel follow the theme.

### Admin view

A **Branding** section above the prize list:

- company name and campaign name fields,
- a theme selector showing the five options,
- the current logo with **Replace** and **Remove**, or an upload control when
  there is none,
- its own **Save**, independent of the prize list (R5).

The admin page itself stays plain (R27).

### Responsive behaviour

| Width | Behaviour |
|---|---|
| 375px | Logo at most 56px tall; header stacks; no horizontal scroll |
| 768px+ | Logo at most 72px tall |

### The themes

| Theme | Feel |
|---|---|
| Plain | Light grey and near-black |
| Black Friday | Near-black background, white text, amber accent |
| Christmas | Deep green background, cream text, red accent |
| New Year | Midnight blue background, white text, gold accent |
| Halloween | Very dark purple background, white text, orange accent |
| Happy Birthday | Light pink background, deep pink text, pink accent — the only light theme besides Plain |

Every text/surface pairing is contrast-checked by a test (R11), including
both ends of the card's and the button's gradients.

What each theme is *made of* — the scene, the card, the wheel's frame and
the heading's type — is [F06](./F06-theme-scenes.md) section 9.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| Name longer than 60 characters | Field error; the input also stops at 60 |
| Unknown theme sent to the API | 422; nothing stored |
| Stored theme not recognised when read | Falls back to `plain` rather than breaking the page |
| Upload larger than 2MB | 422 naming the limit; nothing stored |
| Upload is an SVG | 422 saying SVG is not accepted |
| Upload is not a real image | 422; the declared type is not trusted |
| No file in the request | 422 |
| Logo requested when none is set | 404 |
| Logo file missing from disk though the record exists | 404, and the page renders without it |

## 11. Acceptance criteria

- [x] Given no branding is stored, when the admin page loads, then a record is created with theme `plain` and empty names.
- [x] Given the admin sets a company and campaign name and saves, when the player page loads, then both appear in the header.
- [x] Given no campaign name, then the player heading reads "Spin to win".
- [x] Given no branding at all, then the player page looks exactly as it did before this feature.
- [x] Given each theme, when selected and saved, then the player page background changes accordingly.
- [x] Given any theme, then the wheel's slice colours are unchanged.
- [x] Given every theme, then each text colour clears 4.5:1 against the background behind it.
- [x] Given the Happy Birthday theme, then it appears in the admin selector and paints the player page.
- [x] Given a tagline is set, then the player page shows it in place of the default.
- [x] Given no tagline is set, then the player page shows "One spin, one prize. Good luck.".
- [x] Given a tagline is cleared and saved, then the default returns rather than an empty line.
- [x] Given a tagline over 120 characters, then the API rejects it with 422.
- [x] Given an unknown theme sent to the API, then the response is 422 and nothing is stored.
- [x] Given a stored theme that is not recognised, then the player page renders as plain.
- [x] Given a PNG, JPEG or WebP under 2MB, when uploaded, then it is stored and served back with its own content type.
- [x] Given an SVG, when uploaded, then it is refused.
- [x] Given a text file renamed to .png, when uploaded, then it is refused.
- [x] Given a file over 2MB, when uploaded, then it is refused naming the limit.
- [x] Given a logo is replaced, then the previous file no longer exists on disk.
- [x] Given a logo is removed, then the file is deleted and the player page renders without it.
- [x] Given a logo is set, then the served response carries `X-Content-Type-Options: nosniff`.
- [x] Given a company name containing HTML, then it appears as text on the player page.
- [x] Given branding is saved, then the prize list is unchanged; and given prizes are saved, then branding is unchanged.
- [x] Given a themed player page at 375px, then there is no horizontal scroll and the wheel still fits.
- [x] Given the admin page on any theme, then it stays plain.

Added when [F06](./F06-theme-scenes.md) extended the tokens, 2026-11-15:

- [x] Given each theme, then every token is an opaque six-digit hex (R28).
- [x] Given each theme, then the heading, body and error colours clear 4.5:1 at both ends of the card's gradient and at the quarter points between them; likewise the button label on the button's.
- [x] Given a token whose name reads like text, then it appears in the checked pair list, so a new text colour cannot escape the test.

## 12. Verification

Built and checked on 2026-11-15. The suite was 121 PHPUnit tests
(537 assertions), 204 Vitest tests and 116 Playwright tests. All were green
on the full run made while building this.

**Token set extended by F06, 2026-11-15.** Nine colours became eighteen and
the checked pairs five became twelve. Vitest is now 276 tests, all green,
with `tsc -b` clean. The backend was untouched, so PHPUnit and Playwright
were not re-run.

Three checks did real work rather than confirming the obvious:

- **Contrast, on every theme.** A test walks all six themes and all twelve
  foreground/surface pairs, and then walks the blend along each gradient
  surface. The Halloween button was white on orange at 3.56:1 — below the AA
  floor — and failed here before anyone could see it. It is now dark text on
  a brighter orange at 6.62:1. The same test stopped Birthday's button
  gradient reaching pink-600, where white falls to 4.59:1; it stops at
  5.76:1 instead. A second test asserts that every token whose name reads
  like text appears in the pair list, so a new colour cannot be added
  without being checked.
- **The uploader is not believed.** A text file renamed to `.png` and
  declared as `image/png` is refused, because the file is opened and read
  rather than taken at its word. The stored name is generated, so an upload
  called `../../evil.png` lands as 32 hex characters and an extension.
- **The two saves are independent.** Saving branding leaves the prize list
  untouched and the other way round, asserted from both directions.

Also verified: the wheel's slice colours are byte-identical on every theme,
a logo is served with its real content type and `nosniff`, replacing a logo
deletes the previous file from disk, and a record pointing at a missing file
renders as no logo rather than a broken image.


### A note on the test runner

The Playwright suite left the default run on 2026-11-15, at the admin's
request: it took minutes where the rest takes seconds. `.	est-all.ps1` is
now about twenty seconds and says that end-to-end was not included; `-E2E`
adds it. See [P01](./P01-end-to-end-tests.md) R10.

## 13. Decisions and risks

**Tokens stay opaque (R28).** Added when F06 put a scene behind the
content. A translucent token would be a surface whose real colour cannot be
named, and the contrast test would be measuring something that is never on
screen. The scenes get their softness from `opacity` on decorative layers
instead, which never sit behind text — see F06 §13.

**Uploads are unauthenticated.** `POST /api/admin/branding/logo` accepts a 2MB
file from anyone who can reach it. On a development machine that is fine; in
public it is a way to fill the disk. This is the same exposure as every other
admin route (F01 R15) and goes away with admin authentication, which remains
the next thing that must land before deployment.

**SVG is refused on purpose (R14).** It would be the obvious format for a
logo, and it is the one format that can carry script into every player's
browser. Accepting it safely means sanitising it, which is a bigger job than
this feature.

**The content type is verified, not trusted (R16).** A file is checked by
reading it, because the name and the declared type both come from whoever is
uploading.

**Themes are fixed in code.** As asked. The cost is that another campaign
needs a developer; the benefit is that every theme has been contrast-checked
and none can be broken by a colour picker the night before a market day.

**Happy Birthday added 2026-11-15.** A sixth theme, at the admin's request,
and the cost of the fixed-in-code decision made concrete: adding it meant a
code change in two places plus five test files. It also showed the contrast
test doing its job a second time — white on pink-600 came out at 4.60:1,
clearing AA by so little that pink-700 (6.04:1) was used instead.

It is the only light theme besides Plain, which is the point: a birthday
should not look like Black Friday.
