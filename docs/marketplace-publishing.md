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

## Automated releases

The **VS Code release** workflow (`.github/workflows/vscode-release.yml`) runs when a `v<version>` tag is pushed.
It runs the tests, packages the extension, publishes it, and attaches the `.vsix` to a GitHub release.

1. Create a Personal Access Token in Azure DevOps (<https://dev.azure.com> > User settings > Personal access tokens):
   Organization **All accessible organizations**, scope **Marketplace > Manage**.
   Azure DevOps stops issuing global PATs on December 1, 2026, so plan to move to Microsoft Entra ID before then.
2. Save it as the repository secret `VSCE_PAT` (GitHub > Settings > Secrets and variables > Actions).
3. Bump `version` in `package.json`, add a section for it at the top of `CHANGELOG.md`, merge, then:

```bash
git tag v0.4.2
git push origin v0.4.2
```

Without `VSCE_PAT`, the workflow still builds the `.vsix` and attaches it to the release, so you can upload it by hand.
The JetBrains plugin has its own `jetbrains-v<version>` tags (see `docs/jetbrains-marketplace-publishing.md`).
