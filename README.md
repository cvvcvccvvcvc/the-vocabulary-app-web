# The Vocabulary App

The Vocabulary App is a server-backed vocabulary trainer available in a browser and as a Telegram Mini App. A single Telegram identity maps to one server-side profile across devices.

The project is under initial development. See:

- [`docs/product.md`](docs/product.md) for product behavior.
- [`docs/architecture.md`](docs/architecture.md) for system boundaries.
- [`docs/deployment.md`](docs/deployment.md) for the RuVDS deployment and automatic releases.
- [`docs/testing.md`](docs/testing.md) for validation policy.

## Local commands

```bash
pnpm install
pnpm dev          # API on http://127.0.0.1:3000
pnpm dev:client   # UI on http://127.0.0.1:5173
pnpm test
pnpm typecheck
pnpm build
```

The development server can expose a local-only sign-in button. Production requires Telegram credentials and a public HTTPS origin; required variables are documented in [`docs/deployment.md`](docs/deployment.md).
