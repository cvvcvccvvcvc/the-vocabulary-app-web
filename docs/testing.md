# Testing

Validation is proportional to the affected layer:

- Domain changes require deterministic unit tests with injected clocks and seeded randomness.
- Persistence and API changes require isolated temporary SQLite tests.
- Authentication helpers require signature, expiry, and malformed-input tests.
- UI changes require a production build and focused manual checks at phone and desktop widths.
- Deployment changes require configuration validation before they reach the server.

Before a release, run:

```bash
pnpm test
pnpm typecheck
pnpm build
```

The minimum scheduling suite covers level clamping, every interval, Scheduled versus Free mutation rules, direction alternation, and Free Review cooldown behavior.

