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

The progress suite additionally covers streak continuation through today or yesterday,
reset after a fully missed day, duplicate activity days, both review modes and answer
outcomes, authenticated user isolation, invalid time zones, the 30-day activity window,
soft-deleted vocabulary, and calendar grouping across a daylight-saving transition. Manual UI checks cover light and
dark themes, phone and desktop widths, the pre-study call to action, and Settings returning
to Progress while Progress remains the selected primary destination.
