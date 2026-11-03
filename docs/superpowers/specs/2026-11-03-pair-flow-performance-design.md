# Pair Flow Performance Design

## Intent

Make Pair Flow feel immediate both in its panel and while preparing AI requests, without weakening approval, restart recovery, stale-edit protection, or local-only storage.

## Goals

- Stop rebuilding the complete webview for ordinary state and history changes.
- Preserve scroll position, focus, composer contents, and selected review file.
- Avoid redundant session writes while guaranteeing durable saves at important boundaries.
- Avoid rereading unchanged workspace files for every plan, chapter, and revision.
- Send a smaller, more relevant context to the model so requests start and finish faster.
- Record content-free local timings so performance regressions can be tested and diagnosed.

## Non-goals

- Streaming model output, a worker process, and timeline virtualization are deferred to a later phase.
- No cloud analytics or project-content telemetry.
- No changes to the chapter approval flow or automatic application of edits.

## Constraints

- The VS Code webview remains the UI surface and keeps VS Code theme and accessibility behavior.
- Stop, Accept, Reject, completion, and extension shutdown must not lose recoverable session state.
- Cache entries must be invalidated when files change and must never cause stale overwrite approval.
- Existing persisted session version 1 remains readable.

## Approaches considered

1. Minimal tuning: debounce persistence, cache file reads, and lazy-render history. Lowest risk, but full webview redraws and lost UI state would remain.
2. Balanced optimization (selected): incremental UI messages, coalesced persistence, cached and ranked context, and local timings. This addresses both interaction and model latency without a large architectural rewrite.
3. Maximum-performance redesign: a client-side state store, streaming, virtualized lists, and a continuously maintained context index. Potentially fastest, but too large and risky for this pass.

## Design

### Incremental panel rendering

The webview HTML shell is assigned only when the view is first resolved or when starting a truly new session. Subsequent orchestrator renders send a serializable view-model through `webview.postMessage`. The client updates status, progress, controls, current chapter, history, and session summaries in place. File selection remains its own small message.

Updates use stable entry IDs and keyed DOM nodes. Existing nodes are reused, and only changed text, attributes, or appended timeline entries are touched. The client captures and restores focus only when a changed control must be replaced; normal updates do not replace the composer. Auto-scroll occurs only when the user is already near the bottom.

The current server-rendered HTML functions remain useful for the initial accessible markup and tests. Message parsing and HTML escaping stay at the boundary.

### Coalesced persistence

The orchestrator exposes immediate and coalesced save modes. Ordinary intermediate transitions schedule one trailing save in a short window (approximately 75–150 ms), replacing older queued snapshots with the newest snapshot. Durability boundaries—Stop, pause/timeout, Accept/apply completion, Reject, cancellation, completion, and deactivation—flush immediately.

Repository writes are serialized, and a flush method is awaited during shutdown where VS Code permits it. Tests use an injected scheduler/clock rather than real delays.

### Cached and ranked context

`WorkspaceAdapter` receives the configured `maxContextFiles` instead of relying on its internal default. It maintains a bounded in-memory cache keyed by URI plus file modification time and size. Unchanged files reuse decoded text; changed, deleted, or oversized files invalidate their entry.

Candidate ranking uses deterministic local signals:

1. Files explicitly mentioned in the goal, feedback, or approved plan.
2. Active and visible editor files.
3. Files changed during the current session and files proposed by the current chapter.
4. Direct imports or references from those files.
5. Remaining supported workspace files, with stable path ordering as a tie-breaker.

The orchestrator requests a context snapshot with these hints. A revision of the same chapter reuses the snapshot when no relevant file-change event occurred. Context continues to exclude binary, generated, dependency, hidden VCS, and oversized content. The final payload is bounded by both file count and character budget.

### Local performance timings

A lightweight timer records durations and counts only: context discovery, cache hits/misses, context assembly, model request, edit preparation, apply, persistence, and panel update. No filenames, prompts, source text, or model responses are stored. Timings are available through the extension output channel and disabled from noisy logging by default.

## Error handling and correctness

- A failed incremental message falls back to one full shell render, then resumes incremental updates.
- Cache-stat or read failures skip that candidate without failing the entire request unless no usable context can be produced.
- Persistence failures remain isolated from orchestration and are surfaced without discarding the newest pending snapshot.
- `operationVersion`, exclusive execution, source hashes, and duplicate-approval guards remain unchanged.

## Test strategy

- Verify ordinary renders do not reassign `webview.html` and preserve composer/focus/scroll state.
- Verify only changed timeline and chapter nodes update, with safe escaping.
- Verify bursts of transitions coalesce, while every durability boundary flushes immediately.
- Verify cache hits avoid reads, file changes invalidate entries, and bounds/eviction work.
- Verify ranking selects mentioned, open, changed, and imported files deterministically.
- Verify revision requests reuse valid snapshots and refresh after relevant workspace changes.
- Verify performance events contain timing metadata only and never project content.
- Run the full unit suite, typecheck, build, VSIX packaging, and an Extension Development Host smoke test.

## Follow-up phase

After measuring this pass, consider response streaming, timeline virtualization for very long sessions, background context indexing, and cancellation-aware parallel file reads.
