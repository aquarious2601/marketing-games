# F37 — Deleting a game

| | |
|---|---|
| **ID** | F37 |
| **Interface** | Admin |
| **Depends on** | [F12](./F12-multiple-languages.md), [F27](./F27-the-store-and-its-games.md), [F32](./F32-what-the-game-costs-and-brings.md), [F35](./F35-a-background-of-your-own.md) |
| **Amends** | [F27](./F27-the-store-and-its-games.md) §5 (games could be made and turned off, never removed) |
| **Status** | Agreed |
| **Agreed on** | 2026-11-26 |

## 1. Summary

A game that was never played and is not live can be deleted from the games
list, with everything that belongs to it.

## 2. Why

Games accumulate. A promotion that was set up and thought better of, a
duplicate made while learning the screen, a test run on the real
installation — none of them can be removed today, and all of them sit in the
list beside the real ones, each with a link, each one more row to read past.

What makes this worth writing down rather than just adding is what a game
owns. Everything that points at one cascades: its spins, its wheel and that
wheel's prizes, its gifts. Deleting a game that has been played would take
the shop's record of what it gave away, and the money
[F32](./F32-what-the-game-costs-and-brings.md) counts from it, without
mentioning that it was doing so.

So this feature is mostly about what it refuses.

## 3. Actors

| Actor | Role |
|---|---|
| **Shop owner** | Removes a game they do not want. Is told no when the game is one they should not lose. |

## 4. User stories

- As a **shop owner**, I want to delete a game I set up and do not want, so
  that my list is the promotions I actually run.
- As a **shop owner**, I want to be stopped from deleting a promotion people
  have played, so that a tidy-up cannot cost me my records.

## 5. Scope

### In scope

- A Delete control on each game in the list.
- Refusing a game that has been played, and saying how many times.
- Refusing a game that is live, and saying to turn it off first.
- One confirmation press before it happens.
- Removing the game's wheel and prizes, or its gifts, and its uploaded
  background file.

### Out of scope

- **Deleting a game that has been played.** Not by a different control, not
  by a checkbox, not by typing its name. §14 says what would have to exist
  first.
- **Archiving, hiding or sorting the list.** A game you want kept but out of
  the way is a different feature; this one removes games nobody has used.
- **Undo.** Nothing here is recoverable, which is why what it refuses matters
  more than what it does.
- **Deleting a store**, its rewards, or its customers.

## 6. Rules

| # | Rule |
|---|---|
| R1 | Every game in the list carries a Delete control. |
| R2 | A game with any plays recorded against it is refused, and the message says how many. The record of what a shop gave away is not something a button may take. |
| R3 | A live game is refused, and the message says to turn it off first. Turning it off is one press and reversible ([F27](./F27-the-store-and-its-games.md) R42); deleting is neither. |
| R4 | Delete asks once. The control becomes a confirmation, and only the second press deletes. |
| R5 | The confirmation is abandoned by pressing Cancel, by starting to delete another game, or by the list reloading. Nothing deletes without two deliberate presses on the same row. |
| R6 | Deleting a game removes what belongs to it: its wheel and that wheel's prizes, or its gifts, and its uploaded background picture ([F35](./F35-a-background-of-your-own.md) R13) — no file left behind in the upload directory. |
| R7 | The link stops working at once. Anybody holding it gets the same screen a finished promotion gives ([F27](./F27-the-store-and-its-games.md) R24, R25), which is also the screen an invented link gives. |
| R8 | A browser whose session was bound to the deleted game reads as having no game, exactly as it does for a game turned off ([F27](./F27-the-store-and-its-games.md) R24). |
| R9 | Both refusals are the server's. The page hides the control where it already knows the answer, but a page that asked anyway would still be told no — the rule lives at the endpoint, not in the markup. |
| R10 | Every label and message this adds exists in all four languages ([F12](./F12-multiple-languages.md) R9). |

## 7. Data model

No schema change. The deletion relies on what is already declared: `spin`,
`wheel` and `gift` all reference `game` with `ON DELETE CASCADE`, so the
database removes them with it. R2 is what makes that safe — by the time a
game can be deleted there are no spins to cascade to.

The background file is not in the database and has no cascade, so R6 deletes
it in the endpoint.

## 8. API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `DELETE` | `/api/admin/games/{id}` | admin | Delete the game. |

`204` on success. `422` with a violation when refused, carrying the sentence
the admin reads. `404` when the game is not this store's.

## 9. Interface

### Admin view

In each row of the games list, beside *Turn off* / *Turn live*:

- **Delete**, in the quiet style the other row controls use, not a red
  button. The dangerous thing here is the second press, not the first.
- Pressing it replaces the row's controls with the question and two
  presses: **Cancel** and **Delete**.
- A refusal appears under the row, in the amber the "not ready" line already
  uses, because it is the same kind of sentence: why this cannot happen yet.
- The control is not offered for a game with plays or a live game (R9),
  which is what keeps the common case free of refusals.

### Responsive behaviour

The row already wraps at 375px; the confirmation is two short controls and
wraps with it.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| The game has plays | 422, "Played *n* times…". Nothing is deleted. |
| The game is live | 422, "Turn it off first…". Nothing is deleted. |
| The game is not this store's, or gone already | 404. |
| The background file is missing from disk | Deleted anyway; a missing file is not a failure (F35 R15's habit). |
| Two admins delete the same game at once | The second gets a 404, which is the truth. |

## 11. Acceptance criteria

- [ ] Given a game with no plays that is off, when Delete is confirmed, then
      it is gone from the list (R1, R4).
- [ ] Given the server answers 204, then the page reads it as success and
      reloads the list — see §13.
- [ ] Given the first press, then nothing is deleted until the second (R4).
- [ ] Given Cancel, then the row returns and nothing is deleted (R5).
- [ ] Given a game with plays, then the endpoint refuses and says how many
      (R2, R9).
- [ ] Given a live game, then the endpoint refuses and says to turn it off
      (R3, R9).
- [ ] Given a deleted wheel game, then its wheel and prizes are gone (R6).
- [ ] Given a deleted sheet game, then its gifts are gone (R6).
- [ ] Given a deleted game that had a background, then the file is gone from
      the upload directory (R6).
- [ ] Given the deleted game's link, then it answers as a finished promotion
      does (R7).
- [ ] Given a game with plays or a live game, then the list offers no Delete
      control (R9).
- [ ] Every label this adds exists in all four languages (R10).
- [ ] The four fast suites pass.

## 12. Verification

`php vendor/bin/phpunit` — `GameControllerTest` carries the endpoint: a game
nobody played is deleted and leaves the list; a live one is refused saying to
turn it off; a played one is refused and the message counts the plays; the
wheel and its prizes go with the game; the uploaded picture goes from the
upload directory, which is the part no cascade reaches; the link answers as a
finished promotion does; and an id that is not there is a 404.

`npm test` — `GamesModule.test.tsx` carries the control: offered for a game
that can be deleted, offered for neither a live nor a played one, asking
before it acts, abandoned by Cancel, deleting on the second press and
reloading the list, and showing the server's own refusal against the row it
belongs to. `client.test.ts` carries the 204 that §13 is about, in the one
place every endpoint shares.

`npm run typecheck` and `npm run lint` are clean.

**Not seen in a browser by me.** These are admin screens, and the password is
the owner's. The owner pressed the button, which is how §13 was found.

## 13. Decisions and risks

**Why the refusals rather than a scarier confirmation.** The first draft of
this asked the admin to type the game's name, on the grounds that deleting is
irreversible. That is the right precaution for a delete that can destroy
something; it is the wrong one here, because with R2 and R3 the only games
that can be deleted are games nobody has played and nobody can reach. The
cost of the wrong row is then a few minutes of setup, and the right design
for that is one confirming press rather than a sentence to copy.

**Why Delete is not red.** The row already carries the control that matters —
*Turn off* — and a red button next to it draws the eye to the one action that
cannot be undone. The confirmation is where the weight belongs.

**The risk this leaves.** A shop that wants a played promotion gone cannot
have it. That is deliberate, and it is the refusal somebody will eventually
ask to override; §14 says what that would need.

**Found by the owner, five minutes after it was built.** A game with no
plays, turned off, refused to delete with "that game could not be deleted" —
and had in fact been deleted. The endpoint answers `204 No Content`, which
carries no body at all; Symfony strips one even from a `JsonResponse(null)`.
The API client called `response.json()` on it, which throws, and the throw
became `ApiError('The server returned a malformed response.')` — not a
refusal, so the page fell back to its own sentence and never reloaded the
list.

The bug was not in this feature. It was in `client.ts`, and it is as old as
the first endpoint to answer 204:

- **Deleting a reward** ([F13](./F13-reward-configuration.md) R6) has
  reported a failure on success since it was built.
- **Next player** ([F10](./F10-hand-over-to-the-next-player.md) R3) has been
  throwing on every press. Nobody saw it because that caller deliberately
  ignores failures — "a failed call is survivable" — which is exactly the
  comment that let it hide.

`readJson` now reads 204 as what it means: done, and nothing to say. The
fix is six lines in one place, and the test for it is in `client.test.ts`
rather than here, because the next endpoint to answer 204 should not have to
rediscover this.

**What this says about the tests that passed.** The list's own tests mock
`deleteGame`, so they proved the button calls the function and never that
the function works. The gap was between two green suites, which is where
this kind of bug lives; what caught it was somebody pressing the button.

## 14. Open questions

- What would deleting a played game require? Not a louder confirmation: the
  shop's figures for last quarter are in those rows, so it needs somewhere
  for the numbers to live after the game does not — an archive, or a copy of
  the totals that does not depend on the spins. That is its own feature.
- Should the games list show a game's last play date? It is the fact an
  owner would want before deciding a promotion is finished, and this feature
  gives them a reason to want it.
