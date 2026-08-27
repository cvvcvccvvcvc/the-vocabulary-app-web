# Architecture

The Vocabulary App is a single TypeScript project with four explicit layers:

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

The in-memory `ReviewSession` is owned above the navigation tabs. It keeps ID-only Scheduled and Free queues together with the current card, direction, reveal state, and in-flight review phase, so visiting another tab does not restart review. After a swipe it projects the answer only far enough to choose and display the next local card; it does not publish projected progress as canonical application data. Word additions and deletions reconcile only affected IDs, while newly due cards remain ahead of the next Free Review selection. The session is reset at bootstrap and logout and is deliberately not written to browser storage; a full reload starts again from canonical server data.

The server remains authoritative. The client submits semantic actions such as `correct` or `wrong`; it does not submit an arbitrary new level. After the initial presentation, one review-transition request atomically applies the answer and records the next card's direction. The next card remains readable while that request is in flight, but it cannot be answered until the server confirms the transition. An ambiguous retry reuses the same operation ID and exact payload, so the server returns the stored response without applying either mutation twice. Exact retry responses are retained for seven days; the permanent event ID still rejects a later replay after that response expires. Optimistic edit versions advance only for content changes, so review progress from another device does not invalidate an open edit draft.

## User progress

The authenticated `GET /api/statistics` endpoint calculates one user's progress on demand
from canonical `words` and `review_events` rows. Every query is scoped by the session's
internal user ID. No cached rollup, background worker, or new service is introduced.

The client supplies the device's current IANA time-zone identifier. The server validates it,
keeps timestamps in UTC, and performs calendar-day grouping in that requested zone. The
response contains 84 contiguous days, including zero-activity days, along with the current
streak and current active-word total. Each day contains review and addition volume. Streak
calculation is a pure domain operation; the server supplies already-normalized local day
identifiers.

`review_events` is the permanent source for accepted answers. It stores compact semantic
facts and authoritative outcomes rather than copies of complete cards. Both Scheduled
Review and Free Review answers count. Current vocabulary excludes soft-deleted words, while
historical additions continue to use their original creation timestamps.

## Authentication

The Telegram Mini App sends raw `initData` to the server. The server validates its HMAC signature and freshness before accepting the Telegram user identity.

The normal website uses Telegram's OIDC authorization-code flow with PKCE. Its short-lived
state is also bound to the initiating browser with a signed HTTP-only cookie, so a callback
cannot create a session in a different browser. Both paths normalize the verified Telegram
user ID into one internal user record and one server-side session.

Telegram bot commands arrive through a minimal Cloudflare Worker because Telegram cannot reliably connect to the RuVDS network directly. The Worker accepts only the fixed webhook path, verifies Telegram's secret header, forwards the JSON body to The Vocabulary App's fixed HTTPS endpoint, and returns the endpoint response without interpreting it.

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

Session cookies are HTTP-only, secure in production, and backed by hashed random tokens in
SQLite. Expired session rows are removed opportunistically when a new session is created.

## Owner analytics

The website serves a standalone `/analytics` route outside the normal navigation in
The Vocabulary App. Its API requires an authenticated session and independently matches the
session's internal user to `ANALYTICS_OWNER_TELEGRAM_USER_ID`. A missing configuration or
a different authenticated user receives the same not-found response.

Analytics are calculated on demand from existing canonical records; no analytics-specific
tracking store is maintained:

- registrations use `users.created_at`;
- active DAU, WAU, and MAU count distinct users in `review_events`;
- answer volume uses `review_events.created_at`;
- added-word volume uses `words.created_at`, including words deleted later;
- current card counts exclude soft-deleted words.

DAU uses calendar days, WAU calendar weeks beginning Monday, and MAU calendar months.
Periods are grouped in `Asia/Yekaterinburg`; stored timestamps remain UTC. The page never
returns word text or meanings.

## Persistence

SQLite is intentionally used for the first single-server deployment. The database is private to the API process and runs in WAL mode. SQL migrations are ordered files in `migrations/`.

The schema stores generic language-neutral names. It does not preserve native application's legacy English/Russian field names. Language and appearance preferences live in `user_settings` so they follow the authenticated profile across devices. Telegram reminder opt-in and milestone events use separate tables because delivery state is operational rather than a language setting.

Accepted answers are split by retention purpose. `review_events` permanently stores the
user, card, answer, mode, direction, level transition, resulting review date, and timestamp.
`review_operation_receipts` temporarily stores the original transport request and response
needed for exact retry handling. Receipts expire after seven days and are pruned
opportunistically when another answer is accepted; permanent event IDs prevent an expired
operation from being applied again. Analytics and reminder cycles depend only on
`review_events`, so pruning receipts cannot remove learning history.

## Deployment

The first production topology is one RuVDS instance plus a stateless webhook relay:

```text
Telegram -------> Cloudflare Worker ------> The Vocabulary App webhook
Worker Cron ----> reminder dispatch API --> SQLite
Worker Cron ------------------------------> Telegram Bot API
Internet ---------------------------------> The Vocabulary App API
                                             |-- static client build
                                             +-- SQLite volume
```

No database port is exposed. Only HTTPS and restricted administrative access are public.
The Worker has encrypted transport secrets but no database or user storage.
