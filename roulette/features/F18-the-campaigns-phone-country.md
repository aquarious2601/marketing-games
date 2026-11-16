# F18 — The campaign's phone country

| | |
|---|---|
| **ID** | F18 |
| **Status** | Withdrawn |
| **Interface** | Both |
| **Withdrawn on** | 2026-11-17 |
| **Replaced by** | [F19](./F19-one-person-one-number.md) |

This is a record, not a specification. F18 was written, built and tested, and
then withdrawn before it was ever committed. The file is kept short and kept
here so that nobody builds it again, and so that the features which cite it
have something to point at.

## What it proposed

A number would be stored in international form, always. The campaign would
hold a phone country — a 25-entry closed list, each country carrying its
dialling code and whether a leading `0` is a trunk prefix — chosen by the
admin in the branding section, falling back to the one the request's language
suggested. A `+` number was kept as typed; anything else was completed
against that country. A [P02](./P02-database-upgrades.md) step would re-read
every stored number and merge the duplicates it found.

The whole of it was answering a correct report, which
[F19](./F19-one-person-one-number.md) now answers:

> if the campagne is running in France, if a client tapes +33123456789,
> it's must be the same with 0123456789

## Why it was withdrawn

Three faults, found by running it against the real development database
rather than against its own tests, which all passed.

- **It needed a setting before it worked at all.** The upgrade step refused
  to run until a country had been chosen, because a command has no request
  language to borrow and guessing would rewrite the whole table. Nothing was
  chosen, so new registrations were stored as `+33…` while the existing rows
  kept their national numbers — and the returning player with nineteen spins
  stopped being recognised. The feature's default state was worse than its
  absence. This is now written down as [P02](./P02-database-upgrades.md) R23.
- **It rewrote the player's number.** That one decision caused the other
  two-thirds of the feature: an upgrade step that deletes rows, and an admin
  filter widened to compensate, because the column no longer looked like the
  receipt in somebody's hand.
- **It guessed wrong when it guessed.** The United States has no trunk zero,
  so on an English page `0614856240` was read as `+10614856240` — a number
  that can never be matched again.

## What was kept

Nothing of the code. Two things of the thinking:

- The report itself, and the five spellings of one number that it has to
  answer. They are [F19](./F19-one-person-one-number.md) R7.
- That the merge of two rows for one person must keep the earliest
  registration and move its spins first. That is [F19](./F19-one-person-one-number.md)
  R14 and [P02](./P02-database-upgrades.md) R24.

## The column it left behind

F18's one schema change, `branding.phone_country`, outlived its code: the
withdrawal reverted the mapping, so Doctrine reported the column as a pending
difference against any database that had already been upgraded. It was
dropped by hand on 2026-11-17, after checking that no row held a value —
nothing ever chose a country, which is half of why the feature failed.

Deliberately **not** a [P02](./P02-database-upgrades.md) step. P02 brings a
database up to the current schema; teaching it to clean up after a feature
that never shipped would mean carrying that knowledge forever for the sake of
one developer machine. If a backup from this window is ever restored,
`doctrine:schema:update --dump-sql` will name the column again and
`ALTER TABLE branding DROP phone_country` is the whole of the fix.

The lesson, in one line: the question was never *what is this number in
international form* — that needs a country, and a country is a guess. It was
only ever *are these two strings the same person*, and the strings answer
that themselves.
