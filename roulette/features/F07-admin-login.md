# F07 — Admin login

| | |
|---|---|
| **ID** | F07 |
| **Status** | Agreed |
| **Interface** | Admin |
| **Depends on** | [F01](./F01-wheel-prize-configuration.md), [F04](./F04-branding-and-themes.md) |
| **Agreed on** | 2026-11-15 |

## 1. Summary

A login page in front of the admin, with named user accounts, a server-held
session, and throttling on failed attempts.

## 2. Why

Every feature so far has been built with the admin wide open, and every one
of their specs says the same thing: this must land before the game is put in
front of anyone. Right now whoever can reach the server can rewrite the
prizes, change the odds, replace the branding and upload files.

F05 widened that: the upload route now accepts SVG, so the gap is a way to
put a file of someone else's choosing in front of every player.

## 3. Actors

| Actor | Role |
|---|---|
| Admin user | Signs in to configure the game |
| Operator | Has server access; creates the first account from the console |
| Player | Unaffected — the game stays open to everyone |

## 4. User stories

- As an **operator**, I want **to create the first account from the server**,
  so that **nobody can claim the admin by reaching the page first**.
- As an **admin user**, I want **my own login**, so that **access can be
  given and taken away one person at a time**.
- As an **admin user**, I want **to stay signed in while I work**, so that
  **configuring a wheel is not interrupted**.
- As the **business**, I want **guessing attempts to be slowed**, so that
  **one weak password is not the whole defence**.

## 5. Scope

### In scope

- A `user` table: username, hashed password, roles.
- A console command to create a user, prompting for the password.
- `POST /api/login`, `POST /api/logout`, `GET /api/me`.
- Every `/api/admin/*` route requiring an authenticated admin.
- A login page in the SPA, and `/admin` redirecting to it when signed out.
- Signing out from the admin.
- Login throttling.
- Managing users from the admin: list, add, remove, change own password.

### Out of scope

- **Password reset by email** — there is no mail setup, and a reset link is a
  feature with its own attack surface. An operator resets a password from the
  console.
- **Two-factor authentication** — roadmap.
- **Roles beyond admin.** Every user may do everything. A read-only role is a
  separate feature.
- **Remember-me across browser restarts.**
- **An audit trail of who changed what** — roadmap, and worth doing now that
  changes have a name against them.
- **Protecting the player routes.** The game stays open; that is the point of
  it.

## 6. Rules

### Accounts

| # | Rule |
|---|---|
| R1 | A user has a username, a hashed password and at least the admin role. |
| R2 | Usernames are unique, trimmed, 3–40 characters. |
| R3 | Passwords are stored only as a hash, using Symfony's auto hasher. |
| R4 | A password must be at least 12 characters. Length is the only rule: composition rules push people towards `Password1!` and no further. |
| R5 | There is no way to create the first account except from the console. |
| R6 | The console command refuses to echo the password and refuses a duplicate username. |
| R7 | A user may change their own password, which requires their current one. |
| R8 | A user may not delete their own account, so the last admin cannot lock everyone out by accident. |
| R9 | Deleting the last remaining user is refused. |

### Signing in

| # | Rule |
|---|---|
| R10 | `POST /api/login` takes a username and password and, on success, establishes a server-side session. |
| R11 | The session is carried by an httpOnly, SameSite cookie, so page scripts cannot read it. |
| R12 | A failed login says only that the credentials are wrong — never which half was wrong, and never whether the username exists. |
| R13 | Repeated failures are throttled, then blocked for a period. |
| R14 | `POST /api/logout` ends the session server-side. |
| R15 | `GET /api/me` reports who is signed in, or 401 when nobody is. |
| R16 | The session identifier is regenerated on login, so a fixed session cannot be planted before sign-in. |

### What is protected

| # | Rule |
|---|---|
| R17 | Every `/api/admin/*` route requires an authenticated user. |
| R18 | An unauthenticated request to an admin route returns 401 as JSON, never an HTML redirect. |
| R19 | The player routes — `/api/wheel`, `/api/spin`, `/api/branding/logo`, `/api/health` — stay open to everyone. |
| R20 | The logo is served without authentication, because players must see it. |

### The interface

| # | Rule |
|---|---|
| R21 | `/login` is a page in the SPA with username, password and a submit button. |
| R22 | Visiting `/admin` while signed out redirects to `/login`, and returns to `/admin` after signing in. |
| R23 | The admin shows who is signed in and offers Sign out. |
| R24 | The login page is unthemed, like the rest of the admin. |
| R25 | A session that expires while the admin is working surfaces as a prompt to sign in again, not as a silent failure. |

## 7. Data model

| Entity | Field | Type | Notes |
|---|---|---|---|
| `user` | `id` | `INT` PK auto | |
| | `username` | `VARCHAR(40)` not null, unique | R2 |
| | `password` | `VARCHAR(255)` not null | Hash only (R3) |
| | `roles` | `JSON` not null | At least `ROLE_ADMIN` |
| | `created_at` | `DATETIME` not null | |

## 8. API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/login` | none | Sign in |
| POST | `/api/logout` | session | Sign out |
| GET | `/api/me` | session | Who am I |
| GET | `/api/admin/users` | admin | List users |
| POST | `/api/admin/users` | admin | Add a user |
| DELETE | `/api/admin/users/{id}` | admin | Remove a user |
| PUT | `/api/admin/password` | admin | Change own password |

Console: `php bin/console app:create-admin [username]`

## 9. Interface

### Login page — `/login`

Centred card: the campaign's company name if set, a username field, a
password field, a submit button, and one error line. Nothing else — no
"forgot password", no sign-up.

### Admin

A bar showing the signed-in username and a **Sign out** button. A **Users**
section listing accounts with a remove control, a form to add one, and a
change-your-password form.

### States

| State | What is shown |
|---|---|
| Checking the session | A brief loading state, not a flash of the login page |
| Signed out | The login page |
| Signing in | Submit disabled |
| Wrong credentials | "That username or password is not right." |
| Throttled | A message saying to wait, with no countdown precision |
| Signed in | The admin |
| Session expired mid-use | A prompt to sign in again; unsaved edits stay on screen |

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| Empty username or password | Field error; no request sent |
| Wrong username | Same message as a wrong password (R12) |
| Too many failures | 429 and a wait message |
| New password under 12 characters | 422 naming the minimum |
| Change password with the wrong current one | 422, and nothing changes |
| Adding a username that exists | 422 |
| Deleting yourself | 422 (R8) |
| Deleting the last user | 422 (R9) |
| Admin API called with no session | 401 JSON (R18) |

## 11. Acceptance criteria

- [ ] Given no users exist, when the console command runs, then a user is created and the password is not echoed.
- [ ] Given a user exists, when the same username is used again, then the command refuses.
- [ ] Given valid credentials, when posted to `/api/login`, then a session cookie is set, httpOnly, and `/api/me` reports the user.
- [ ] Given the session cookie, then it is httpOnly and SameSite is set.
- [ ] Given a wrong password and a non-existent username, then both responses are identical.
- [ ] Given many failed attempts, then further attempts are rejected with 429.
- [ ] Given a signed-in session, when `/api/logout` is posted, then `/api/me` returns 401.
- [ ] Given no session, when any `/api/admin/*` route is called, then the response is 401 and is JSON.
- [ ] Given no session, then `/api/wheel`, `/api/spin` and `/api/health` still work.
- [ ] Given a logo is set, then it is served to an unauthenticated visitor.
- [ ] Given a signed-out visitor at `/admin`, then they land on `/login` and reach `/admin` after signing in.
- [ ] Given a signed-in admin, then the username and a Sign out control are shown.
- [ ] Given a password change with the wrong current password, then it is refused.
- [ ] Given an attempt to delete your own account, then it is refused.
- [ ] Given an attempt to delete the only account, then it is refused.
- [ ] Given a session that expires while editing, then a sign-in prompt appears and the edits remain on screen.

## 12. Verification

_To be completed when the feature is built._

## 13. Decisions and risks

**Named accounts rather than one shared password.** More to build, and the
right call: a shared password cannot be taken away from one person, and
nothing can be attributed. It also makes an audit trail possible later.

**The first account comes from the console (R5).** The alternative — a
first-run setup page — hands the admin to whoever reaches the URL first, and
that URL has been reachable throughout development. Environment variables
were the other option and put the password in a file and in shell history.

**A server session, not a token.** The cookie is httpOnly, so a script
cannot read it, and logout genuinely ends the session rather than asking the
browser to forget a token that remains valid. The cost is that the API is no
longer stateless, which matters for scaling and does not matter here.

**Cross-site request forgery.** With a cookie session this becomes a real
concern. The mitigation is `SameSite` on the session cookie, which stops a
cross-site form posting to these routes. That is sound, but it is one
mechanism — if the admin is ever served from a different origin to the API,
this needs revisiting with explicit CSRF tokens.

**Length-only password rule (R4).** Composition rules produce predictable
passwords and annoy people into reusing them. Twelve characters with no
other constraint is both stronger in practice and easier to live with.

**This does not make the app safe to deploy on its own.** It closes the
largest hole. Still outstanding before a public deployment: rate limiting on
`POST /api/spin` (F02 section 13), HTTPS, and a production CORS and session
cookie configuration.
