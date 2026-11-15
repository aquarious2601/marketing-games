# Candidate features

A parking area. Nothing here is agreed or scheduled — each item becomes real
only when it has its own `Fnn-*.md` file that you have confirmed.

Grouped by interface, roughly in the order they would make sense to build.

## Player interface

_Done: [F02](./F02-player-spin.md) the player's spin,
[F03](./F03-spin-animation.md) the spin animation,
[F06](./F06-theme-scenes.md) theme scenes,
[F08](./F08-player-identification.md) player identification,
[F10](./F10-hand-over-to-the-next-player.md) handing over to the next player,
[F12](./F12-multiple-languages.md) English, French, Chinese and Vietnamese,
[F13](./F13-reward-configuration.md) the reward catalogue and its codes._

| Candidate | Sketch |
|---|---|
| **Spin eligibility** | How often someone may play: once ever, once a day, once per code, once per purchase. **Now possible for the first time** — [F08](./F08-player-identification.md) made a player a thing the system knows, and deliberately left the limit out (F08 R18). The feature is mostly the screen the player who has already played sees. Note that [F10](./F10-hand-over-to-the-next-player.md) is *not* this: one spin per identification is how the page behaves at a stall, not a rule about people. |
| **Verifying the number** | An SMS code, so the player list is contacts rather than what people typed. [F08 section 13](./F08-player-identification.md) explains why it was left out and what that costs. |
| **A country setting for phone numbers** | [F08](./F08-player-identification.md) canonicalises loosely, so one person who types their number two ways becomes two players. Worth doing the first time that shows up in the admin list. |
| **Deleting a player** | Served from the console today. Needs a decision about what it does to their spins — see [F08 section 14](./F08-player-identification.md). |
| **A birthday offer** | The reason [F08](./F08-player-identification.md) collects a birthday at all. If this is never built, that column should be dropped rather than kept in case. |
| **Prize reveal and claim** | A claim code or QR instead of "show this screen to staff". Sharper since [F10](./F10-hand-over-to-the-next-player.md): the screen is now cleared by the next player, so a prize shown to nobody is looked up in the Spins module by phone number. Worth knowing whether that is good enough at a counter. |
| **Landing page** | Branding, rules, terms and conditions consent before play. The notice stays short because [F08](./F08-player-identification.md) collects three facts and a number, and it needs translating in all four languages ([F12](./F12-multiple-languages.md)). |
| **Native review of the translations** | [F12](./F12-multiple-languages.md) ships French, Chinese and Vietnamese written by a non-native speaker. A native reader should go over them before a real campaign. |
| **Translating what the admin types** | Prize names, the campaign name and the tagline are shown as entered ([F12](./F12-multiple-languages.md) R10). Per-language content needs a translations table and four fields per prize — its own feature, and [F12 section 13](./F12-multiple-languages.md) is where it starts. |
| **Share / referral** | An extra spin for sharing, or a referral link. |
| **A motion control on the page** | A visible toggle to turn the spin animation off, defaulting to the system's reduced-motion preference. **The accessible answer to [F03](./F03-spin-animation.md) R12** — the preference is currently ignored outright. |
| **Pointer ticking** | The pointer flicks as each slice passes. Offered during F03 and not taken. |
| **Celebration on the result** | The winning slice flashes, the result arrives with a flourish. Offered during F03 and not taken. |
| **Sound** | A tick per slice and a chime on the result, with a mute control. Offered during F03 and not taken. |
| **Losing segments** | "Try again" outcomes, and how they feel fair rather than cheap. |

## Admin interface

_Done: [F01](./F01-wheel-prize-configuration.md) wheel prize configuration,
[F04](./F04-branding-and-themes.md) branding and seasonal themes,
[F05](./F05-svg-logos.md) SVG logos,
[F07](./F07-admin-login.md) admin login,
[F09](./F09-admin-modules.md) admin modules and the spin log._

New admin features get a module in [F09](./F09-admin-modules.md)'s tab strip
— Game, Players, Spins — or a section inside one. Three tabs is right for
three; if this reaches six, the navigation is its own decision again.

| Candidate | Sketch |
|---|---|
| **CSV export of the spin log** | The clear next step for the Spins module, and the honest answer when a shop wants more than the 200 rows the page shows. |
| **Prize stock** | Limited quantities, behaviour when a prize is exhausted. **The natural next feature** — [F13](./F13-reward-configuration.md) made a reward a thing with its own row, so a stock count is a column rather than a migration. |
| **Code expiry** | A voucher with no end date is a liability the shop carries indefinitely. [F13](./F13-reward-configuration.md) issues codes and gives them no lifetime. |
| **A migration path for the reward catalogue** | `prize.reward_id` is `NOT NULL` and this project has no migrations. A database with existing prizes cannot take [F13](./F13-reward-configuration.md) without one. |
| **Campaign scheduling** | Start and end dates, active/paused, multiple campaigns — including switching theme by date. |
| **Theme editor** | Adding or editing themes. The five in [F04](./F04-branding-and-themes.md) are fixed in code and contrast-checked; an editor would need to keep that guarantee. |
| **Claim verification** | ~~Staff marking a prize as handed over.~~ **Done in [F13](./F13-reward-configuration.md)** R21–R24: a claim control on each Spins row, reversible, and absent on a losing row. What is still missing is *who* claimed it, which is an audit trail and its own feature. |
| **Dashboard** | Spins, unique players, prizes given, conversion. Deliberately kept off the Spins module ([F09](./F09-admin-modules.md) §13) rather than built by halves. Note that "unique players" counts rows, not people, until the phone numbers are canonicalised per country — see above. |
| **Filtering the log by date or prize** | Not asked for yet. The phone filter was, because it answers a question at the counter. |

## Platform

_Done: [P00](./P00-walking-skeleton.md) walking skeleton and test harness,
[P01](./P01-end-to-end-tests.md) end-to-end browser tests._

| Candidate | Sketch |
|---|---|
| **Continuous integration** | Run `test-all.ps1` automatically on every push. |
| **Cross-browser end-to-end** | Add Firefox and WebKit to the Playwright projects, once the game has visual behaviour worth the extra minutes. |
| **Anti-abuse** | Rate limiting, duplicate detection, bot protection. Narrowed by [F08](./F08-player-identification.md) but not closed: a script now has to post a phone number before it can spin, which costs it one request and leaves a traceable row — and it can still spin forever. |
| **Deployment** | Where this runs in production, and how it gets there. |
