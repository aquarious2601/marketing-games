# F05 — SVG logos

| | |
|---|---|
| **ID** | F05 |
| **Status** | Done |
| **Interface** | Admin |
| **Depends on** | [F04](./F04-branding-and-themes.md) |
| **Agreed on** | 2026-11-15 |

## 1. Summary

Accept SVG as a logo format, sanitising every upload so that a file which
can carry code cannot carry it into a player's browser.

## 2. Why

SVG is the format a designer hands over, and the only one that stays sharp
on a phone, a tablet and a projector at a stall. F04 refused it, which meant
exporting a PNG at some guessed size and living with it.

It was refused because an SVG is a document, not a picture: it can contain
`<script>`, event handlers, external references and embedded objects. That
reason has not gone away — it is handled here rather than avoided.

## 3. Actors

| Actor | Role |
|---|---|
| Admin | Uploads an SVG logo |
| Player | Sees it, and must not be able to be attacked through it |

## 4. User stories

- As an **admin**, I want **to upload the SVG my designer gave me**, so that
  **the logo is crisp on every screen**.
- As an **admin**, I want **to be told when something was stripped out**, so
  that **I know why the logo might look different**.
- As a **player**, I want **the page not to run code someone uploaded**, so
  that **visiting it is safe**.

## 5. Scope

### In scope

- SVG accepted alongside PNG, JPEG and WebP.
- Every SVG sanitised before it is stored, using a maintained library.
- The **sanitised** bytes stored, never the original.
- The admin told when content was removed, and what kind.
- Response headers that stop a stored SVG executing even if the sanitiser
  ever let something through.
- Refusal of files that are hostile rather than merely untidy.

### Out of scope

- **Rendering the logo inline in the page.** It stays in an `<img>`, where
  browsers do not execute SVG script at all. Inlining would make the
  sanitiser the only defence; see section 13.
- **Converting SVG to a raster format on upload.** No rasteriser is
  available, and it would throw away the reason for wanting SVG.
- **Editing or optimising the SVG** beyond what sanitising removes.
- **Changing anything about PNG, JPEG or WebP handling.**

## 6. Rules

### Accepting

| # | Rule |
|---|---|
| R1 | An SVG may be uploaded as a logo. F04 R14 is superseded. |
| R2 | A file is treated as an SVG when its contents begin with an XML or SVG declaration, not because of its name or declared type. |
| R3 | The 2MB limit applies unchanged. |
| R4 | A file that is neither a recognised raster image nor an SVG is refused, as before. |

### Sanitising

| # | Rule |
|---|---|
| R5 | Every SVG is sanitised with `enshrined/svg-sanitize` before anything is stored. |
| R6 | What is stored is the sanitiser's output. The uploaded bytes are never served. |
| R7 | Remote references are removed, so a logo cannot call out to another server when a player views it. |
| R8 | An SVG the sanitiser cannot parse is refused. |
| R9 | An SVG declaring an internal entity (`<!ENTITY`) is refused outright, before parsing, rather than cleaned. |
| R10 | When sanitising changed the file, the upload still succeeds and the admin is told, with the kinds of content removed named. |
| R11 | When nothing was changed, no notice is shown. |

### Serving

| # | Rule |
|---|---|
| R12 | A stored SVG is served as `image/svg+xml`. |
| R13 | An SVG response carries a Content-Security-Policy that sandboxes it and forbids scripts, so opening the logo URL directly cannot run anything. |
| R14 | `X-Content-Type-Options: nosniff` applies as before. |
| R15 | The logo is rendered in an `<img>` element, where SVG script does not execute. |

### Admin

| # | Rule |
|---|---|
| R16 | The file picker offers SVG alongside the raster formats. |
| R17 | The help text says SVG is accepted and that uploads are sanitised. |

## 7. Data model

None. `logo_content_type` already holds whatever was verified at upload;
it now also holds `image/svg+xml`.

## 8. API surface

Unchanged, except that `POST /api/admin/branding/logo` may return a notice
alongside the branding:

```json
{
  "companyName": null,
  "campaignName": null,
  "theme": "plain",
  "logoUrl": "/api/branding/logo?v=1763200000",
  "notice": "Some content was removed from the SVG for safety: scripts, event handlers."
}
```

`notice` is null when nothing was removed (R11).

## 9. Interface

No visual change. The file picker accepts `.svg`, and the help text reads:

> PNG, JPEG, WebP or SVG, up to 2MB. SVG files are cleaned before use.

When something was stripped, the notice appears beside the logo as
information, not as an error — the upload worked.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| Clean SVG | Stored and served |
| SVG containing `<script>` | Stored without it; admin told scripts were removed |
| SVG with `onload=` or other event handlers | Stored without them; admin told |
| SVG referencing an external image or stylesheet | Reference removed; admin told |
| SVG with a `javascript:` link | Removed; admin told |
| SVG containing `<!ENTITY` | Refused (R9) |
| Malformed XML | Refused (R8) |
| SVG over 2MB | Refused, as for any file |
| A file that merely claims to be SVG but is not XML | Refused |

## 11. Acceptance criteria

- [x] Given a clean SVG, when uploaded, then it is stored and served as `image/svg+xml` with no notice.
- [x] Given an SVG containing a script tag, when uploaded, then it is stored, the stored bytes contain no script, and the admin is told scripts were removed.
- [x] Given an SVG with an `onload` attribute, when uploaded, then the stored bytes contain no event handler.
- [x] Given an SVG referencing a remote URL, when uploaded, then the stored bytes do not contain that URL.
- [x] Given an SVG with a `javascript:` href, when uploaded, then the stored bytes do not contain it.
- [x] Given an SVG declaring an entity, when uploaded, then it is refused and nothing is stored.
- [x] Given malformed XML, when uploaded, then it is refused.
- [x] Given a clean SVG, then no notice is returned.
- [x] Given a served SVG, then the response carries a sandboxing Content-Security-Policy and `nosniff`.
- [x] Given a PNG, then it is still accepted and served exactly as before.
- [x] Given a text file renamed to `.svg`, then it is refused.
- [x] Given the admin page, then the picker accepts SVG and the help text says so.
- [x] Given an SVG logo, then the player page shows it in an `<img>` element.

## 12. Verification

Built and checked on 2026-11-15. The backend suite is now 144 tests; the
frontend 208. The end-to-end suite was not run — it is opt-in as of today,
and the admin asked that it run only on request.

The coverage that matters is a table of real attacks, each asserting on the
**bytes that would be served**, not on the response status:

| Payload | Asserted absent from the stored file |
|---|---|
| `<script>alert(1)</script>` | `<script` |
| `<svg onload="alert(1)">` | `onload` |
| `<circle onclick="alert(1)">` | `onclick` |
| `<a xlink:href="javascript:alert(1)">` | `javascript:` |
| `<foreignObject>` wrapping a script | `<script` |
| `<iframe src="https://evil.example/x">` | `iframe` |
| `<image href="https://evil.example/track.png">` | `evil.example` |
| `<use xlink:href="https://evil.example/x.svg#a">` | `evil.example` |

Refused outright rather than cleaned: an entity declaration, a
billion-laughs expansion, malformed XML, a text file named `.svg`, and
anything over 2MB. In each case nothing is stored.

Also verified: a clean SVG survives untouched with no notice; the harmless
parts of a dirty SVG survive (the circle and its colour are still there
after the script is stripped); an SVG named `.png` is still handled as an
SVG, because the contents decide; the response carries
`default-src 'none'; …; sandbox` and `nosniff`; and a PNG is served without
the sandbox, unchanged from F04.

### One thing the tests caught

The first version reported "content was removed" on **every** upload,
including clean files. The sanitiser reformats as it works — it adds an XML
declaration, indents, and expands `<circle/>` into `<circle></circle>` — so
comparing the before and after text flagged a change every time. A notice
that appears on every upload tells the admin nothing, so the comparison now
ignores formatting.

## 13. Decisions and risks

**A library, not a hand-rolled filter (R5).** The list of ways to get script
into an SVG is longer than it looks: `<script>`, every `on*` attribute,
`javascript:` in `href` and `xlink:href`, `<foreignObject>`, `<use>` pointing
at a remote document, CSS `url()`, `<animate>` targeting `href`, namespace
tricks. A sanitiser is exactly the kind of code that should be someone's
maintained project rather than an afternoon's work here.

**Defence does not rest on the sanitiser alone.** Three independent things
have to fail before an uploaded SVG could run code:

1. the sanitiser would have to miss it;
2. the response headers would have to allow it — the CSP sandboxes the
   document and forbids script (R13);
3. the page would have to render it somewhere scripts run — it is rendered in
   an `<img>`, where they do not (R15).

That is why inlining the SVG was declined. Inlining is prettier, because a
single-colour logo could then take the theme's colour, but it removes layers
2 and 3 and leaves the sanitiser alone against every future upload.

**Uploads are still unauthenticated.** Anyone who can reach the admin route
can upload. That is unchanged from F04 and remains the reason admin
authentication must land before any deployment — this feature widens what
can be uploaded, so it raises the stakes rather than creating them.

**Cleaning rather than refusing (R10) is the admin's choice**, made because
most designer-exported SVGs carry editor metadata and unused references that
are harmless but would otherwise mean a perfectly good logo is rejected. The
trade-off is that a hostile upload succeeds quietly-ish — the admin is told,
but nothing is blocked. Files that are actively hostile rather than untidy
(entity declarations, unparseable XML) are still refused outright.
