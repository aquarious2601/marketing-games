# P03 — Deployment

| | |
|---|---|
| **ID** | P03 |
| **Status** | Agreed |
| **Interface** | Platform |
| **Depends on** | [P00](./P00-walking-skeleton.md), [P02](./P02-database-upgrades.md), [F05](./F05-svg-logos.md), [F07](./F07-admin-login.md) |
| **Agreed on** | 2026-11-17 |

## 1. Summary

The roulette game runs on one EC2 instance behind nginx, and every push to
`main` that passes the tests deploys itself. A release is a directory and a
symlink, so a bad one is undone by moving the symlink back.

## 2. Why

The game is finished enough to be used — F01 to F20 — and runs nowhere. A
campaign at a stall needs a URL on a phone, which needs a host, a domain and
a certificate.

"Automatic for each update" is the actual requirement, and it is the one that
decides the shape. A deployment somebody performs by hand is a deployment
that is performed differently each time, skipped when it is late, and
impossible to roll back under pressure. If it is a script, it is the same
script every time and the interesting parts — back up first, check it
answers, put it back if it does not — happen whether or not anybody
remembers them.

## 3. Actors

| Actor | Role |
|---|---|
| **Developer** | Pushes to `main` and reads whether it landed |
| **The instance** | Runs nginx, PHP-FPM and MariaDB, and holds the only copy of the campaign's data |
| **GitHub Actions** | Runs the tests, builds the release, tells the instance to install it |

## 4. User stories

- As a **developer**, I want **a push to `main` to reach production by
  itself**, so that **deploying is not a thing I can do wrong at eleven at
  night**.
- As a **developer**, I want **a bad release undone in one command**, so
  that **a broken stall is a minute's problem rather than an hour's**.
- As a **shop**, I want **the campaign's data to survive a deploy**, so that
  **nobody loses their logo, their prizes or their players**.

## 5. Scope

### In scope

- Provisioning one Ubuntu 24.04 instance from bare to serving.
- nginx serving the built frontend and proxying `/api` to PHP-FPM.
- MariaDB on the same instance, listening on localhost only.
- A release pipeline: test, build, upload, install, verify, roll back.
- A database dump before every deploy, kept off the instance.
- TLS from Let's Encrypt, renewed automatically.

### Out of scope

- **More than one instance.** No load balancer, no shared session store, no
  read replica. One stall, one box. Section 13 says what would have to
  change first.
- **Staging.** There is one environment. See section 13 — this is the part
  of this feature most likely to be regretted.
- **Running the end-to-end suite in the pipeline.** The repository's
  `CLAUDE.md` says the Playwright suite is the user's to run and must not
  gate a change. It does not gate this one.
- **Infrastructure as code.** The instance, the IAM role and the S3 bucket
  are created by hand once, written down in `deploy/README.md`. Terraform
  for one box is more to maintain than the box.
- **Monitoring and alerting.** Nothing pages anybody. The deploy verifies
  itself; after that, nobody is watching.

## 6. Rules

### The release

| # | Rule |
|---|---|
| R1 | A release is built by GitHub Actions, never on the instance. The instance has no Node, no Composer and no checkout of this repository. |
| R2 | The build is one tarball per commit, named for its SHA, holding the backend with its production dependencies already installed and the frontend already built. |
| R3 | It travels through S3. The instance pulls it with its own IAM role; GitHub never holds a key to the instance, and the instance never holds a key to GitHub. |
| R4 | The instance is told to deploy over SSM. Port 22 is not open to the internet. |
| R5 | A release is extracted to `releases/<sha>`, and becomes live when the `current` symlink is moved. Nothing is edited in place. |
| R6 | The previous release stays on disk. `rollback.sh` moves the symlink back and reloads; it needs no network and no build. |
| R7 | The five most recent releases are kept, and older ones are deleted. |

### What survives a deploy

| # | Rule |
|---|---|
| R8 | `var/uploads` is shared between releases, not copied into them: it holds the campaign's uploaded logo ([F05](./F05-svg-logos.md)), which is data, not code. |
| R9 | `var/sessions` is shared, so a deploy does not sign out every admin or forget every identified player mid-spin ([F08](./F08-player-identification.md) R12). |
| R10 | `var/log` and the cache pool directory are shared. `var/cache` is **not**: it is compiled for one release's code and must not outlive it. |
| R11 | `.env.local` lives in `shared/` and is symlinked into each release. It holds `APP_SECRET` and `DATABASE_URL` and is never in the repository. |

### The database

| # | Rule |
|---|---|
| R12 | Every deploy takes a `mysqldump` before it changes anything, and copies it to S3. Not only the first deploy. |
| R13 | The schema step is `app:upgrade-database` ([P02](./P02-database-upgrades.md)), which is idempotent and resumable, so running it on every deploy is correct even when it has nothing to do. |
| R14 | It is run **after** the dump and **before** the symlink moves, so a failure leaves the old release serving the old schema. |
| R15 | The dump matters because that command can delete rows: [F19](./F19-one-person-one-number.md) R14 merges duplicate players. This is the one step that is not undone by moving a symlink. |
| R16 | Creating the schema on an empty database is a one-off, by hand, documented in `deploy/README.md`. P02 R20 refuses an empty database on purpose and this feature does not argue with it. |

### Verifying

| # | Rule |
|---|---|
| R17 | After the symlink moves, the deploy requests `/api/health` on localhost. A non-200 rolls the symlink back, reloads, and fails the job. |
| R18 | The tests that gate a deploy are the four fast suites: PHPUnit, Vitest, TypeScript and the linter. A red suite means nothing is built and nothing is uploaded. |
| R19 | The deploy script is idempotent: running it twice with the same SHA produces the same live result. |

### Serving

| # | Rule |
|---|---|
| R20 | nginx serves the built frontend from the release and proxies `/api` to PHP-FPM, so production is same-origin exactly as development is ([P00](./P00-walking-skeleton.md) R7) and there is no CORS configuration anywhere. |
| R21 | Everything that is not a file and not `/api` returns `index.html`, because the frontend is a single-page application. |
| R22 | HTTP redirects to HTTPS, and the TLS block passes `HTTPS on` to PHP-FPM so Symfony marks the session cookie `secure`. |
| R23 | MariaDB binds to `127.0.0.1`. The security group opens 80 and 443 and nothing else. |

## 7. Data model

No application data. The instance's layout:

```
/srv/roulette/
  current -> releases/<sha>        # R5
  previous -> releases/<sha>       # R6
  releases/<sha>/{backend,frontend-dist,deploy}
  shared/.env.local                # R11
  shared/var/{uploads,sessions,log,share}   # R8, R9, R10
  backups/<timestamp>.sql.gz       # R12, also copied to S3
```

## 8. API surface

None added. `/api/health` already exists and becomes load-bearing (R17).

## 9. Interface

No user interface. The developer's interface is the Actions run and, when
something is wrong, `rollback.sh` over SSM.

## 10. Validation and error cases

| Condition | Behaviour |
|---|---|
| A test fails | Nothing is built, uploaded or deployed |
| The upgrade command fails | The symlink has not moved; the old release is still serving |
| `/api/health` is not 200 | Symlink back, PHP-FPM reloaded, job fails (R17) |
| The instance is unreachable over SSM | The job fails with the SSM error; nothing has changed on the instance |
| Two deploys at once | The second waits: the workflow takes a concurrency lock on `main` |
| The same SHA deployed twice | The same result (R19) |

## 11. Acceptance criteria

- [ ] Given a bare Ubuntu 24.04 instance, when `provision.sh` runs, then
      nginx, PHP-FPM and MariaDB are installed and the layout in section 7
      exists.
- [ ] Given a provisioned instance and a push to `main`, when the tests
      pass, then the new release is live and `/api/health` answers 200.
- [ ] Given a push whose tests fail, then nothing on the instance changes.
- [ ] Given a deploy, then a dump of the database exists in S3 from before
      it ran.
- [ ] Given a release that does not answer `/api/health`, then the previous
      release is serving again and the job has failed.
- [ ] Given a deploy, then the uploaded logo and the admin's session survive
      it.
- [ ] Given `rollback.sh`, when it runs, then the previous release is live
      within seconds and without a build.
- [ ] Given six deploys, then five releases remain on disk.

## 12. Verification

**Not verified.** Every script here is written and unrun: this session has
no AWS account, no instance and no domain. What has been checked is only
what can be checked without one — shell syntax, the nginx configuration's
grammar, and that the paths, commands and extension names match what this
repository actually needs.

That is a real limitation and not a formality. The first run of
`provision.sh` should be watched, on an instance that holds nothing, and the
first deploy should be made to an empty database rather than a campaign's.

## 13. Decisions and risks

- **One instance, and the data is on it.** MariaDB beside the application is
  the cheapest thing that works and is appropriate for one stall. The whole
  risk is concentrated in one place: if the instance is lost, the campaign is
  lost. R12's dump to S3 is the entire mitigation, which is why it runs on
  every deploy rather than nightly — a deploy is the moment the data is most
  likely to be damaged, and the dump is worthless if it is a day old.
- **No staging, and this is the weak point.** A release is tested by unit
  and integration tests and then meets real players. The end-to-end suite,
  which is the only thing that exercises a browser, is excluded from the
  pipeline by the repository's own rule and is run by hand. So the first
  thing a bad release meets is a customer. The honest mitigation is R6: an
  undo that takes seconds and needs no build. The better answer is a second
  instance, and it is the first thing to add.
- **Why S3 rather than pushing from the pipeline.** A push needs GitHub to
  hold a credential for the instance. With S3 and SSM, GitHub holds a role
  it can assume via OIDC — no long-lived secret — and the instance pulls
  with its own role. Neither side holds a key to the other.
- **Why the tarball carries `vendor/`.** Building on the instance means
  Composer and Node on a production box, and a deploy that fails when
  somebody else's package registry is down. Shipping a built artifact makes
  the instance a thing that only runs code.
- **Risk: R13 runs a schema change on every deploy.** `app:upgrade-database`
  is idempotent, and P02's tests cover a second run doing nothing. The dump
  is taken first because "idempotent" is a property of the code as it is
  today, not a promise about the step somebody adds next year.
- **Risk: the session directory is shared across releases (R9).** If a
  future release changes what is stored in a session, the old sessions are
  still there and will be read by the new code. Today a session holds two
  integers ([F08](./F08-player-identification.md), [F20](./F20-one-spin-per-identification.md)).
  Anything more structured should clear the directory on deploy, deliberately.
- **Risk: nothing watches it.** No alert fires if the instance runs out of
  disk, MariaDB stops, or the certificate fails to renew. Certbot's timer
  handles the usual renewal case; the rest is unmonitored and is the second
  thing to add.

## 14. Open questions

- **A second environment.** Where a release goes before it meets a customer.
- **Where backups are restored to, and whether that has ever been tried.** A
  backup nobody has restored is a hypothesis.
