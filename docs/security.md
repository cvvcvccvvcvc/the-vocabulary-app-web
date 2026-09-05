# Security and user data

This document records the security and data boundary that is verifiable from the repository.
It is engineering documentation, not a legal privacy policy and not proof of the live host's
configuration. Runtime topology and secret-handling procedures are owned by
[`deployment.md`](deployment.md).

## User data handled by the application

| Data | Source and purpose | Persistence |
| --- | --- | --- |
| Telegram identity | Verified Telegram user ID, display name, optional username, and optional profile-photo URL identify the account and render its profile. | `users` |
| Vocabulary | Learning-language text, one to eight ordered meanings, optional comment, timestamps, scheduling state, and answer counters provide the trainer. | `words` |
| Profile settings | Learning language, known language, and theme keep the experience consistent across devices. | `user_settings` |
| Review history | Answer, mode, direction, level transition, next-review date, and timestamp support idempotency, progress, analytics, and reminders. Complete card text is not copied into an event. | `review_events` |
| Sessions and browser login | Hashed session tokens and short-lived OIDC flow state authenticate later requests. Raw session tokens are persisted only in the client cookie. | `sessions`, `auth_flows` |
| Reminder state | Opt-in, milestone, claim, and delivery result prevent duplicate Telegram reminders. | `telegram_reminder_settings`, `telegram_reminder_events` |
| Retry receipts | The exact review request and response make ambiguous retries idempotent. Receipts expire after seven days; the permanent event ID still prevents replay. | `review_operation_receipts` |

The schema and current column definitions remain authoritative in `migrations/`; this table
describes why the categories exist rather than copying the schema.

## Trust and access boundaries

- A Telegram Mini App sends raw `initData`. The server verifies its signature and freshness
  before using the embedded identity; client-side `initDataUnsafe` is never trusted.
- Browser sign-in uses Telegram OIDC authorization code with PKCE. A signed HTTP-only cookie
  binds the short-lived state to the initiating browser before the server creates a session.
- Session cookies are HTTP-only and use `Secure` in production. The database stores only a
  hash of each random session token.
- The server is canonical. Every vocabulary, settings, progress, session, and reminder query
  is scoped by the authenticated internal user ID. The owner analytics endpoint separately
  checks the configured owner Telegram ID and returns no card text or meanings.
- The public Telegram webhook and the internal reminder endpoints use separate secrets. The
  Cloudflare Worker stores transport secrets but no user records or reminder state.
- Production traffic terminates at Caddy over HTTPS. The application and SQLite port are not
  exposed publicly.

## Telegram and browser capabilities

The application asks Telegram for permission to send private messages only when the user
enables reminders. It does not request a phone number, contacts, geolocation, camera,
microphone, biometrics, or clipboard contents. The production web origin also denies camera,
microphone, and geolocation through its `Permissions-Policy` header.

The bot responds only to `/start` and `/help`; other messages are not stored or forwarded by
the application. Contact Support opens Telegram's direct-message surface and does not submit
application data automatically. The repository contains no third-party advertising or
product-analytics SDK.

## Retention and deletion

- Deleting a word hides it from the current collection but retains the soft-deleted record,
  including its text, in SQLite. Historical review events and the original creation timestamp
  also remain so progress and aggregate counts do not change retroactively.
- Expired session, login-flow, and retry-receipt records are pruned opportunistically by the
  server. Review events are retained as learning history.
- Daily SQLite snapshots contain the same persisted user-data categories and are uploaded to
  Selectel S3. The repository does not define the bucket's remote retention or lifecycle.
- The product does not currently provide self-service deletion of the complete account and
  its related data.

## Claims the project must not make yet

- Do not claim that the application stores no personal data: it stores the categories above.
- Do not claim end-to-end encryption. The repository does not implement it.
- Do not claim that user data is encrypted at rest with a separate key. That requirement is
  not evidenced by application code or the tracked deployment configuration.
- Do not claim that account deletion is available. There is no user-facing deletion flow or
  documented operator procedure for a complete erasure request.
- Do not present Telegram's default Standard Privacy Policy as a verified description of this
  application. No project-specific privacy policy is tracked here, and its live BotFather
  configuration is outside the repository.
- Do not infer live firewall, disk-encryption, bucket, Telegram, Cloudflare, or GitHub settings
  from repository files. Verify those controls in their owning systems before publishing a
  security claim.

As checked on 4 September 2026, [Telegram's Bot Platform terms](https://telegram.org/tos/bot-developers)
require an accessible, accurate privacy policy, deletion on request, and encryption at rest
with the key stored separately. Until the gaps above are closed and the live environment is
verified, public copy should describe concrete data and permission boundaries rather than
promise that the service is "secure."
