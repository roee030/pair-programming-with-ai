# Pair Flow for JetBrains IDEs

A port of the Pair Flow VS Code extension to the IntelliJ Platform. One plugin works in IntelliJ IDEA,
WebStorm, PyCharm, GoLand, Rider and the other JetBrains IDEs, version 2025.1 or newer.

Marketplace page: <https://plugins.jetbrains.com/plugin/35829-pair-flow>

The behaviour matches the VS Code extension: describe a goal, approve the plan, then review each chunk
(at most three files) in the IDE's diff viewer before anything is written.

## How it is put together

| Part | VS Code | JetBrains |
| --- | --- | --- |
| Core logic (session machine, orchestrator, protocol, providers, path safety, saved sessions) | `src/**` in TypeScript | `core/` in Kotlin, a line-for-line port with its own tests |
| Panel UI | Webview showing `renderBody` + `media/main.js` + `media/main.css` | The **same files**, bundled by `scripts/build-jetbrains-ui.mjs` and shown in a JCEF tool window |
| Webview messages | `acquireVsCodeApi().postMessage` | A small shim that forwards the same messages through `JBCefJSQuery` |
| Diff review | `vscode.diff` | `DiffManager` with a chain of the proposed files |
| Applying edits | `WorkspaceEdit` | One `WriteCommandAction` (so a chunk is a single Undo step) |
| Settings / API keys | `pairFlow.*` settings, `SecretStorage` | Settings > Tools > Pair Flow, IDE password safe |

`core/` has no IntelliJ dependency, so it builds and tests anywhere with plain Gradle.
When you change logic in `src/`, make the same change in `core/` and keep the tests in step.

## Build and run

You need JDK 21 and Node.js 20+.

```bash
npm ci                         # at the repository root, needed to bundle the shared UI
cd jetbrains
./gradlew :core:test           # Kotlin tests for the ported logic
./gradlew :plugin:runIde       # starts a sandbox IntelliJ IDEA with the plugin installed
./gradlew :plugin:buildPlugin  # writes plugin/build/distributions/pair-flow-jetbrains-*.zip
```

Install the zip from **Settings > Plugins > ⚙ > Install Plugin from Disk…**.

If the IntelliJ download is blocked on your network, `PAIRFLOW_CORE_ONLY=1 ./gradlew :core:test`
builds and tests only the core module.

## Publishing to JetBrains Marketplace

See [docs/jetbrains-marketplace-publishing.md](../docs/jetbrains-marketplace-publishing.md). Releases after
the first one go out from the **JetBrains release** workflow when you push a `jetbrains-v<version>` tag.

## Known gaps compared with VS Code

- The panel colours are read from the IDE theme when the tool window opens; switching theme needs a reopen.
- Each "open file" click opens a new diff tab instead of replacing the previous preview.
- The JetBrains compatibility checker (`verifyPlugin`) runs only in the release workflow, because it downloads several IDEs.
