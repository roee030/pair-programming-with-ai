# Guided Pair Programming VS Code Extension

## Intent

Build a VS Code extension that makes AI coding collaborative and reviewable. The developer gives a goal, sees the proposed plan, and approves one small, explained code change at a time instead of receiving a large autonomous rewrite.

## Goals

- Keep the developer in control of every file mutation.
- Show a short plan before implementation begins.
- Produce one bounded code chunk at a time with rationale and a readable diff.
- Let the developer approve, reject, revise, or ask a question before continuing.
- Run a relevant verification command after an accepted chunk when one is available.

## Non-goals

- Building a new IDE or replacing VS Code.
- Autonomous multi-file implementation without checkpoints.
- Cloud accounts, billing, collaboration, or model hosting in the MVP.
- Supporting every AI provider in the first release.

## Anti-goals

- Hiding edits behind a generic “apply” action.
- Generating a full feature and splitting it into artificial chunks afterward.
- Allowing the model to edit the workspace before explicit approval.

## Constraints

- TypeScript VS Code extension.
- Local-first: workspace context and pending changes remain on the user's machine except for content explicitly sent to the configured model.
- Start with an OpenAI-compatible HTTP API and configurable base URL/model/API key.
- Proposed edits use structured responses and are validated before preview.
- A chunk is limited to one coherent change and a small number of files.

## Approaches

1. **VS Code extension with a webview and local orchestration — selected.** Meets developers in their existing editor, supports rich plan/diff/approval UI, and can use VS Code's native diff and workspace APIs.
2. **Terminal-first CLI.** Easier to prototype and attractive to power users, but weaker for guided visual review and less approachable for the first audience.
3. **Standalone web IDE.** Offers complete UI control but introduces repository access, synchronization, security, and adoption costs that work against the product's premise.

## Experience

The extension opens a “Pair Flow” side panel. The developer enters a goal. The assistant responds with its understanding and a short ordered plan. Nothing is changed until the plan is approved. For each step, the assistant returns an explanation and proposed file edits. The extension validates them, opens a diff preview, and offers Approve, Revise, Reject, and Ask. Approve applies only that chunk; all other actions leave the workspace unchanged. The assistant then suggests or runs a verification command with confirmation and advances only when the developer chooses to continue.

## MVP Architecture

- `extension.ts` registers commands and owns the session lifecycle.
- A session state machine enforces the phases and prevents unapproved transitions.
- An OpenAI-compatible client requests structured plans and chunks.
- A workspace adapter gathers bounded context, validates paths, previews edits, and applies approved edits.
- A webview renders the conversation, plan, current chunk, and controls.
- Unit tests cover the state machine, path/edit validation, protocol parsing, and approval boundary.

## Builder Calls

- The first release targets desktop VS Code and Node.js 20.
- API keys use VS Code SecretStorage; non-secret settings use configuration.
- Tests use Vitest; bundling uses esbuild.
- The MVP supports text-file create and replace operations, not binary files or arbitrary shell execution.
