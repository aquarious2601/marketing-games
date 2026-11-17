# F24 — The campaign's timezone

| | |
|---|---|
| **ID** | F24 |
| **Status** | Withdrawn |
| **Interface** | Admin |
| **Withdrawn on** | 2026-11-17 |
| **Replaced by** | Nothing yet. [F23](./F23-a-daily-spin-limit.md) R7 stands as a single-tenant stopgap — see *What changes when this becomes a SaaS* below. |

This is a record, not a specification. F24 was written as a `Draft`,
questioned, and withdrawn before a line of it was built. It is kept so that
nobody specifies it again without reading why, and because the question it
asked is a good one that keeps coming back.

## What it proposed

A nullable `timezone` column on the campaign, chosen in the Game module from
a dropdown of every IANA identifier the runtime knows (~420, grouped by
region, each labelled with its current offset). Blank would mean "use the
deployment's `APP_TIMEZONE`", and the blank option would name that zone so
the day in force was never invisible. A `CampaignDayProvider` would resolve
the campaign's zone first and the environment's second, leaving
`CampaignDay` and its unit tests untouched. Twenty-one rules, nineteen
acceptance criteria, a [P02](./P02-database-upgrades.md) step, a new select
component and three translated strings.

## Why it was withdrawn

**One installation serves one shop, so it carries one string.** That string
is `Asia/Ho_Chi_Minh`, it is written down once, and it already can be —
`provision.sh` requires `TIMEZONE=`, writes `APP_TIMEZONE` into
`shared/.env.local`, and the runbook says how to change it on a running
instance. The setting was not missing. F24 moved only *who* may change it,
and charged a column, a dropdown, a service, a component and nineteen
criteria for that.

**The campaign is not the right owner anyway.** The zone is a fact about the
**store**, and this schema has no store: seven entities, no tenant column,
and a `BrandingProvider::getOrCreate()` that hands out *the* one branding
row. F24 put the zone on that row because it is the only thing resembling a
campaign, which made it the right column in the wrong table.

**It is the fault [F18](./F18-the-campaigns-phone-country.md) was withdrawn
for, in a different costume.** F18's first listed fault was that it needed a
setting before it worked at all.
[F23](./F23-a-daily-spin-limit.md) section 13 even warns about forgiving
exactly this. F24 did not need a setting to work — it *was* one, built out
into a module.

## The question it came from, answered

> With the current hour and the last spin's hour, you can calculate whether
> it is a new day?

No — and this is the part worth keeping, because the alternative looks
obviously true until it is written down.

Both timestamps are UTC instants, and "the same day" is not a property of
two instants. `2026-11-17T23:30Z` and `2026-11-18T00:30Z` are an hour
apart. They are:

- the **same** day in Paris — 00:30 and 01:30 on the 18th;
- **different** days in UTC — the 17th and the 18th;
- the **same** day in Ho Chi Minh City — 06:30 and 07:30 on the 18th.

The information needed to choose between those three answers is not in
either timestamp. It has to come from somewhere, and the only open question
is where: a column (F24), an environment variable
([F23](./F23-a-daily-spin-limit.md) R7), the instance's own clock, or a
constant in the source. There is no version of this rule with no setting —
only versions where the setting is cheap. While one installation serves one
shop, `APP_TIMEZONE` is the cheapest one available, because it already
exists.

The two alternatives that genuinely need no setting were both rejected:

- **A rolling 24 hours.** Refuses any return visit that happens to be
  earlier in the day than the last one — roughly half of them — and its gate
  only ever moves later, so a regular customer loses spins across a week. It
  also only means anything when the limit is 1, and
  [F23](./F23-a-daily-spin-limit.md) R4 allows 99. Recorded in
  [F23](./F23-a-daily-spin-limit.md) section 13.
- **The browser's timezone.** Puts the day's boundary in the player's
  system settings, where four taps make it tomorrow. A limit the player can
  move is not a limit.

## What changes when this becomes a SaaS

The product plan is one platform, many shops, each anywhere in the world.
That does not make F24 right. It makes `APP_TIMEZONE` **impossible**, which
is a different and more serious thing: one process cannot hold two zones in
one variable, so the day a second shop in a second country signs up the
setting does not get coarser — it stops having an answer at all.

So the zone does become a column — on the **account**, as it turns out:
not on the campaign, and not even on the shop. An owner's shops all trade in
one timezone, and shops in another timezone are a second account. None of
that existed when this was withdrawn; it is now specified as
[P04](./P04-many-shops-in-one-installation.md), where the zone is one field
of an owner's profile rather than a feature. What a multi-tenant schema has
to settle before a clock is the interesting part of it, all of it visible in
today's seven entities:

- **`player.phone` is globally unique.** One customer registering at two
  shops on the platform is one row, so one shop's daily count would include
  the other's spins, and typing a number at one stall would return a
  customer who registered at another. That is a cross-tenant leak rather
  than a counting bug, and it is the hardest question here: is a person one
  row per platform, or one per store?
- **`reward.name` and `user.username` are globally unique.** Two shops
  cannot both have a prize called *Free coffee*, or an admin called *admin*.
- **`spin` has no store column**, so "how many times has this person played
  today" ([F23](./F23-a-daily-spin-limit.md) R2) is a question about the
  platform rather than about the shop.
- **`BrandingProvider::getOrCreate()` hands out *the* one branding row**, and
  creates it when it is missing. Every request touching a campaign would
  first have to know which shop it belongs to, which is routing — a
  subdomain, a path, a key — before it is a column.
- **[F07](./F07-admin-login.md)'s login** is one user table with no scoping,
  so every admin is every shop's admin.

The timezone is the smallest item on that list and the only one this file
was about. It should arrive as one column of that work, beside the store it
belongs to — not before it, when the only value a four-hundred-option
dropdown could be exercised against is the single row this installation has.

## What stands instead

- [F23](./F23-a-daily-spin-limit.md) R6 to R9, unchanged: the day is midnight
  to midnight in `APP_TIMEZONE`, spins stay in UTC, and an identifier the
  runtime does not recognise refuses to serve.
- The one real defect this exercise found is that `TIMEZONE` *defaults* to
  `UTC` in `provision.sh` rather than being asked for. With a shop at UTC+7
  that puts the day's boundary at 07:00 local — inside opening hours, where
  it both leaks a second spin to an early visitor and refuses a late one on
  what the shop calls a new day. Requiring the variable is a line in
  `provision.sh` beside the three it already requires, and does not need a
  feature file.
- The zone's real home is settled by
  [P04](./P04-many-shops-in-one-installation.md) R9, R10 and R30: a required
  field of the **owner's profile**, beside the company name and logo, with
  one clock per account by rule. `APP_TIMEZONE` retires with it. The stopgap
  is written down and dated rather than quietly relied on: it expires with
  the second owner.
