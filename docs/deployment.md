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
| <code>TELEGRAM_CLIENT_SECRET</code> | Telegram OIDC client secret. |
| <code>TELEGRAM_POLLING_REPLICAS</code> | Optional. <code>0</code> keeps polling disabled; <code>1</code> starts one poller and its private proxy. Never use more than one. |
| <code>NOFOX_SUBSCRIPTION_URL</code> | Required only for polling. Direct secret HTTPS subscription URL used by the private Mihomo proxy, not a browser redirect or app deep link. |

Development may additionally set <code>DEV_TELEGRAM_USER_ID</code>. Production refuses that login path.

## Telegram command menu

After deploying, register the command webhook from a machine that can reach Telegram's Bot API. The script below reads the bot token without echoing it or putting it in shell history. It configures only message updates and discards commands queued before registration.

```bash
read -s VOCABULARY_TELEGRAM_TOKEN
echo
VOCABULARY_WEBHOOK_SECRET=$(printf 'vocabulary-webhook:%s' "$VOCABULARY_TELEGRAM_TOKEN" | openssl dgst -sha256 | awk '{print $2}')
curl --fail --silent --show-error \
  --form "url=https://vocabulary.194-87-238-188.sslip.io/api/telegram/webhook" \
  --form "secret_token=$VOCABULARY_WEBHOOK_SECRET" \
  --form 'allowed_updates=["message"]' \
  --form 'drop_pending_updates=true' \
  "https://api.telegram.org/bot${VOCABULARY_TELEGRAM_TOKEN}/setWebhook"
unset VOCABULARY_TELEGRAM_TOKEN VOCABULARY_WEBHOOK_SECRET
```

The webhook replies to `/start` and `/help` with buttons for Learn, Add Word, and Words. Register it again whenever the bot token changes.

### Optional long polling through NoFox

Use this mode only when Telegram cannot deliver webhooks to the production network. The main application remains direct. A separate poller sends only Telegram Bot API requests through a private Mihomo service; neither service publishes a host port.

Rotate any subscription URL that has been disclosed before activation. Add the new direct HTTPS subscription URL and enable exactly one replica in the server `.env`:

```dotenv
TELEGRAM_POLLING_REPLICAS=1
NOFOX_SUBSCRIPTION_URL=https://subscription.example/secret
```

Deploy without changing the normal release command:

```bash
cd /root/TheVocabularyApp/the-vocabulary-app-web
docker compose --env-file .env -f deploy/compose.yml up -d --build --remove-orphans
docker compose --env-file .env -f deploy/compose.yml ps
docker compose --env-file .env -f deploy/compose.yml logs --tail=60 telegram-proxy telegram-poller
```

Before changing Telegram delivery mode, verify that the poller can reach the Bot API through the proxy. This prints Telegram's bot metadata, not the token:

```bash
docker compose --env-file .env -f deploy/compose.yml exec -T telegram-poller \
  node -e 'fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`).then(async r => console.log(r.status, await r.text()))'
```

An HTTP 200 response with <code>"ok":true</code> confirms the proxy path. The poller will report a webhook conflict until webhook delivery is disabled. From a trusted machine that can reach Telegram, remove the webhook and discard only the stale commands accumulated while delivery was broken:

```bash
read -s VOCABULARY_TELEGRAM_TOKEN
echo
curl --fail --silent --show-error \
  --form 'drop_pending_updates=true' \
  "https://api.telegram.org/bot${VOCABULARY_TELEGRAM_TOKEN}/deleteWebhook"
unset VOCABULARY_TELEGRAM_TOKEN
```

Send `/start` in the bot's private chat, then confirm that the poller logs contain no new error. Do not run multiple polling replicas: Telegram update offsets require a single consumer.

### Roll back to the webhook

First set <code>TELEGRAM_POLLING_REPLICAS=0</code> in the server `.env`, then apply Compose and confirm that the optional services are gone:

```bash
cd /root/TheVocabularyApp/the-vocabulary-app-web
docker compose --env-file .env -f deploy/compose.yml up -d --remove-orphans
docker compose --env-file .env -f deploy/compose.yml ps
```

Finally register the webhook again with the existing script above from a machine that can reach Telegram. No database or application rollback is required. On the current Russian network the restored webhook remains subject to the same Telegram reachability restriction; this procedure restores the previous architecture, not the blocked network path.

## Operational notes

- Do not expose the SQLite volume or application port directly.
- Keep enough free disk space for a second Docker image during builds.
- Back up the SQLite database off-server.
- Inspect failed releases in GitHub Actions before retrying manually.
