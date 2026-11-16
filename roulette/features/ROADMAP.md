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
[F13](./F13-reward-configuration.md) the reward catalogue and its codes,
[F16](./F16-a-code-on-every-win.md) a code on every win,
[F17](./F17-the-losing-panel.md) the losing panel,
[F19](./F19-one-person-one-number.md) one person, one number,
[F20](./F20-one-spin-per-identification.md) one spin per identification._

| Candidate | Sketch |
|---|---|
| **Spin eligibility** | How often someone may play: once ever, once a day, once per code, once per purchase. **Now possible for the first time** — [F08](./F08-player-identification.md) made a player a thing the system knows and left the limit out, and [F19](./F19-one-person-one-number.md) made one person one row, without which "once per person" could not be counted. The feature is mostly the screen the player who has already played sees. Note that neither [F10](./F10-hand-over-to-the-next-player.md) nor [F20](./F20-one-spin-per-identification.md) is this: one spin per *identification* is how a stall's device behaves, and anybody may identify again. This is the rule about people, and it is the one that needs a campaign's answer. |
| **Verifying the number** | An SMS code, so the player list is contacts rather than what people typed. [F08 section 13](./F08-player-identification.md) explains why it was left out and what that costs. |
| ~~**A country setting for phone numbers**~~ | The problem is solved; the setting was not the answer. [F19](./F19-one-person-one-number.md) makes two spellings of one number one player by comparing the numbers, so there is nothing to configure. [F18](./F18-the-campaigns-phone-country.md) was this entry taken literally — built, measured against real data, and thrown away. F19 section 2 is what it cost. |
| **Deleting a player** | Served from the console today. Needs a decision about what it does to their spins — see [F08 section 14](./F08-player-identification.md). |
| **A birthday offer** | The reason [F08](./F08-player-identification.md) collects a birthday at all. If this is never built, that column should be dropped rather than kept in case. |
| **A QR code for the claim** | What is left of *prize reveal and claim* now that [F16](./F16-a-code-on-every-win.md) has given every win its own code and made the Spins filter find it. Eight characters work at a counter; a camera would be faster, and the code is already there to encode. |
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
| **A strict database in development** | The development machine runs MariaDB without `STRICT_TRANS_TABLES`, so an out-of-range value is truncated rather than refused. That is how [F21](./F21-amounts-that-fit-the-currency.md)'s bug survived eight features and was found by CI instead. Turning strict mode on locally would move this class of fault from the pipeline to the laptop; it would also change what every existing test does, which makes it a decision rather than a tidy-up. |
| **Code expiry** | A voucher with no end date is a liability the shop carries indefinitely. [F13](./F13-reward-configuration.md) issues codes and gives them no lifetime. |
| **Campaign scheduling** | Start and end dates, active/paused, multiple campaigns — including switching theme by date. |
| **Theme editor** | Adding or editing themes. The five in [F04](./F04-branding-and-themes.md) are fixed in code and contrast-checked; an editor would need to keep that guarantee. |
| **Claim verification** | ~~Staff marking a prize as handed over.~~ **Done in [F13](./F13-reward-configuration.md)** R21–R24: a claim control on each Spins row, reversible, and absent on a losing row. What is still missing is *who* claimed it, which is an audit trail and its own feature. |
| **Dashboard** | Spins, unique players, prizes given, conversion. Deliberately kept off the Spins module ([F09](./F09-admin-modules.md) §13) rather than built by halves. "Unique players" now counts people rather than spellings, since [F19](./F19-one-person-one-number.md). |
| **Filtering the log by date or prize** | Not asked for yet. The phone filter was, because it answers a question at the counter. |

## Platform

_Done: [P00](./P00-walking-skeleton.md) walking skeleton and test harness,
[P01](./P01-end-to-end-tests.md) end-to-end browser tests,
[P02](./P02-database-upgrades.md) database upgrades._

| Candidate | Sketch |
|---|---|
| ~~**Continuous integration**~~ | Done as part of [P03](./P03-deployment.md): the four fast suites gate every push to `main`, and a red one deploys nothing. The Playwright suite is still excluded by the repository's `CLAUDE.md` and still yours to run. |
| **Cross-browser end-to-end** | Add Firefox and WebKit to the Playwright projects, once the game has visual behaviour worth the extra minutes. |
| **Anti-abuse** | Rate limiting, duplicate detection, bot protection. Narrowed by [F08](./F08-player-identification.md) but not closed: a script now has to post a phone number before it can spin, which costs it one request and leaves a traceable row — and it can still spin forever. |
| ~~**Deployment**~~ | Specified in [P03](./P03-deployment.md): one EC2 instance, nginx, PHP-FPM and MariaDB, releases shipped through S3 and installed over SSM. **Written but never run** — see P03 section 12. What is still open is a second environment to deploy to first, and anything that watches the instance once a release is live. |
