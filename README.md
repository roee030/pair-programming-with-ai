<div align="center">

# Pair Flow

### AI that cannot code faster than you can understand.

[![CI](https://github.com/roee030/pair-programming-with-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/roee030/pair-programming-with-ai/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/roee030/pair-programming-with-ai?display_name=tag)](https://github.com/roee030/pair-programming-with-ai/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-6ba4d9.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.95%2B-007ACC.svg)](https://code.visualstudio.com/)

**Plan together. Review one small change. Apply only when you are ready.**

</div>

---

AI coding agents are fast. Sometimes too fast: they generate hundreds of lines, touch several files, and leave the developer reviewing code they never really owned.

Pair Flow changes the unit of collaboration. It pauses before the plan and before every code change, so you stay inside the reasoning loop instead of cleaning up afterward.

```text
Your goal
   │
   ▼
Understand and propose a plan
   │  you approve
   ▼
Explain one small code chunk
   │  you inspect the diff
   ▼
Apply / Ask or revise / Reject
   │
   └──────── repeat, one understood change at a time
```

## The contract

- **No hidden edits.** Model output stays in memory until you approve it.
- **No giant hand-off.** Each chunk is one coherent change across at most three files.
- **No escaping the workspace.** Absolute paths and path traversal are rejected.
- **No stale overwrites.** Source hashes stop a preview from replacing a file that changed afterward.
- **No mystery key storage.** API keys live in VS Code SecretStorage.
- **No mandatory backend.** Connect any OpenAI-compatible API endpoint.

## Try it

Download the latest VSIX from [GitHub Releases](https://github.com/roee030/pair-programming-with-ai/releases), then:

1. Open VS Code → Extensions → `…` → **Install from VSIX**.
2. Open a disposable project folder for your first test.
3. Run **Pair Flow: Set API Key** from the Command Palette.
4. Optionally set `pairFlow.baseUrl` and `pairFlow.model` in Settings.
5. Run **Pair Flow: Start Session**.
6. Ask for one real change and inspect every decision boundary.

Or install from the command line:

```powershell
code --install-extension .\pair-flow-0.2.0.vsix
```

## A good first prompt

> Add input validation to the signup handler. Explain the approach first, then keep every proposed change small enough for me to understand without scrolling.

Pair Flow returns an ordered plan. After plan approval it prepares only the first chunk, explains why it exists, and opens the current and proposed code side by side.

## Build from source

Requirements: Node.js 20+ and VS Code 1.95+.

```powershell
git clone https://github.com/roee030/pair-programming-with-ai.git
cd pair-programming-with-ai
npm install
npm test
npm run typecheck
npm run package
```

The packaged extension is written to `pair-flow-0.2.0.vsix`. Press `F5` in VS Code to run the extension in an Extension Development Host while developing.

## AI providers

Choose `pairFlow.provider` in VS Code Settings. Pair Flow supports each provider through its native API:

| Provider | Authentication | Default endpoint |
| --- | --- | --- |
| OpenAI | API key | `api.openai.com/v1` |
| Anthropic | API key | `api.anthropic.com/v1` |
| Google Gemini | API key | `generativelanguage.googleapis.com/v1beta` |
| OpenRouter | API key | `openrouter.ai/api/v1` |
| Ollama | None | `localhost:11434` |

Set `pairFlow.model` when you want a different model or when your Ollama installation does not contain the default local model. Use `pairFlow.baseUrl` for proxies, self-hosted gateways, or a remote Ollama instance.

## What is tested

The automated suite currently protects the highest-risk boundaries:

- plan approval is required before chunk generation;
- chunk approval is required before file mutation;
- reject and revise never write the pending proposal;
- malformed model responses fail safely;
- unsafe paths and binary-like content are rejected;
- unknown webview messages are ignored.

Run the complete gate with:

```powershell
npm run package
```

## Privacy

Pair Flow has no hosted service. To create plans and chunks, selected text files from the open workspace are sent directly to the model endpoint you configure. Do not use a provider that is not approved for your codebase. Shell commands are never executed automatically in this release.

## Status

This is an early public preview. The current release supports one workspace root, whole-file text proposals, and diff preview for the first changed file. The next milestones are VS Code Extension Host integration tests, multi-file diff navigation, selective context controls, and Marketplace publishing.

Found a rough edge? [Open an issue](https://github.com/roee030/pair-programming-with-ai/issues/new) with the smallest reproduction you can share.

## Contributing

Small, reviewable pull requests fit the project philosophy best. Start with an issue, keep behavior changes covered by tests, and run `npm run package` before opening a PR.

## License

[MIT](LICENSE) © 2026 Pair Flow contributors
