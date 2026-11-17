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

## Before you start

Three things this needs that are not in the repository.

**An AWS account**, with permission to create IAM roles, an S3 bucket and an
EC2 instance. A fresh account's root user has all of that; an account
somebody else administers may not.

**The AWS CLI**, which every command below is written for:

```powershell
winget install Amazon.AWSCLI
```

**The Session Manager plugin**, which is how you get a shell on a machine
with no SSH port:

```powershell
winget install Amazon.SessionManagerPlugin
```

Install everything you are going to install first, then **close and reopen
the terminal** — winget updates the PATH for new shells only, so a freshly
installed tool is "not recognized" in the window you installed it from. That
will happen once per tool otherwise.

Then sign the CLI in. Create an access key in the IAM console for your own user, and:

```powershell
aws configure
```

It asks for the key, the secret, a default region and an output format.
Those credentials stay on your machine — nothing in this repository reads
them, and they are not the credentials the deployment uses. The deployment
has its own role, created in step 7, which is what GitHub assumes.

Check it worked:

```bash
aws sts get-caller-identity
```

That prints your account id, which step 7 needs.

Optional but worth it: `winget install GitHub.cli`. It sets the
repository's variables in step 8 without clicking through Settings, triggers
a deploy with `gh workflow run deploy.yml --ref main`, follows it with
`gh run watch`, and is what the branching workflow in
[`../features/README.md`](../features/README.md) uses for pull requests.

## What you create by hand, once

Nothing here is scripted on purpose (P03 section 5): it is a handful of
one-off AWS objects, and Terraform for one box is more to maintain than the
box. Run them one at a time and read each result — a half-applied script is
harder to debug than a step that stopped.

**Run all of this in Git Bash, not PowerShell.** The commands use `export`,
`$(...)` and heredocs, which PowerShell parses differently — `export` alone
is enough to stop it. Git Bash comes with Git, so it is already here.

Git Bash has one trap of its own, worth knowing before it bites: it
rewrites anything that *looks* like a POSIX path into a Windows path
before the command sees it. Not only arguments that begin with a slash —
it reaches inside them too, so `DeviceName=/dev/sda1` arrives as
`DeviceName=C:/Program Files/Git/dev/sda1`.

What makes it expensive is that the errors blame the value. A mangled
`/aws/service/...` comes back as `ParameterNotFound`, which reads as a
wrong parameter name; a mangled `/dev/sda1` comes back as
`InvalidBlockDeviceMapping`, which reads as a wrong device. Both are the
shell.

So `MSYS_NO_PATHCONV=1` is exported once below, for the whole session,
rather than guessed at per command. It is an unused variable on Linux
and macOS.

It has one consequence worth knowing, because it looks like a new bug
the first time: with rewriting off, a *local* path like
`~/marketing-games/x.sh` is no longer translated either, and the
Windows `aws.exe` cannot open `/c/Users/...`. So every local file below
is given as a relative path, which needs no translation on any
platform. If you ever need an absolute one here, write it Windows-style
with forward slashes: `C:/Users/you/thing.sh`.

Work from a directory of its own, because the steps below write small
policy files and you do not want them in the repository:

```bash
mkdir -p ~/roulette-setup && cd ~/roulette-setup
```

Set these once in the shell you are working in. Only two lines need
editing:

```bash
# Git Bash only. See the note above: without this, any argument that
# looks like a POSIX path is rewritten before the command sees it, and
# the errors blame the value rather than the shell. Harmless elsewhere.
export MSYS_NO_PATHCONV=1

# Windows only. The console encoding is cp1252, and some of what the
# instance prints is not: apt and certbot use arrows and box drawing.
# Without this the CLI dies with "charmap codec can't encode character",
# which looks like the command failed when only the printing did.
export PYTHONUTF8=1

export AWS_REGION=eu-west-3
export REPO=aquarious2601/marketing-games

export DOMAIN=roulette.example.com           # <- yours
export EMAIL=you@example.com                 # <- yours

export ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
# A bucket name must be unique across every AWS account in the world, so it
# ends in yours rather than in a guess at what nobody else has taken.
export BUCKET="marketing-games-roulette-$ACCOUNT"

echo "account $ACCOUNT, region $AWS_REGION, bucket $BUCKET"
```

If `$ACCOUNT` comes out empty, `aws configure` has not been run or the
credentials are wrong; nothing below will work until that line prints a
twelve-digit number.

The policy files below are written and referenced **relatively**, on
purpose. On Windows the AWS CLI is a native binary and Git Bash's `/tmp` is
not a path it can see, so `file:///tmp/thing.json` fails with "No such file
or directory" while `file://thing.json` works everywhere. (The `/tmp` paths
in step 6 are different — those run on the instance, which is Linux.)

### 1. The S3 bucket

Releases, the `provision.sh` bootstrap, and the database dumps.

```bash
aws s3api create-bucket --bucket "$BUCKET" --region "$AWS_REGION" \
  --create-bucket-configuration LocationConstraint="$AWS_REGION"

aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws s3api put-bucket-versioning --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled
```

Versioning is on because `backups/` lives here: a dump overwritten by a
later one is a dump you no longer have.

Releases are disposable; dumps are not. Expire only the former:

```bash
cat > lifecycle.json <<'JSON'
{"Rules":[{"ID":"expire-releases","Status":"Enabled",
  "Filter":{"Prefix":"releases/"},"Expiration":{"Days":30}}]}
JSON
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" \
  --lifecycle-configuration file://lifecycle.json
```

### 2. The instance's role

What the box itself is allowed to do: be managed by SSM, read its own
releases, write its own backups. Nothing else.

```bash
cat > ec2-trust.json <<'JSON'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow",
  "Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}
JSON

aws iam create-role --role-name roulette-instance \
  --assume-role-policy-document file://ec2-trust.json

aws iam attach-role-policy --role-name roulette-instance \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore

cat > instance-policy.json <<JSON
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":"s3:GetObject",
  "Resource":["arn:aws:s3:::$BUCKET/releases/*","arn:aws:s3:::$BUCKET/bootstrap/*"]},
 {"Effect":"Allow","Action":"s3:PutObject",
  "Resource":"arn:aws:s3:::$BUCKET/backups/*"}]}
JSON

aws iam put-role-policy --role-name roulette-instance \
  --policy-name roulette-s3 --policy-document file://instance-policy.json

aws iam create-instance-profile --instance-profile-name roulette-instance
aws iam add-role-to-instance-profile \
  --instance-profile-name roulette-instance --role-name roulette-instance
```

`bootstrap/*` is readable because that is how `provision.sh` reaches the
instance — see section 6. The box can read releases and write backups and
can do nothing else in your account.

### 3. The security group

Two ports. No 22: SSM gives you a shell without one, which is the whole
reason this deploys over SSM.

```bash
export VPC=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].VpcId' --output text)

export SG=$(aws ec2 create-security-group --group-name roulette-web \
  --description "roulette: http and https only" --vpc-id "$VPC" \
  --query GroupId --output text)

aws ec2 authorize-security-group-ingress --group-id "$SG" \
  --ip-permissions \
  'IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0}]' \
  'IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0}]'

echo "security group $SG"
```

Outbound is left wide open, and has to be: the agent talks to SSM and the
instance pulls from S3, both over 443.

### 4. The instance

Ubuntu 24.04, `t3.small`. Not `t3.micro` — MariaDB, PHP-FPM and nginx
together on 1 GB will survive a demo and fall over at a stall.

```bash
export AMI=$(aws ssm get-parameter \
  --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id \
  --query 'Parameter.Value' --output text)

export INSTANCE=$(aws ec2 run-instances \
  --image-id "$AMI" --instance-type t3.small \
  --security-group-ids "$SG" \
  --iam-instance-profile Name=roulette-instance \
  --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=20,VolumeType=gp3,Encrypted=true}' \
  --metadata-options 'HttpTokens=required' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=roulette}]' \
  --query 'Instances[0].InstanceId' --output text)

echo "instance $INSTANCE"
aws ec2 wait instance-status-ok --instance-ids "$INSTANCE"
```

`HttpTokens=required` forces IMDSv2, which is what stops a server-side
request forgery in the application from reading the instance's credentials.
This application takes a URL from nobody, but the setting costs nothing and
the next feature might.

A key pair is deliberately not created. There is no SSH.

### 5. A fixed address, and DNS

The address must outlive a stop/start, or the certificate and the DNS record
point at somebody else's instance.

```bash
export ALLOC=$(aws ec2 allocate-address --domain vpc --query AllocationId --output text)
aws ec2 associate-address --instance-id "$INSTANCE" --allocation-id "$ALLOC"

aws ec2 describe-addresses --allocation-ids "$ALLOC" \
  --query 'Addresses[0].PublicIp' --output text
```

Create an **A record** for `$DOMAIN` pointing at that address, then wait for
it to resolve:

```bash
nslookup "$DOMAIN"          # must print the address above before you provision
```

`dig` is not installed on Windows, and Git Bash does not bring it;
`nslookup` ships with the operating system and is in every shell. On Linux
or macOS `dig +short "$DOMAIN"` is the tidier answer.

Certbot verifies by HTTP, so provisioning before this resolves gets you an
instance without a certificate. Not fatal — the script says how to re-run
certbot — but it is the step people skip.

### 6. Provisioning the instance

**The instance has no git and no GitHub credentials** (P03 R1), so the
script reaches it through the bucket — but it cannot be fetched with
`aws s3 cp`, because a fresh Ubuntu image has no AWS CLI and installing it
is one of the things `provision.sh` does. A bootstrap cannot depend on the
tool it bootstraps.

So the two files are fetched with `curl`, which Ubuntu does ship, from
presigned URLs generated on your machine. The URLs carry their own
short-lived read permission, so the bucket stays private and the instance
still needs no credentials of its own at this point.

```bash
# From the repository, not from ~/roulette-setup: these two paths are
# relative to the checkout. Relative is deliberate — with
# MSYS_NO_PATHCONV=1 set, Git Bash no longer rewrites ~/... into a
# Windows path either, so an absolute POSIX path is one the Windows
# aws.exe cannot open. A relative path has nothing to rewrite.
cd ~/marketing-games        # wherever this repository is checked out

# Both files: provision.sh installs nginx.conf from beside itself, so a
# bootstrap that carries only the script dies half way through, after
# MariaDB and PHP are installed and before anything serves.
aws s3 cp roulette/deploy/provision.sh "s3://$BUCKET/bootstrap/provision.sh"
aws s3 cp roulette/deploy/nginx.conf   "s3://$BUCKET/bootstrap/nginx.conf"

# Generated here, where the credentials are. Thirty minutes is longer
# than provisioning takes and short enough not to matter afterwards.
export PROVISION_URL=$(aws s3 presign "s3://$BUCKET/bootstrap/provision.sh" --expires-in 1800)
export NGINX_URL=$(aws s3 presign "s3://$BUCKET/bootstrap/nginx.conf" --expires-in 1800)

aws ssm send-command --instance-ids "$INSTANCE" \
  --document-name AWS-RunShellScript \
  --timeout-seconds 900 \
  --parameters commands="[
    \"curl -fsSL '$PROVISION_URL' -o /tmp/provision.sh\",
    \"curl -fsSL '$NGINX_URL' -o /tmp/nginx.conf\",
    \"DOMAIN=$DOMAIN ADMIN_EMAIL=$EMAIL RELEASE_BUCKET=$BUCKET TIMEZONE=$TIMEZONE bash /tmp/provision.sh\"
  ]" --query 'Command.CommandId' --output text
```

`TIMEZONE` is where the shop is, and it is what decides when a player's day
rolls over for [F23](../features/F23-a-daily-spin-limit.md)'s spin limit.
Set it before you provision — `export TIMEZONE=Europe/Paris`, or
`Asia/Ho_Chi_Minh` — because UTC midnight is 1am in Paris and 7am in Ho Chi
Minh City, and a campaign with a daily limit would hand out its next round
of spins at those hours. It defaults to `UTC`, which is right only for a
shop that is actually in it.

An identifier PHP does not recognise stops the application rather than
quietly becoming UTC (F23 R8), so a typo fails the health check and rolls
the release back. That is the intended failure: a timezone that is silently
wrong is one nobody notices for a week.

To change it on an instance that is already running, edit
`/srv/roulette/shared/.env.local` and reload PHP — nothing needs
redeploying, because no stored data depends on it:

```bash
aws ssm send-command --instance-ids "$INSTANCE" \
  --document-name AWS-RunShellScript \
  --parameters commands="[
    \"sed -i 's|^APP_TIMEZONE=.*|APP_TIMEZONE=Europe/Paris|' /srv/roulette/shared/.env.local\",
    \"grep -q '^APP_TIMEZONE=' /srv/roulette/shared/.env.local || echo 'APP_TIMEZONE=Europe/Paris' >> /srv/roulette/shared/.env.local\",
    \"systemctl reload php8.3-fpm\",
    \"curl -fsS -o /dev/null -w '%{http_code}' https://$DOMAIN/api/health\"
  ]" --query 'Command.CommandId' --output text
```

The `grep ... ||` line is there for an instance provisioned before F23,
whose `.env.local` has no such line for `sed` to find.

Take the command id it prints and read what happened — this is the one step
worth watching line by line the first time:

```bash
aws ssm get-command-invocation --command-id COMMAND-ID --instance-id "$INSTANCE" \
  --query '{status:Status,out:StandardOutputContent,err:StandardErrorContent}' \
  --output text
```

If the agent is not ready yet, `send-command` fails with
`InvalidInstanceId`. Wait a minute after `instance-status-ok` and try again;
the agent registers a little after the instance boots.

### 7. The GitHub OIDC role

So Actions can reach AWS with no stored key.

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com
```

If that says the provider already exists, good — one per account is enough.

The subject claim needs care. The documented form is
`repo:OWNER/REPO:ref:refs/heads/main`, but GitHub also issues an
**immutable** form with the owner and repository ids embedded —
`repo:OWNER@1015326/REPO@1458892419:ref:refs/heads/main` — and which one
your account sends is not something you can tell by looking. Matching only
the documented one fails with `Not authorized to perform
sts:AssumeRoleWithWebIdentity`, an error that says nothing about why.

So allow both. They are two spellings of the same repository and branch,
and `StringEquals` with a list is still an exact match — no wildcards, so
no `owner*` that a similarly-named account could slip through:

```bash
export OWNER_ID=$(gh api users/${REPO%%/*} --jq .id)
export REPO_ID=$(gh api repos/$REPO --jq .id)
echo "owner $OWNER_ID, repo $REPO_ID"

cat > gh-trust.json <<JSON
{"Version":"2012-10-17","Statement":[{
 "Effect":"Allow",
 "Principal":{"Federated":"arn:aws:iam::$ACCOUNT:oidc-provider/token.actions.githubusercontent.com"},
 "Action":"sts:AssumeRoleWithWebIdentity",
 "Condition":{
  "StringEquals":{
   "token.actions.githubusercontent.com:aud":"sts.amazonaws.com",
   "token.actions.githubusercontent.com:sub":[
    "repo:$REPO:ref:refs/heads/main",
    "repo:${REPO%%/*}@$OWNER_ID/${REPO#*/}@$REPO_ID:ref:refs/heads/main"
   ]}}}]}
JSON

aws iam create-role --role-name roulette-deploy \
  --assume-role-policy-document file://gh-trust.json \
  --query 'Role.Arn' --output text
```

The condition on `sub` is the part that matters: without it, **any** GitHub
repository in the world can assume this role. Pinned to `refs/heads/main`,
a pull request from a fork cannot deploy.

If it is still refused, read what was actually presented rather than
guessing — CloudTrail records the claim verbatim:

```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=AssumeRoleWithWebIdentity \
  --max-items 1 --query 'Events[].CloudTrailEvent' --output text
```

The `userName` field is the subject claim. Put that string in the policy.

```bash
cat > deploy-policy.json <<JSON
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":"s3:PutObject","Resource":"arn:aws:s3:::$BUCKET/releases/*"},
 {"Effect":"Allow","Action":"ssm:SendCommand",
  "Resource":["arn:aws:ec2:$AWS_REGION:$ACCOUNT:instance/$INSTANCE",
              "arn:aws:ssm:$AWS_REGION::document/AWS-RunShellScript"]},
 {"Effect":"Allow","Action":["ssm:GetCommandInvocation","ssm:ListCommandInvocations"],
  "Resource":"*"}]}
JSON

aws iam put-role-policy --role-name roulette-deploy \
  --policy-name roulette-deploy --policy-document file://deploy-policy.json
```

`SendCommand` is scoped to this one instance and this one document, so a
leaked token runs this deploy and nothing else.

### 8. The GitHub settings

Repository → Settings → Secrets and variables → Actions.

**Secret** (you create it; I never see it):

| Name | Value |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::ACCOUNT:role/roulette-deploy` |

**Variables** (not secret):

| Name | Value |
|---|---|
| `AWS_REGION` | `$AWS_REGION` |
| `RELEASE_BUCKET` | `$BUCKET` |
| `INSTANCE_ID` | `$INSTANCE` |
| `DOMAIN` | `$DOMAIN` |

`INSTANCE_ID` is also the switch: the deploy job is skipped while it is
unset, so CI stays green until everything above exists.

Or from the command line:

```bash
gh secret set AWS_DEPLOY_ROLE_ARN --body "arn:aws:iam::$ACCOUNT:role/roulette-deploy"
gh variable set AWS_REGION --body "$AWS_REGION"
gh variable set RELEASE_BUCKET --body "$BUCKET"
gh variable set INSTANCE_ID --body "$INSTANCE"
gh variable set DOMAIN --body "$DOMAIN"
```

### Getting a shell, when you need one

```bash
aws ssm start-session --target "$INSTANCE"
```

Needs the Session Manager plugin installed locally. There is no other way
in, which is the point.

## What provisioning did

`provision.sh` installed nginx, PHP-FPM, MariaDB and the SSM agent, created
`/srv/roulette` with the layout in P03 section 7, generated `APP_SECRET` and
a database password into `shared/.env.local` — printing neither, because a
secret that was shown is a secret that was copied — and asked certbot for a
certificate.

It is idempotent: run it again after an Ubuntu upgrade, or to repair a box
somebody has edited by hand, and it changes only what is missing.

## The first deploy

Push to `main`. The workflow runs the four suites, builds, uploads and tells
the instance to install it.

The database is still empty at this point, and `app:upgrade-database`
refuses an empty database by design (P02 R20), so the first deploy's schema
step will say so and stop. That is expected, and it is the deploy script
working: the schema step runs before the symlink moves (R14), so a failure
there leaves the previous release serving.

Which means `current` still points at the placeholder, and the placeholder
has no `backend/`. The release is on disk, but only under its own
directory — so the one-off commands below go to the newest release rather
than to `current`:

```bash
cd "$(ls -dt /srv/roulette/releases/*/ | grep -v placeholder | head -1)backend"
pwd        # should be /srv/roulette/releases/<sha>/backend

sudo -u www-data php bin/console doctrine:schema:update --force --complete
sudo -u www-data php bin/console app:upgrade-database
sudo -u www-data php bin/console app:create-admin
```

Then re-run the workflow, and the deploy completes: the schema step finds
nothing to do, the symlink moves, and `current` becomes the release.

From the second deploy onwards none of this applies — `current` is always a
real release and the schema step is routine.

## When a release is bad

```bash
sudo bash /srv/roulette/current/deploy/rollback.sh
```

Seconds, no build, no network. Run it twice and you are back where you
started.

**It does not undo the database.** P03 R15: `app:upgrade-database` can delete
rows — F19's merge step does — and putting the old code back does not bring
them back. The dump taken immediately before that deploy is in
`/srv/roulette/backups/` and in `s3://$BUCKET/backups/`.

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
