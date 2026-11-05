# Pair Flow Marketplace Readiness Design

## Intent

Turn the tested Pair Flow 0.4.0 extension into a trustworthy public GitHub repository and a VS Code Marketplace-ready Preview release.

## Product identity

- Product name: Pair Flow
- Extension ID: `pair-flow`
- Positioning: AI speed with explicit human approval for every chapter of work.
- Release channel: Marketplace Preview for the first public release.

## Repository presentation

The README leads with the product promise and an actual product walkthrough image, then installation, workflow, providers, privacy, configuration, troubleshooting, development, and limitations. Marketplace metadata includes a PNG icon, banner, AI/Other categories, relevant keywords, repository/homepage/issues links, license, pricing, and preview status.

Community files include CONTRIBUTING, SECURITY, code of conduct, issue forms, pull request template, and a support configuration. CI runs tests, typecheck, build, package, and verifies the VSIX on supported Node versions. Release publishing remains manual until the owner creates a Marketplace publisher and chooses an authentication method.

## Source integrity

The tested 0.4.0 implementation is the source of truth. Existing uncommitted Pair Studio experiments are preserved reversibly before integration. Generated Playwright output, local review artifacts, secrets, VSIX files, and build output are ignored. Marketing assets intended for the README are moved to a stable `docs/images` location; production-facing copy uses only Pair Flow.

## Release safety

- No API keys or credentials enter the repository or VSIX.
- `npm test`, `npm run typecheck`, `npm run build`, `npm run package`, and `vsce ls` must pass.
- The packaged file list is reviewed for accidental sources, tests, local artifacts, and secrets.
- Marketplace publication itself is not performed without the owner's Publisher ID/account action.

