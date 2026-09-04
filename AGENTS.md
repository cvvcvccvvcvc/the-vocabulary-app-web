# AGENTS.md

The Vocabulary App is a server-backed vocabulary trainer that runs as a responsive web app and as a Telegram Mini App.

## Product rules

- Use the product name **The Vocabulary App**.
- One saved word is one review card.
- A card contains learning-language text, one to eight ordered meanings, and an optional comment.
- Levels are integers from 0 through 9. New cards start at level 0.
- Scheduled Review is always served before Free Review.
- Free Review never changes a card's level or next scheduled date.
- The server is the canonical store. Every user-owned query must be scoped by the authenticated internal user ID.

## Architecture rules

- `src/domain` is pure TypeScript. It must not import React, Fastify, SQLite, Telegram APIs, or browser APIs.
- `src/client` owns presentation and device-specific interaction.
- `src/server` owns authentication, persistence, authorization, and authoritative review updates.
- `src/shared` contains only transport contracts shared by client and server.
- Inject the clock and random generator into scheduling code. Do not hide `Date.now()` or unseeded randomness inside domain algorithms.
- Validate Telegram identity on the server. Never trust `initDataUnsafe` or a client-supplied Telegram user ID.
- Prefer the smallest sufficient change and native platform conventions. Do not introduce a monorepo, background queue, cache layer, or new service without a concrete need.

## Task routing

- Review selection, levels, direction, streaks, and reminder milestones: start in `src/domain`; verify in `tests/domain`.
- API, authentication, authorization, persistence, analytics, or reminder delivery: start in `src/server`; transport shapes live in `src/shared/contracts.ts`; verify in `tests/server`.
- Screens, navigation, Telegram presentation, gestures, or browser behavior: start in `src/client`; pure interaction helpers and their tests live in `src/client/lib` and `tests/client`.
- Schema changes: add an ordered migration in `migrations/`; migration execution is owned by `src/server/database.ts` and verified by `tests/server/database.test.ts`.
- Telegram webhook relay or production operations: start in `deploy/` and read `docs/deployment.md`; relay tests live in `tests/deploy`.
- User-visible behavior belongs in `docs/product.md`, system flows in `docs/architecture.md`, data and trust boundaries in `docs/security.md`, interface rationale in `docs/design.md`, and verification policy in `docs/testing.md`. Link to the owner instead of repeating it.

## Workflow

- Use `dev` for normal work. Merge `dev` into `main` only for an explicit release request; every push to `main` is automatically verified and deployed to production.
- Follow `docs/versioning.md` when preparing a production release.
- Keep `docs/` current when behavior or architecture changes.
- Add focused tests in the owning layer; use the verification routes in `docs/testing.md`.
- Never edit a real `.env` file. Document required environment variables instead.
- After each coherent change, run the relevant checks, create an atomic commit, and push the current branch. Split unrelated changes into separate commits. Skip commit or push only when checks fail or the user explicitly asks not to publish the change.
- Check `git status` immediately before every commit and never include unrelated user changes.
- Never run destructive Git operations without explicit written approval.
