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
[F22](./F22-a-celebration-on-the-result.md) a celebration on the result,
[F20](./F20-one-spin-per-identification.md) one spin per identification,
[F23](./F23-a-daily-spin-limit.md) a daily spin limit._

| Candidate | Sketch |
|---|---|
| ~~**Spin eligibility**~~ | Done as **once a day**: [F23](./F23-a-daily-spin-limit.md), a number on the campaign and a fourth screen for the person who has had their spins. The other shapes the sketch listed are still open and each is its own decision — *once ever* (no day boundary, so no timezone, but a campaign that never forgets), *once per receipt* and *once per code* (both need something to scan or type, which is a feature before it is a rule). What F23 settles for all of them is the counting: one person is one row ([F19](./F19-one-person-one-number.md)), the day is the shop's ([F23](./F23-a-daily-spin-limit.md) R6), and the refusal has a screen. |
| **Verifying the number** | An SMS code, so the player list is contacts rather than what people typed. [F08 section 13](./F08-player-identification.md) explains why it was left out and what that costs. |
| ~~**A country setting for phone numbers**~~ | The problem is solved; the setting was not the answer. [F19](./F19-one-person-one-number.md) makes two spellings of one number one player by comparing the numbers, so there is nothing to configure. [F18](./F18-the-campaigns-phone-country.md) was this entry taken literally — built, measured against real data, and thrown away. F19 section 2 is what it cost. |
| **Deleting a player** | Served from the console today. Needs a decision about what it does to their spins — see [F08 section 14](./F08-player-identification.md). |
| **A birthday offer** | The reason [F08](./F08-player-identification.md) collects a birthday at all. If this is never built, that column should be dropped rather than kept in case. |
| **A QR code for the claim** | What is left of *prize reveal and claim* now that [F16](./F16-a-code-on-every-win.md) has given every win its own code and made the Spins filter find it. Eight characters work at a counter; a camera would be faster, and the code is already there to encode. |
| **Landing page** | Branding, rules, terms and conditions consent before play. The notice stays short because [F08](./F08-player-identification.md) collects three facts and a number, and it needs translating in all four languages ([F12](./F12-multiple-languages.md)). |
| **Native review of the translations** | [F12](./F12-multiple-languages.md) ships French, Chinese and Vietnamese written by a non-native speaker. A native reader should go over them before a real campaign. |
| **Translating what the admin types** | Prize names, the campaign name and the tagline are shown as entered ([F12](./F12-multiple-languages.md) R10). Per-language content needs a translations table and four fields per prize — its own feature, and [F12 section 13](./F12-multiple-languages.md) is where it starts. |
| **Share / referral** | An extra spin for sharing, or a referral link. |
| **A motion control on the page** | A visible toggle to turn the spin animation off, defaulting to the system's reduced-motion preference. **The accessible answer to [F03](./F03-spin-animation.md) R12 and now [F22](./F22-a-celebration-on-the-result.md) R11** — both ignore the preference outright, both for the same reason, and this is the honest way to give it back. It should cover the wheel as well as the confetti: six seconds of spinning is the part worth turning off first. |
| **Pointer ticking** | The pointer flicks as each slice passes. Offered during F03 and not taken. |
| ~~**Celebration on the result**~~ | Done: [F22](./F22-a-celebration-on-the-result.md), confetti on a win and nothing on the losing slice. The winning slice flashing is still open and still awkward — it animates inside `wheel-stage`, whose transitions drive the spin's phases. |
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
| **Campaign scheduling** | Start and end dates, active/paused, multiple campaigns — including switching theme by date. Every one of those dates needs a timezone to mean anything; today that is `APP_TIMEZONE` ([F23](./F23-a-daily-spin-limit.md) R7), and a second caller for it is what would reopen the withdrawn [F24](./F24-the-campaigns-timezone.md). |
| **Theme editor** | Adding or editing themes. The five in [F04](./F04-branding-and-themes.md) are fixed in code and contrast-checked; an editor would need to keep that guarantee. |
| **Claim verification** | ~~Staff marking a prize as handed over.~~ **Done in [F13](./F13-reward-configuration.md)** R21–R24: a claim control on each Spins row, reversible, and absent on a losing row. What is still missing is *who* claimed it, which is an audit trail and its own feature. |
| **Dashboard** | Spins, unique players, prizes given, conversion. Deliberately kept off the Spins module ([F09](./F09-admin-modules.md) §13) rather than built by halves. "Unique players" now counts people rather than spellings, since [F19](./F19-one-person-one-number.md). |
| **Filtering the log by date or prize** | Not asked for yet. The phone filter was, because it answers a question at the counter. |
| **Timestamps in the shop's own day** | Every date cell in the admin is rendered in the admin's browser zone. That is the right answer for somebody standing in the shop and the wrong one for somebody reviewing a Vietnamese campaign from France — and it disagrees with the day a spin is counted in — `APP_TIMEZONE`'s today ([F23](./F23-a-daily-spin-limit.md) R6), the owner's own once [P04](./P04-many-shops-in-one-installation.md) R30 lands. Smaller than it looked: one account is one timezone, so a chain's admin has exactly one right answer rather than one per branch. |
| ~~**The shop's timezone as an admin field**~~ | Specified and withdrawn as [F24](./F24-the-campaigns-timezone.md), then **answered by [P04](./P04-many-shops-in-one-installation.md)** R9, R10, R30: the zone is a required field of the owner's profile, not of the campaign and not of the shop — an owner's shops all trade in one timezone, and shops in another are another account. `APP_TIMEZONE` retires with it, and the dropdown becomes part of **F25**'s profile form. |
| **Shops and games in the admin** (**F25**) | The screens for what [P04](./P04-many-shops-in-one-installation.md) builds: the company profile form and the banner that chases an owner to finish it, creating a shop, creating a game, pointing a shop at the game it should run, and getting the link or its QR code out of the system. P04 ships console commands so it can be operated meanwhile; this is the half an owner actually touches, and it is where the Spins and Players modules learn to say which shop they are showing. |

## Platform

_Done: [P00](./P00-walking-skeleton.md) walking skeleton and test harness,
[P01](./P01-end-to-end-tests.md) end-to-end browser tests,
[P02](./P02-database-upgrades.md) database upgrades._

| Candidate | Sketch |
|---|---|
| ~~**Continuous integration**~~ | Done as part of [P03](./P03-deployment.md): the four fast suites gate every push to `main`, and a red one deploys nothing. The Playwright suite is still excluded by the repository's `CLAUDE.md` and still yours to run. |
| ~~**Many shops in one installation**~~ | **Specified as [P04](./P04-many-shops-in-one-installation.md)**: accounts with a company profile that gates creating anything, shops, account-level games, a shop running one of them behind an opaque link, every table scoped, and a migration that turns today's single campaign into one of each. The admin screens for it are the separate **F25** below. What follows is the sketch it came from. Nothing in the schema knows about a tenant — seven entities, no store column, [`BrandingProvider`](../backend/src/Branding/BrandingProvider.php) hands out *the* one campaign, and `player.phone`, `reward.name` and `user.username` are each unique across the whole database, so one customer registering at two shops is a single shared row. **The question to settle first is whether a person is one row per platform or one per store** — cross-tenant visibility and every daily count depend on the answer, and routing, query scoping and an owner for a campaign all follow from it. Every feature built before this lands is one more to retrofit: [F23](./F23-a-daily-spin-limit.md)'s "spins by this person today" is already a query that would need a store. The withdrawn [F24](./F24-the-campaigns-timezone.md) is one column of it. |
| **Cross-browser end-to-end** | Add Firefox and WebKit to the Playwright projects, once the game has visual behaviour worth the extra minutes. |
| **Anti-abuse** | Rate limiting, duplicate detection, bot protection. Narrowed by [F08](./F08-player-identification.md) but not closed: a script now has to post a phone number before it can spin, which costs it one request and leaves a traceable row — and it can still spin forever. |
| ~~**Deployment**~~ | Specified in [P03](./P03-deployment.md): one EC2 instance, nginx, PHP-FPM and MariaDB, releases shipped through S3 and installed over SSM. **Written but never run** — see P03 section 12. What is still open is a second environment to deploy to first, and anything that watches the instance once a release is live. |
