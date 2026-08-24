# Architecture

Vocabulary is a single TypeScript project with four explicit layers:

```text
src/client  -> src/shared <- src/server
     |                        |
     +------> src/domain <----+
                              |
                           SQLite
```

- `domain` owns pure models and review algorithms. Clock and randomness are injected.
- `client` owns React views, navigation, browser speech, and Telegram presentation integration.
- `server` owns authentication, authorization, SQLite, authoritative mutations, and static production hosting.
- `shared` owns JSON transport contracts only.

## Runtime

The browser loads the user's active vocabulary into memory. This keeps review selection immediate and preserves the Free Review invariant that scoring does not query persistence.

The server remains authoritative. The client submits semantic actions such as `correct` or `wrong`; it does not submit an arbitrary new level. The server applies the domain rule in a transaction and returns the updated word.

## Authentication

The Telegram Mini App sends raw `initData` to the server. The server validates its HMAC signature and freshness before accepting the Telegram user identity.

The normal website uses Telegram's OIDC authorization-code flow with PKCE. Both paths normalize the verified Telegram user ID into one internal user record and one server-side session.

Telegram bot commands have two interchangeable delivery modes. The default webhook endpoint verifies Telegram's secret header and answers `/start` or `/help` directly with a Mini App navigation message. When Telegram cannot reach the deployment network, an optional single-replica poller receives the same message updates through long polling and sends the same menu through the Bot API. Only the poller uses the dedicated Mihomo HTTP proxy; application, database, and website traffic remain direct. The webhook code stays deployed as the rollback path, but Telegram permits only one delivery mode to be active at a time.

The webhook secret is deterministically derived from the bot token and is only supplied to Telegram during webhook registration. The polling worker keeps the latest update offset in memory and confirms processed updates in its next `getUpdates` call. A crash between sending a reply and confirming its update can therefore produce a duplicate menu, but does not lose the command.

Session cookies are HTTP-only, secure in production, and backed by hashed random tokens in SQLite.

## Persistence

SQLite is intentionally used for the first single-server deployment. The database is private to the API process and runs in WAL mode. SQL migrations are ordered files in `migrations/`.

The schema stores generic language-neutral names. It does not preserve native application's legacy English/Russian field names. Language and appearance preferences live in `user_settings` so they follow the authenticated profile across devices.

## Deployment

The first production topology is one RuVDS instance:

```text
Internet -> Caddy :443 -> Vocabulary API
                            |-- static client build
                            +-- SQLite volume
```

No database port is exposed. Only HTTPS and restricted administrative access are public.
