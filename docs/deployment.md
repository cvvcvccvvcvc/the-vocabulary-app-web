# RuVDS deployment

Production runs on <code>194.87.238.188</code> from:

~~~text
/root/TheVocabularyApp/the-vocabulary-app-web
~~~

Caddy terminates HTTPS for <code>vocabulary.194-87-238-188.sslip.io</code>, the application runs in Docker Compose, and SQLite lives in the <code>vocabulary_data</code> Docker volume. The real <code>.env</code> exists only in the server checkout and is never committed.

## Manual update

Use this when automatic deployment has not been configured or needs to be retried manually:

~~~bash
cd /root/TheVocabularyApp/the-vocabulary-app-web
git pull --ff-only origin main
docker compose --env-file .env -f deploy/compose.yml up -d --build --remove-orphans
docker compose --env-file .env -f deploy/compose.yml ps
~~~

Database migrations run automatically when the new application container starts.

## Automatic deployment

<code>.github/workflows/deploy.yml</code> runs for every push to <code>main</code>:

1. Install locked dependencies.
2. Run tests, type checking, and the production build.
3. Connect to RuVDS over SSH.
4. Fast-forward the server checkout and rebuild Docker Compose.
5. Confirm that the public <code>/api/config</code> endpoint responds successfully.

Deployments are serialized so two pushes cannot update production at the same time. When deployment secrets are absent, verification still runs and the deployment steps are skipped.

### One-time SSH setup

Create a dedicated key on a trusted local computer:

~~~bash
ssh-keygen -t ed25519 -f ./vocabulary_deploy_key -N '' -C github-actions-vocabulary
cat ./vocabulary_deploy_key.pub | ssh root@194.87.238.188 \
  'umask 077; mkdir -p ~/.ssh; cat >> ~/.ssh/authorized_keys'
ssh-keyscan -H 194.87.238.188 2>/dev/null > ./vocabulary_known_hosts
~~~

Before trusting the scanned host key, compare its fingerprint with the server:

~~~bash
ssh-keygen -lf ./vocabulary_known_hosts
ssh root@194.87.238.188 'ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub'
~~~

The fingerprints must match.

Create the following secrets in the GitHub <code>production</code> environment:

| Secret | Value |
| --- | --- |
| <code>DEPLOY_SSH_KEY</code> | Complete contents of <code>vocabulary_deploy_key</code>, including its header and footer. |
| <code>DEPLOY_KNOWN_HOSTS</code> | Complete contents of <code>vocabulary_known_hosts</code>. |

GitHub path: **Repository Settings → Environments → production → Environment secrets**.

After creating the secrets, open **Actions → Verify and deploy → Run workflow** once. Later pushes to <code>main</code> deploy automatically.

If deployment reports <code>Host key verification failed</code>, regenerate <code>vocabulary_known_hosts</code> with the command above and replace the complete <code>DEPLOY_KNOWN_HOSTS</code> secret. Do not paste the fingerprint printed by <code>ssh-keygen -lf</code>; GitHub needs the original <code>ssh-keyscan</code> lines.

Keep <code>vocabulary_deploy_key</code> private. It grants SSH access as <code>root</code>; replace it and remove the old public key from <code>authorized_keys</code> if the private key or GitHub repository is compromised.

## Application configuration

The existing server <code>.env</code> must define:

| Variable | Purpose |
| --- | --- |
| <code>APP_DOMAIN</code> | Public host used by Caddy and <code>APP_ORIGIN</code>. |
| <code>SESSION_SECRET</code> | High-entropy application secret. |
| <code>TELEGRAM_BOT_ID</code> | Telegram OIDC client ID. |
| <code>TELEGRAM_BOT_TOKEN</code> | Mini App init-data validation secret. |
| <code>TELEGRAM_START_PHOTO_FILE_ID</code> | Optional Telegram <code>file_id</code> for the image shown by <code>/start</code> and <code>/help</code>. Without it, the bot sends the text menu. |
| <code>TELEGRAM_CLIENT_SECRET</code> | Telegram OIDC client secret. |
| <code>TELEGRAM_REMINDER_DISPATCH_SECRET</code> | Optional high-entropy secret shared only with the Cloudflare Worker. When omitted, reminder dispatch and its client setting are disabled. |
| <code>ANALYTICS_OWNER_TELEGRAM_USER_ID</code> | Optional numeric Telegram ID allowed to open the website's <code>/analytics</code> page. When omitted, analytics are unavailable. |

Development may additionally set <code>DEV_TELEGRAM_USER_ID</code>. Production refuses that login path.

After setting `ANALYTICS_OWNER_TELEGRAM_USER_ID`, sign in to the normal website with that
Telegram account and open `/analytics` directly. The page is deliberately absent from the
normal application navigation. Its URL is not the security boundary; the API repeats the
owner check for every analytics request.

## Telegram bot integration

Telegram cannot reliably deliver webhooks directly to the RuVDS network. A small Cloudflare Worker therefore relays the request to the existing webhook for The Vocabulary App and returns its response to Telegram. The webhook path keeps no user data and authenticates with a derived secret rather than the bot token. Both the Worker and the application verify the same Telegram webhook secret.

The same Worker also runs hourly to deliver opt-in Scheduled Review reminders. That path
requires the bot token and a separate dispatch secret in Cloudflare, but keeps all user and
delivery state in the server's SQLite database.

### Deploy the relay

Authenticate Wrangler once on a trusted computer, then deploy the tracked Worker configuration. The free <code>workers.dev</code> route is sufficient for this low-volume webhook.

```bash
cd /path/to/Vocabulary
pnpm dlx wrangler@4.125.0 login
pnpm dlx wrangler@4.125.0 deploy \
  --config deploy/telegram-webhook-relay/wrangler.jsonc
```

Wrangler prints a URL such as <code>https://vocabulary-telegram-relay.example.workers.dev</code>. Keep that URL for the verification and webhook-registration steps.

The relay secret is the existing deterministic webhook secret, not the bot token. Read the token without echoing it, derive the secret locally, and upload only the derived value:

```bash
read -s VOCABULARY_TELEGRAM_TOKEN
echo
VOCABULARY_WEBHOOK_SECRET=$(printf 'vocabulary-webhook:%s' "$VOCABULARY_TELEGRAM_TOKEN" | openssl dgst -sha256 | awk '{print $2}')
printf '%s' "$VOCABULARY_WEBHOOK_SECRET" | \
  pnpm dlx wrangler@4.125.0 secret put TELEGRAM_WEBHOOK_SECRET \
    --config deploy/telegram-webhook-relay/wrangler.jsonc
```

Reminder delivery additionally requires the bot token and the same independent dispatch
secret that will later be placed in the server's real `.env`. Upload both as Cloudflare
secrets; never add either value to `wrangler.jsonc`:

```bash
read -s VOCABULARY_TELEGRAM_TOKEN
echo
read -s VOCABULARY_REMINDER_DISPATCH_SECRET
echo
printf '%s' "$VOCABULARY_TELEGRAM_TOKEN" | \
  pnpm dlx wrangler@4.125.0 secret put TELEGRAM_BOT_TOKEN \
    --config deploy/telegram-webhook-relay/wrangler.jsonc
printf '%s' "$VOCABULARY_REMINDER_DISPATCH_SECRET" | \
  pnpm dlx wrangler@4.125.0 secret put TELEGRAM_REMINDER_DISPATCH_SECRET \
    --config deploy/telegram-webhook-relay/wrangler.jsonc
```

Keep `VOCABULARY_REMINDER_DISPATCH_SECRET` available until the matching
`TELEGRAM_REMINDER_DISPATCH_SECRET` entry has been added to the server's real `.env`.

Before changing Telegram, make one harmless relay request. A <code>204</code> response proves that Cloudflare can reach the production webhook and that both secret checks agree:

```bash
read -r VOCABULARY_RELAY_URL
curl --fail --silent --show-error --output /dev/null \
  --write-out 'relay_http=%{http_code}\n' \
  --header 'content-type: application/json' \
  --header "x-telegram-bot-api-secret-token: $VOCABULARY_WEBHOOK_SECRET" \
  --data '{}' \
  "${VOCABULARY_RELAY_URL%/}/telegram"
```

Expected output:

```text
relay_http=204
```

### Upload the start menu photo

Telegram stores the start image and returns a bot-specific <code>file_id</code>. Upload the
tracked source image once from a trusted computer that can reach Telegram. The command sends
the image to the specified private chat and prints only the environment entry to add to the
server <code>.env</code>:

```bash
cd /path/to/Vocabulary
read -s VOCABULARY_TELEGRAM_TOKEN
echo
read -r VOCABULARY_TELEGRAM_CHAT_ID
curl -4 --http1.1 --fail --silent --show-error \
  --form "chat_id=${VOCABULARY_TELEGRAM_CHAT_ID}" \
  --form "photo=@deploy/assets/telegram-start.png;type=image/png" \
  "https://api.telegram.org/bot${VOCABULARY_TELEGRAM_TOKEN}/sendPhoto" | \
  python3 -c '
import json
import sys

response = json.load(sys.stdin)
photos = response.get("result", {}).get("photo", [])
file_id = photos[-1].get("file_id") if photos else None
if response.get("ok") is not True or not file_id:
    raise SystemExit(response.get("description", "Telegram did not return a photo file_id"))
print(f"TELEGRAM_START_PHOTO_FILE_ID={file_id}")
  '
unset VOCABULARY_TELEGRAM_TOKEN VOCABULARY_TELEGRAM_CHAT_ID
```

Add the printed line to the server <code>.env</code> and recreate the application container.
Removing the entry and recreating the container safely restores the original text-only menu.
The image itself is not read from disk at runtime; the tracked file is the source for this
one-time Telegram upload.

### Register the relayed webhook

Register the Worker URL from a machine that can reach Telegram's Bot API. This configures only message updates and discards commands queued before registration:

```bash
curl --fail --silent --show-error \
  --form "url=${VOCABULARY_RELAY_URL%/}/telegram" \
  --form "secret_token=$VOCABULARY_WEBHOOK_SECRET" \
  --form 'allowed_updates=["message"]' \
  --form 'drop_pending_updates=true' \
  "https://api.telegram.org/bot${VOCABULARY_TELEGRAM_TOKEN}/setWebhook"
curl --fail --silent --show-error \
  "https://api.telegram.org/bot${VOCABULARY_TELEGRAM_TOKEN}/getWebhookInfo"
unset VOCABULARY_TELEGRAM_TOKEN VOCABULARY_WEBHOOK_SECRET VOCABULARY_RELAY_URL
```

The webhook replies to `/start` and `/help` with buttons for Learn, Add Word, and Words. Register it again whenever the bot token or Worker URL changes. Update the Cloudflare secret before registering a webhook with a new bot token.

If a Worker release fails, redeploy the last known-good Git commit before changing the Telegram webhook. The application endpoint and database are independent of the relay deployment.

### Release reminders safely

The application and Worker are deployed separately. Use this phased rollout:

1. Merge `dev` into `main`. The server, client, and migration deploy automatically, while
   reminders remain hidden because the server dispatch secret is absent.
2. Upload `TELEGRAM_BOT_TOKEN` and `TELEGRAM_REMINDER_DISPATCH_SECRET` to Cloudflare.
3. Deploy the Worker from the exact commit now on `main`; this adds the hourly Cron Trigger
   without changing the existing webhook URL.
4. Add the same dispatch secret to the server's real `.env` as
   `TELEGRAM_REMINDER_DISPATCH_SECRET`, then recreate the application container.
5. Confirm `/api/config` reports `telegramRemindersAvailable: true`, inspect the next Cron
   event in Cloudflare, and enable reminders on a test account from the Telegram Mini App.

For rollback, removing the server dispatch secret and recreating the application disables
the feature and hides its setting. A Worker-only problem can be handled by redeploying the
previous Worker version. Neither rollback requires changing the Telegram webhook URL.

## Operational notes

- Do not expose the SQLite volume or application port directly.
- Keep enough free disk space for a second Docker image during builds.
- Back up the SQLite database off-server.
- Inspect failed releases in GitHub Actions before retrying manually.
- Keep the Worker deployment aligned with the exact production `main` commit.
