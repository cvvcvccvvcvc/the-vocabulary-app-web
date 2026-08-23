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

Session cookies are HTTP-only, secure in production, and backed by hashed random tokens in SQLite.

## Persistence

SQLite is intentionally used for the first single-server deployment. The database is private to the API process and runs in WAL mode. SQL migrations are ordered files in `migrations/`.

The schema stores generic language-neutral names. It does not preserve native application's legacy English/Russian field names.

## Deployment

The first production topology is one RuVDS instance:

```text
Internet -> Caddy :443 -> Vocabulary API
                            |-- static client build
                            +-- SQLite volume
```

No database port is exposed. Only HTTPS and restricted administrative access are public.

