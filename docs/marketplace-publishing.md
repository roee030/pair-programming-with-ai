# Publishing Pair Flow to the VS Code Marketplace

## Owner setup

1. Sign in to the Visual Studio Marketplace publisher management page.
2. Create or claim the Publisher ID used by `package.json` (`pair-flow` by default).
3. If that ID is unavailable, change only the `publisher` field before the first release. The Marketplace extension ID becomes `<publisher>.pair-flow` permanently.
4. Prefer Microsoft Entra ID for automated publishing. Global Azure DevOps PATs retire on December 1, 2026.

## Release candidate

```bash
npm ci
npm run package
npx vsce ls --tree
```

Install the generated VSIX into a clean VS Code profile and smoke-test activation, provider setup, plan approval, file review, Accept, Reject, Stop, Resume, timeout, and restart recovery.

## Publish

Either upload the VSIX manually from the publisher management page or authenticate `vsce` and run:

```bash
npx vsce publish
```

The manifest marks the initial release as Preview. Remove `"preview": true` only after public feedback and integration testing justify a stable release.
