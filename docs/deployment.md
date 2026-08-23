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

Development may additionally set <code>DEV_TELEGRAM_USER_ID</code>. Production refuses that login path.

## Operational notes

- Do not expose the SQLite volume or application port directly.
- Keep enough free disk space for a second Docker image during builds.
- Back up the SQLite database off-server.
- Inspect failed releases in GitHub Actions before retrying manually.
