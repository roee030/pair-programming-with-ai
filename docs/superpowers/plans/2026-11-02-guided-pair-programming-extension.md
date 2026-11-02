# Guided Pair Programming Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a runnable VS Code MVP that turns a coding request into an approved plan and a sequence of small, individually approved code changes.

**Architecture:** A pure session state machine controls progression; adapters handle model calls and workspace edits; a VS Code webview presents the workflow. Proposed edits remain in memory until an explicit approval applies them through the workspace adapter.

**Tech Stack:** TypeScript, VS Code Extension API, esbuild, Vitest, OpenAI-compatible REST API

**Spec:** `docs/superpowers/specs/2026-11-02-guided-pair-programming-design.md`

## Global Constraints

- Target desktop VS Code and Node.js 20.
- Store API keys only in VS Code SecretStorage.
- Never mutate workspace files before explicit chunk approval.
- Restrict edits to text files under the active workspace root.
- Keep each proposed chunk to one coherent change and at most three files.

## Review Focus

- Malformed or non-JSON model output must become a recoverable UI error.
- Absolute paths and `..` traversal must be rejected before preview or apply.
- Stale edits against files changed after proposal must not overwrite newer content.
- Reloading or closing the panel must not silently apply a pending chunk.
- Missing configuration or network failure must preserve the current session state.

---

### Task 1: Extension shell and session state machine

**Files:**
- Create: `package.json`, `tsconfig.json`, `esbuild.mjs`, `src/extension.ts`
- Create: `src/session/types.ts`, `src/session/sessionMachine.ts`
- Test: `src/session/sessionMachine.test.ts`

**Interfaces:**
- Produces: `PairSession`, `PairSessionState`, and `dispatchSession(state, event): PairSessionState`.

- [ ] Write failing tests for initial, planning, awaiting-plan-approval, awaiting-chunk-approval, applying, completed, and recoverable-error transitions; verify no apply transition exists without `APPROVE_CHUNK`.
- [ ] Run `npm test -- sessionMachine` and confirm failure.
- [ ] Add project tooling, extension activation, commands, session types, and the minimal pure reducer.
- [ ] Run the focused tests and `npm run typecheck`; confirm success.

### Task 2: Structured model protocol and client

**Files:**
- Create: `src/model/protocol.ts`, `src/model/openAICompatibleClient.ts`
- Test: `src/model/protocol.test.ts`, `src/model/openAICompatibleClient.test.ts`

**Interfaces:**
- Consumes: session goal and approved plan state.
- Produces: `parsePlanResponse`, `parseChunkResponse`, `requestPlan`, and `requestChunk` with typed results.

- [ ] Write failing tests for valid responses, malformed JSON, missing fields, more than three edited files, and network/configuration errors.
- [ ] Run focused tests and confirm failure.
- [ ] Implement strict parsers and an injectable-fetch OpenAI-compatible client.
- [ ] Run focused tests and typecheck; confirm success.

### Task 3: Safe workspace proposal and approval boundary

**Files:**
- Create: `src/workspace/workspaceAdapter.ts`, `src/workspace/editValidation.ts`
- Test: `src/workspace/editValidation.test.ts`, `src/workspace/workspaceAdapter.test.ts`

**Interfaces:**
- Consumes: typed proposed edits.
- Produces: `validateProposedEdits(root, edits)`, `preparePreview(edits)`, and `applyApprovedEdits(preview)`.

- [ ] Write failing tests for valid relative paths, traversal, absolute paths, binary-like content, stale source hashes, create/replace operations, and zero writes before approval.
- [ ] Run focused tests and confirm failure.
- [ ] Implement validation, source hashing, in-memory previews, native diff documents, and atomic `WorkspaceEdit` application.
- [ ] Run focused tests and typecheck; confirm success.

### Task 4: Guided webview experience

**Files:**
- Create: `src/ui/PairFlowPanel.ts`, `src/ui/webviewHtml.ts`, `media/main.css`, `media/main.js`
- Test: `src/ui/webviewHtml.test.ts`, `src/ui/panelMessages.test.ts`

**Interfaces:**
- Consumes: session state and extension callbacks.
- Produces: typed UI messages for submit, approve plan, approve/revise/reject/ask chunk, and continue.

- [ ] Write failing tests for escaped rendering, CSP nonce, phase-specific controls, and rejecting unknown messages.
- [ ] Run focused tests and confirm failure.
- [ ] Implement an accessible VS Code-native panel with goal input, plan checklist, explanation, chunk summary, diff action, and explicit decision buttons.
- [ ] Wire UI messages to the state machine without direct filesystem access.
- [ ] Run UI tests, typecheck, and bundle; confirm success.

### Task 5: Configuration, secrets, end-to-end orchestration, and documentation

**Files:**
- Create: `src/config/configuration.ts`, `src/orchestrator/pairOrchestrator.ts`
- Modify: `src/extension.ts`, `package.json`
- Create: `README.md`, `.vscodeignore`, `.gitignore`
- Test: `src/orchestrator/pairOrchestrator.test.ts`

**Interfaces:**
- Consumes: model client, workspace adapter, state machine, and panel events.
- Produces: a complete `pairFlow.start` workflow and `pairFlow.setApiKey` command.

- [ ] Write failing orchestration tests proving plan approval and chunk approval gates, preserved state on failure, and no write after reject/revise/close.
- [ ] Run focused tests and confirm failure.
- [ ] Implement SecretStorage configuration and wire the complete flow.
- [ ] Document installation, configuration, privacy behavior, workflow, and limitations.
- [ ] Run `npm test`, `npm run typecheck`, and `npm run package`; confirm all succeed.

### Task 6: Manual VS Code smoke test

**Files:**
- Modify only if smoke testing reveals a defect.

**Interfaces:**
- Consumes: packaged extension.
- Produces: verified install/start/plan/chunk/diff/approve/reject behavior.

- [ ] Install the generated VSIX into an Extension Development Host or clean VS Code profile.
- [ ] Exercise missing-key, valid-plan, rejected-chunk, approved-chunk, stale-file, and reload scenarios.
- [ ] Re-run the full automated verification after any repair.
