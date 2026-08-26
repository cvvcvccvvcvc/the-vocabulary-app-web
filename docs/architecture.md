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

The normal website uses Telegram's OIDC authorization-code flow with PKCE. Its short-lived
state is also bound to the initiating browser with a signed HTTP-only cookie, so a callback
cannot create a session in a different browser. Both paths normalize the verified Telegram
user ID into one internal user record and one server-side session.

Telegram bot commands arrive through a minimal Cloudflare Worker because Telegram cannot reliably connect to the RuVDS network directly. The Worker accepts only the fixed webhook path, verifies Telegram's secret header, forwards the JSON body to the fixed Vocabulary HTTPS endpoint, and returns the endpoint response without interpreting it.

The application independently verifies the same secret and answers `/start` or `/help` with a Telegram `sendPhoto` method, a caption, and Mini App navigation buttons. The photo is referenced by its Telegram `file_id`; when it is not configured, the application falls back to `sendMessage`. Telegram executes the method from the webhook response, so neither RuVDS nor the Worker makes an outbound Bot API request. The webhook secret is deterministically derived from the bot token and is supplied to Cloudflare as a Worker secret and to Telegram during webhook registration.

The same Worker has an hourly Cron Trigger for opt-in reminders. It authenticates to a
fixed internal endpoint on The Vocabulary App, claims at most 20 reminder jobs, calls Telegram's
`sendMessage`, and reports delivery results. SQLite remains authoritative for eligibility,
milestone consumption, and deduplication. Claims are recorded before delivery, so an
ambiguous network failure can omit a non-critical reminder but cannot send it twice.

The Worker stores the bot token and a separate reminder dispatch secret as encrypted
Cloudflare secrets. It keeps no user data or reminder state. Missing reminder configuration
disables the internal endpoints and hides the client setting without affecting `/start`,
`/help`, or authentication.

Session cookies are HTTP-only, secure in production, and backed by hashed random tokens in SQLite.

## Owner analytics

The website serves a standalone `/analytics` route outside the normal Vocabulary
navigation. Its API requires an authenticated session and independently matches the
session's internal user to `ANALYTICS_OWNER_TELEGRAM_USER_ID`. A missing configuration or
a different authenticated user receives the same not-found response.

Analytics are calculated on demand from existing canonical records; no tracking-event
store is maintained:

- registrations use `users.created_at`;
- active DAU, WAU, and MAU count distinct users in `review_operations`;
- answer volume uses `review_operations.created_at`;
- added-word volume uses `words.created_at`, including words deleted later;
- current card counts exclude soft-deleted words.

DAU uses calendar days, WAU calendar weeks beginning Monday, and MAU calendar months.
Periods are grouped in `Asia/Yekaterinburg`; stored timestamps remain UTC. The page never
returns word text or meanings.

## Persistence

SQLite is intentionally used for the first single-server deployment. The database is private to the API process and runs in WAL mode. SQL migrations are ordered files in `migrations/`.

The schema stores generic language-neutral names. It does not preserve native application's legacy English/Russian field names. Language and appearance preferences live in `user_settings` so they follow the authenticated profile across devices. Telegram reminder opt-in and milestone events use separate tables because delivery state is operational rather than a language setting.

## Deployment

The first production topology is one RuVDS instance plus a stateless webhook relay:

```text
Telegram -------> Cloudflare Worker ------> Vocabulary webhook
Worker Cron ----> reminder dispatch API --> SQLite
Worker Cron ------------------------------> Telegram Bot API
Internet ---------------------------------> Vocabulary API
                                             |-- static client build
                                             +-- SQLite volume
```

No database port is exposed. Only HTTPS and restricted administrative access are public.
The Worker has encrypted transport secrets but no database or user storage.
