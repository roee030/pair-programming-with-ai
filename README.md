# Pair Flow

Pair Flow is a VS Code extension for AI-assisted development with a hard human approval boundary. It explains the route, waits for plan approval, proposes one small code chunk, opens a diff, and changes files only after explicit approval.

## Install and run

1. Install the generated `pair-flow-0.1.0.vsix` from **Extensions → … → Install from VSIX**.
2. Open a project folder.
3. Run **Pair Flow: Set API Key** from the Command Palette.
4. Optionally configure `pairFlow.baseUrl` and `pairFlow.model` for any OpenAI-compatible service.
5. Run **Pair Flow: Start Session**.

For development, run `npm install`, then press F5 in VS Code. Use `npm test`, `npm run typecheck`, and `npm run package` before release.

## Safety and privacy

- Pair Flow cannot apply a model proposal until you approve that exact chunk.
- Proposed paths are restricted to the open workspace; absolute paths and traversal are rejected.
- A source hash prevents a preview from overwriting a file that changed afterward.
- The API key is stored in VS Code SecretStorage.
- Selected text project files are sent to the configured model provider as context. Pair Flow has no server of its own.

## MVP limitations

The first version replaces complete text-file contents, previews the first changed file, supports one workspace root, and does not run shell commands automatically. Revision feedback asks the model for a new proposal; rejected changes are never written.
