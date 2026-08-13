# Contributing

Thanks for improving the Sandboxed code generation cookbook.

## Before you start

Use an issue for a focused bug report or feature proposal. Report suspected vulnerabilities through [SECURITY.md](SECURITY.md) instead.

Read [the architecture](docs/architecture.md), [lifecycle and errors](docs/lifecycle-and-errors.md), and [security boundaries](docs/security-boundaries.md) before changing Sandbox identity, source projection, process execution, previews, browser access, replacement, or cleanup behavior.

## Local setup

Use a supported Node.js release and install the locked dependency graph:

```bash
npm ci
npm run check
```

The default suite does not require Blaxel credentials or create cloud resources.

## Live checks

Runtime changes should exercise the affected opt-in check in a temporary Blaxel Sandbox:

```bash
npm run test:live:quickstart
npm run test:live:image
npm run test:live
```

Run only the suites for which the documented prerequisites are configured. Record the revision, region, command, assertions, and cleanup result without including credentials, preview tokens, private source, or private image references. Delete only test-owned resources.

## Pull requests

Keep each pull request focused. Explain the user-facing change, its verification, and any compatibility or security impact.

Do not commit credentials, local environment files, private source, machine-specific paths, generated build output, test-owned cloud state, or dependency directories.
