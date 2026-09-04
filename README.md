# The Vocabulary App

The Vocabulary App is a server-backed vocabulary trainer available in a browser and as a Telegram Mini App. A verified Telegram identity maps to one server-side profile across devices.

## Documentation

- [`docs/product.md`](docs/product.md) for product behavior.
- [`docs/architecture.md`](docs/architecture.md) for system boundaries and runtime flows.
- [`docs/security.md`](docs/security.md) for the user-data inventory, trust boundaries, and claims the project can safely make.
- [`docs/design.md`](docs/design.md) for durable interface decisions.
- [`docs/deployment.md`](docs/deployment.md) for the Selectel deployment, backups, and automatic releases.
- [`docs/testing.md`](docs/testing.md) for focused verification and release checks.
- [`docs/versioning.md`](docs/versioning.md) for production versioning and tags.

## Local development

Use Node.js 24 and the pnpm version declared in `package.json`. Enable Corepack if pnpm is not already available.

```bash
corepack enable
pnpm install
pnpm dev
```

In a second terminal:

```bash
pnpm dev:client
```

The API listens on `http://127.0.0.1:3000` and the Vite client on
`http://127.0.0.1:5173`. The development server exposes a local-only sign-in profile by
default. Production rejects that login path and requires Telegram credentials plus a public
HTTPS origin; configuration is documented in
[`docs/deployment.md`](docs/deployment.md#application-configuration).

## Verification

```bash
pnpm test
pnpm typecheck
pnpm build
```
