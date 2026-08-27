# Testing

Validation is proportional to the affected layer:

- Domain changes require deterministic unit tests with injected clocks and seeded randomness.
- Persistence and API changes require isolated temporary SQLite tests.
- Authentication helpers require signature, expiry, malformed-input, and browser-bound
  OIDC state tests.
- UI changes require a production build and focused manual checks at phone and desktop widths.
- Deployment changes require configuration validation before they reach the server.
- Reminder changes require milestone-boundary, opt-in, deduplication, delivery-result, and
  Worker transport tests.

Before a release, run:

```bash
pnpm test
pnpm typecheck
pnpm build
```

The minimum scheduling suite covers level clamping, every interval, Scheduled versus Free mutation rules, direction alternation, Free Review cooldown and refill behavior, and review-session continuity across navigation and vocabulary changes.

The progress suite additionally covers streak continuation through today or yesterday,
reset after a fully missed day, duplicate activity days, both review modes and answer
outcomes, authenticated user isolation, invalid time zones, the 84-day activity window,
soft-deleted vocabulary, and calendar grouping across a daylight-saving transition.
Manual UI checks cover light and dark themes, 320- and 390-pixel phone widths, desktop
width, both activity modes, tap and drag day selection, page scrolling outside the
calendar without Telegram minimizing during calendar drags, the pre-study call to action,
and Settings returning to Progress while Progress remains the selected primary
destination.

The reminder suite additionally proves that empty milestones are consumed, one completed
answer starts a new cycle, claims are at-most-once, Telegram rejection disables opt-in, and
the existing webhook relay remains unchanged.
