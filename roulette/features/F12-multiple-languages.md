# F12 — Multiple languages

| | |
|---|---|
| **ID** | F12 |
| **Status** | Agreed |
| **Interface** | Both |
| **Depends on** | [F02](./F02-player-spin.md), [F04](./F04-branding-and-themes.md), [F07](./F07-admin-login.md), [F08](./F08-player-identification.md), [F09](./F09-admin-modules.md) |
| **Agreed on** | 2026-11-15 |

## 1. Summary

The whole application — player page, admin and API messages — speaks English,
French, Chinese and Vietnamese, chosen from the browser and changeable from a
picker on the page.

## 2. Why

The game is run at a counter by a shop, for whoever walks up to it. Both ends
of that are currently English only.

For the **player**, a prize wheel is a five-second interaction with a
stranger's device. "Enter your phone number" in a language they do not read
is where it stops, and the one thing F08 made mandatory is exactly the step
that needs words.

For the **shop**, the admin is the screen they use every day. A Vietnamese
shop owner configuring a Vietnamese campaign should not have to work out
which English word means the odds.

The four languages are the ones asked for: the project is Vietnam- and
France-facing (see F08 section 13), English is the common fallback, and
Chinese covers a large share of the visitors a tourist-facing stall sees.

## 3. Actors

| Actor | Role |
|---|---|
| Player | Reads the page in their own language, or switches it |
| Tourist at a stall | Arrives with a phone set to a language the shop does not speak |
| Admin user | Configures the game in their own language |
| Translator | Edits one file per language; needs no other knowledge of the app |

## 4. User stories

- As a **player**, I want **the page in my own language**, so that **I can
  play without guessing what is being asked**.
- As a **tourist**, I want **to change the language myself**, so that **a
  device set to someone else's language is not the end of it**.
- As an **admin user**, I want **the admin in my own language**, so that
  **the screen I use every day is not a second language all day**.
- As the **business**, I want **one file per language**, so that **a
  translation is a text edit and not a code change**.

## 5. Scope

### In scope

- English, French, Chinese and Vietnamese, everywhere.
- The player page, including the identity step and the result.
- The whole admin: the three modules, the tables, the login.
- API messages: validation violations and refusals, translated server-side.
- Language chosen from the browser, with English as the fallback.
- A visible picker on the player page and in the admin.
- The chosen language remembered in that browser, and sent to the API so the
  server's messages match the page's.

### Out of scope

- **Translating what the admin types.** Prize names, the campaign name, the
  company name and the tagline are shown exactly as entered, in whatever
  language that was. Decided deliberately — see section 13.
- **Right-to-left layouts.** None of the four languages needs one. The day
  Arabic or Hebrew is added, that is its own feature.
- **Locale-aware number, currency or date *formats* beyond what the browser
  already does.** The admin tables already render dates through
  `toLocaleString` with the browser's locale (F11 R7).
- **Translating the roadmap, the feature files or the README.** Internal
  documents, written in English.
- **A per-campaign default language set by the admin.** The browser decides
  and the player can override; an admin-forced language was considered and
  not taken (section 13).
- **Machine translation at runtime.** Every string is a human-written entry
  in a file.
- **Translating the console command's output.** Operator-facing, English.

## 6. Rules

### Which language

| # | Rule |
|---|---|
| R1 | The supported languages are English (`en`), French (`fr`), Chinese (`zh`) and Vietnamese (`vi`). |
| R2 | English is the fallback. A string missing from another language shows the English rather than a key. |
| R3 | With no stored choice, the language is the best match for the browser's preference, and English when none of the four matches. |
| R4 | A regional tag matches its language: `fr-CA` is French, `zh-TW` is Chinese, `en-GB` is English. |
| R5 | A picker on the player page and in the admin changes the language immediately, with no reload. |
| R6 | The picker names each language **in that language** — Tiếng Việt, not Vietnamese — because somebody who cannot read the current language has to find their own. |
| R7 | A chosen language is remembered in that browser and survives a reload. It is a per-browser convenience, not an account setting. |
| R8 | The active language is sent to the API on every request, so a message from the server is in the language the page is in. |

### What is translated

| # | Rule |
|---|---|
| R9 | Every word the application itself writes is translated: the player page, the admin, the login, validation messages and refusals. |
| R10 | Nothing the admin typed is translated. Prize names, the campaign name, the company name and the tagline are shown as entered (section 13). |
| R11 | The default tagline, which the application supplies when the admin has set none (F04), **is** the application's own words and is translated. |
| R12 | A translation never changes behaviour. The same wheel, the same odds, the same rules in every language. |

### How it is built

| # | Rule |
|---|---|
| R13 | One file per language per side: four in the backend's `translations/`, four in the frontend's `src/i18n/`. A translator edits one file and needs nothing else. |
| R14 | Every key present in English exists in all four files. A test fails if one is missing or extra, in either side. |
| R15 | No user-facing string is written inline in a component or a controller. |
| R16 | Server messages are translated on the server, from the request's locale (F12 R8), using Symfony's translator. |

## 7. Data model

**Nothing.** No table, no column, no field. The language is a property of the
browser session, not of a player, a wheel or a campaign.

## 8. API surface

No new endpoint and no changed shape. What changes is the *content* of the
`message` and `violations[].message` fields in the existing error envelope,
which are now returned in the caller's language.

Request:

```
POST /api/player/identify
Accept-Language: vi
```

Response `422`:

```json
{
  "error": {
    "status": 422,
    "message": "Không dùng được thông tin đó.",
    "violations": [
      { "field": "phone", "message": "Số đó trông không giống số điện thoại..." }
    ]
  }
}
```

`field` is **not** translated: it is an identifier the client matches on, and
translating it would break the form that puts each message against its input.

## 9. Interface

### The picker

A small control, named in each language's own script:

```
English · Français · 中文 · Tiếng Việt
```

**Player page:** at the foot of the themed card, below the identity line —
small, out of the way of the game, and reachable at the moment somebody
realises they cannot read the step.

**Admin:** in the header bar beside the signed-in user, next to Sign out.

### Responsive behaviour

The picker is a `<select>` on the player page rather than four buttons: four
language names in a row do not fit the width a 375px phone has left after
F08's identity line, and a native select is the control a phone renders best.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| Browser asks for `fr-CA` | French (R4) |
| Browser asks for `de` | English (R3) |
| Browser asks for nothing | English |
| A key is missing from `vi` | The English string (R2) |
| A stored choice names a language we do not support | Ignored; falls back to the browser (R3) |
| The API is called with no `Accept-Language` | English |
| The API is called with `Accept-Language: zh` | Chinese messages |

## 11. Acceptance criteria

- [ ] Given a browser set to French, when the player page opens, then it is in French.
- [ ] Given a browser set to German, when the player page opens, then it is in English.
- [ ] Given a browser set to `zh-TW`, then the page is in Chinese.
- [ ] Given the picker is changed to Vietnamese, then the page is in Vietnamese immediately, with no reload.
- [ ] Given a language was chosen, when the page is reloaded, then it is still that language.
- [ ] Given the page is in French, when a request fails validation, then the message from the server is in French.
- [ ] Given `Accept-Language: vi`, when `POST /api/spin` is refused, then the refusal is in Vietnamese.
- [ ] Given `Accept-Language: de`, then the server answers in English.
- [ ] Given any of the four languages, then every key in the English file exists in it, and no file has a key English does not.
- [ ] Given the admin in Chinese, then the three module tabs, the table headers and the login are in Chinese.
- [ ] Given a prize named "Free sample", then it reads "Free sample" in all four languages.
- [ ] Given the player page at 375px in any language, then nothing overflows and the Spin button is still reachable without scrolling.

## 12. Verification

Built on 2026-11-15.

| Suite | Result |
|---|---|
| PHPUnit | 267 tests, 1,279 assertions — green |
| Vitest | 477 tests, 16 files — green |
| `npm run typecheck` | clean |
| `npm run lint` | clean |

Of those, 37 PHPUnit tests and 46 Vitest tests are new and specific to this
feature.

Two things were worth proving rather than asserting:

- **That the four files cannot drift (R14).** Both sides compare key sets in
  both directions — missing *and* extra — and check that every placeholder in
  the English survives into each translation. This is the whole defence
  against the failure mode four languages introduce: a string added in
  English and forgotten in Vietnamese is a silent English sentence in the
  middle of a Vietnamese page, which looks like a translation nobody got
  round to rather than a bug. On the frontend, TypeScript already refuses to
  compile a dictionary with a missing key, so those tests cover what the type
  system cannot — an empty string, a dropped `%min%`, a language in `LOCALES`
  with no dictionary behind it.
- **That the negotiation actually negotiates.** `LocaleTest` drives real
  requests: `fr-CA` is French, `zh-TW` is Chinese, `de;q=0.9,vi;q=0.8` is
  Vietnamese because German is not on offer, and `de-DE` alone is whole
  English rather than a half-translated page.

Two rules pull in opposite directions and are tested against each other, in
the same file: a prize the admin named reads identically in all four
languages (R10), and the default tagline — the application's own words —
does not (R11).

### Defect found while building this

The first pass at the logo hint translated "PNG, JPEG, WebP or SVG, up to
2MB. SVG files are cleaned before use." as "PNG, JPEG or WebP" — dropping the
format the upload actually accepts, in all four languages at once. The
existing F05 test caught it. Worth recording because it is the characteristic
i18n mistake: the interface stopped describing the product, and nothing about
the code looked wrong.

### Not verified

Every string here was written by a non-native speaker of three of the four
languages. The grammar is sound and the terms are consistent, but a native
reader should go over the French, Chinese and Vietnamese before a real
campaign — particularly the phone step, which is the wording that decides
whether somebody plays at all. Recorded in section 14.

## 13. Decisions and risks

**What the admin types is not translated (R10).** A shop that wants its
prizes in two languages would have to enter each prize name twice, which
means a translations table, four fields per prize in the admin, and a rule
for what to show when one of them is blank. That is a much larger feature and
it is not the one that was asked for. The interface is translated; the
content is whatever the shop wrote. The cost is real and worth stating: a
Vietnamese shop running a Vietnamese campaign will show "Phần thưởng miễn
phí" to a French tourist whose page is otherwise in French. If that starts
mattering, translatable content is its own feature and this paragraph is
where it starts.

**The browser decides, not the admin.** An admin-chosen language per campaign
was the alternative, and it is right exactly until a tourist walks up — which
at a stall is the case the feature exists for. The browser's own preference
is the best guess available about a stranger, and the picker (R5) is what
makes a wrong guess recoverable in one tap.

**Server messages are translated on the server (R16).** The alternative was
returning stable keys and letting the browser do the wording. That keeps the
API locale-free, and it means every message exists twice — once as a key in
PHP and once as a string in TypeScript — with nothing keeping them in step.
Symfony has a translator and a locale on the request; using it puts each
message in one place.

**The language is a browser setting, not a player setting.** It is not stored
against the player, even though F08 gives us somewhere to put it. A device at
a stall is shared, and the next person's language is their own; a remembered
preference per *browser* (R7) serves the shop's own tablet, which is the case
that actually repeats.

**Four languages is four times the chance of drift.** The test in R14 is the
whole defence: it compares key sets across all four files on both sides and
fails if any has drifted. Without it, a string added in English and forgotten
in Vietnamese becomes a silent English word in the middle of a Vietnamese
page, and nobody notices until a shop does.

## 14. Open questions

- **Who writes the translations.** The four files are written here from the
  strings as they stand. A native reader of each should go over them before a
  real campaign — particularly the Vietnamese, where the phone step's wording
  is the one that decides whether somebody plays.
- **Whether the admin should be forceable to one language.** A shop whose
  staff all read Vietnamese may not want the admin following each person's
  browser.
