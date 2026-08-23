# RuVDS deployment

Deployment is intentionally deferred until the existing server's operating system, RAM, free disk, public IPv4, and occupied ports are known.

## Required configuration

The production process reads these environment variables from the server configuration. Real values are never committed.

| Variable | Purpose |
| --- | --- |
| `NODE_ENV=production` | Enables production security behavior. |
| `HOST` | API bind address; normally `0.0.0.0` inside a container. |
| `PORT` | Internal API port; defaults to `3000`. |
| `APP_ORIGIN` | Final public HTTPS origin. No domain is chosen yet. |
| `DATABASE_PATH` | Persistent SQLite path. |
| `SESSION_SECRET` | High-entropy application secret. |
| `TELEGRAM_BOT_ID` | Telegram OIDC client ID. |
| `TELEGRAM_BOT_TOKEN` | Mini App init-data validation secret. |
| `TELEGRAM_CLIENT_SECRET` | Telegram OIDC client secret. |

Development may additionally set `DEV_TELEGRAM_USER_ID`. This enables a local-only sign-in route and is refused when `NODE_ENV=production`.

## Production checklist

1. Confirm public IPv4 and open TCP ports 80/443.
2. Choose a real domain and point its A record at the server.
3. Configure the same HTTPS origin and callback URL in BotFather.
4. Install Caddy and the application runtime, or Docker when memory permits.
5. Store secrets outside Git with owner-only permissions.
6. Persist SQLite outside the release directory.
7. Enable daily application-aware database backup plus an off-server copy.
8. Limit logs and monitor free disk space.
9. Deploy from the connected GitHub repository only after tests pass.

