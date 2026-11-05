# Contributing to Pair Flow

Thanks for helping make AI-assisted coding easier to understand and control.

## Before you start

- Search existing issues before opening a new one.
- Use an issue to agree on behavior before a large change.
- Never include API keys, private source code, prompts, or provider responses in reports.

## Development

Requirements: Node.js 20+, npm, and VS Code 1.95+.

```bash
npm ci
npm test
npm run typecheck
npm run build
```

Press `F5` in VS Code to open an Extension Development Host. Keep behavior changes covered by tests and prefer small commits with one purpose.

Before opening a pull request, run:

```bash
npm run package
```

## Pull requests

Explain the user-facing problem, the chosen behavior, tests performed, and any privacy or security impact. Screenshots are encouraged for panel changes.
