# Deploying the roulette game

One EC2 instance, nginx, PHP-FPM and MariaDB. Every push to `main` that
passes the tests deploys itself. The scope, the rules and the risks are in
[`../features/P03-deployment.md`](../features/P03-deployment.md); this file
is the runbook.

**None of this has been run.** It was written without an AWS account. Do the
first pass on an instance and a database that hold nothing.

| File | What it is |
|---|---|
| `provision.sh` | Run once, as root, on a bare Ubuntu 24.04 instance |
| `nginx.conf` | The site. Installed by `provision.sh` |
| `deploy.sh` | Runs on the instance for each release. Ships inside the tarball |
| `rollback.sh` | Puts the previous release back. No network, no build |
| `../../.github/workflows/deploy.yml` | Test, build, upload, tell the instance |

## What you create by hand, once

Nothing here is scripted on purpose (P03 section 5): it is a handful of
one-off AWS objects, and Terraform for one box is more to maintain than the
box.

### 1. The S3 bucket

Releases and database dumps. Block all public access — everything reaches it
through IAM.

```bash
aws s3 mb s3://YOUR-BUCKET --region YOUR-REGION
aws s3api put-public-access-block --bucket YOUR-BUCKET \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

Add a lifecycle rule: expire `releases/` after 30 days, keep `backups/`
as long as you would want to restore from one.

### 2. The instance

- Ubuntu 24.04 LTS, `t3.small` or larger (`t3.micro` will build nothing but
  does have to run MariaDB and PHP-FPM together).
- **Security group: inbound 80 and 443 only.** No port 22. SSM gives you a
  shell without it — `aws ssm start-session --target i-...`.
- An **instance profile** whose role allows:
  - `AmazonSSMManagedInstanceCore` (the managed policy), and
  - `s3:GetObject` on `arn:aws:s3:::YOUR-BUCKET/releases/*`
  - `s3:PutObject` on `arn:aws:s3:::YOUR-BUCKET/backups/*`

### 3. The DNS record

An A record for your domain pointing at the instance's public IP — ideally
an Elastic IP, so the address survives a stop/start. Do this **before**
running `provision.sh`: certbot needs to resolve the name to issue the
certificate.

### 4. The GitHub OIDC role

So Actions can reach AWS without a stored key.

1. In IAM, add an identity provider: OpenID Connect,
   `https://token.actions.githubusercontent.com`, audience
   `sts.amazonaws.com`.
2. Create a role trusting it, restricted to this repository — the
   `StringLike` on `sub` is what stops any other repository assuming it:

```json
{
  "Effect": "Allow",
  "Principal": { "Federated": "arn:aws:iam::ACCOUNT:oidc-provider/token.actions.githubusercontent.com" },
  "Action": "sts:AssumeRoleWithWebIdentity",
  "Condition": {
    "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
    "StringLike": { "token.actions.githubusercontent.com:sub": "repo:aquarious2601/marketing-games:ref:refs/heads/main" }
  }
}
```

3. Give the role: `s3:PutObject` on `YOUR-BUCKET/releases/*`,
   `ssm:SendCommand` on the instance and on
   `arn:aws:ssm:*:*:document/AWS-RunShellScript`, and
   `ssm:GetCommandInvocation`.

### 5. The GitHub settings

Repository → Settings → Secrets and variables → Actions.

**Secret** (you create it; I never see it):

| Name | Value |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | The role from step 4 |

**Variables** (not secret):

| Name | Value |
|---|---|
| `AWS_REGION` | e.g. `eu-west-3` |
| `RELEASE_BUCKET` | The bucket from step 1 |
| `INSTANCE_ID` | `i-...` |
| `DOMAIN` | The hostname from step 3 |

## Provisioning

Over SSM, as root:

```bash
sudo DOMAIN=roulette.example.com ADMIN_EMAIL=you@example.com RELEASE_BUCKET=YOUR-BUCKET bash provision.sh
```

It installs everything, creates `/srv/roulette`, generates `APP_SECRET` and
a database password into `shared/.env.local` (printing neither), and asks
certbot for a certificate.

## The first deploy

Push to `main`. The workflow runs the four suites, builds, uploads and tells
the instance to install it.

The database is still empty at this point, and `app:upgrade-database`
refuses an empty database by design (P02 R20), so the first deploy's schema
step will say so and stop. That is expected. Once the release is on the
instance, create the schema and an admin, once:

```bash
cd /srv/roulette/current/backend
sudo -u www-data php bin/console doctrine:schema:update --force --complete
sudo -u www-data php bin/console app:upgrade-database
sudo -u www-data php bin/console app:create-admin
```

Then push again, or re-run the workflow, and the deploy completes cleanly.

## When a release is bad

```bash
sudo bash /srv/roulette/current/deploy/rollback.sh
```

Seconds, no build, no network. Run it twice and you are back where you
started.

**It does not undo the database.** P03 R15: `app:upgrade-database` can delete
rows — F19's merge step does — and putting the old code back does not bring
them back. The dump taken immediately before that deploy is in
`/srv/roulette/backups/` and in `s3://YOUR-BUCKET/backups/`.

## Checking on it

```bash
aws ssm start-session --target i-...

systemctl status nginx php8.3-fpm mariadb
tail -f /var/log/nginx/roulette.error.log
tail -f /srv/roulette/shared/var/log/prod.log
ls -lt /srv/roulette/releases/          # which releases are on disk
readlink -f /srv/roulette/current       # which one is live
```

## What this does not do

Written down because the gaps matter more than the parts that work:

- **There is no staging.** A release meets real players first. `rollback.sh`
  is the mitigation, not a substitute.
- **Nothing is monitored.** No alert if the disk fills, MariaDB stops or the
  certificate fails to renew.
- **No backup has ever been restored.** Until one has, the dumps are a
  hypothesis. Restoring one into a scratch database is worth an afternoon:

```bash
gunzip -c /srv/roulette/backups/SOME-DUMP.sql.gz | mysql -u root roulette_restore_test
```

- **One instance.** Losing it loses the campaign, except for what is in S3.
