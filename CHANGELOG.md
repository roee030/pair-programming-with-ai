# Changelog

All notable changes to Pair Flow are documented here.

## Unreleased

### Fixed

- A failed action saved before a restart or upgrade (such as the old `Unexpected token '<'` error from 0.4.0) no longer comes back as the same error card. The session reopens as paused, and Resume sends a fresh request with the current version.

## 0.4.1 — 2026-11-05

### Added

- README demo GIF on the Marketplace page.
- A JetBrains version of Pair Flow now lives in `jetbrains/` (released separately on JetBrains Marketplace).
- Kotlin, Kotlin script and Java files get their own icons in the file list.

### Fixed

- A provider that answers with an HTML page (wrong base URL, proxy, captive portal) no longer pauses the flow with a raw `Unexpected token '<'` JSON error. Pair Flow now reports the status code, content type, URL, and a hint to check `pairFlow.baseUrl`.
- A base URL set to just the provider host (for example `https://openrouter.ai`) now gets the correct API path added automatically.

## 0.4.0 — 2026-11-03

### Added

- Workspace-local session persistence with automatic recovery after VS Code restarts.
- A collapsible conversation timeline and compact recent-session summaries.
- Paused sessions with Resume and Cancel actions.
- Configurable provider timeout through `pairFlow.requestTimeoutSeconds`.
- An in-panel revision composer at each chunk decision boundary.

### Fixed

- Retry now reruns the failed plan, chunk, or apply operation instead of only changing UI state.
- Provider timeouts preserve work as a resumable paused session.
- Duplicate approval clicks no longer create duplicate timeline events.

### Changed

- Increased base text, metadata, input, and control sizes for readability and accessibility.
- Stop now pauses and saves the current session instead of resetting it.

## 0.3.2 — 2026-11-02

### Added

- A visible Stop task control that aborts active provider requests and ignores late responses.

### Fixed

- Replaced invalid oversized edit ranges with each document's exact final position, preventing approved changes from appearing stuck.
- Made the code-clock loader and its orbit share the same circular geometry.
- Derived the story connector fill from actual chapter progress instead of a fixed halfway point.
- Added breathing room between approval actions and removed unnecessary bottom padding outside approval screens.

### Changed

- Plan generation now asks for three to six concise story chapters instead of long implementation essays.

## 0.3.1 — 2026-11-02

### Fixed

- Corrected the webview Content Security Policy so the complete stylesheet loads in VS Code.
- Prevented inline SVG icons from falling back to enormous browser-default dimensions.

### Changed

- Reworked the empty state around a restrained editor-style canvas and bottom prompt composer.
- Replaced the Activity Bar icon with a clean connected-flow mark.
- Removed duplicated branding and oversized decorative elements from the side panel.

## 0.3.0 — 2026-11-02

### Added

- Persistent Pair Flow Activity Bar side panel.
- Goal-to-chapter code story with connected progress states.
- Automatic native diff opening and multi-file previous/next navigation.
- File-type icons, richer typography, color-coded states, and a fixed approval dock.
- Code-clock loader with live elapsed time and reduced-motion support.
- Provider request timeout and duplicate-action protection.

### Fixed

- Approving a plan no longer appears to silently remove the button while work happens.
- New proposed files can be reviewed through virtual diff documents.

## 0.2.0 — 2026-11-02

### Added

- Native provider adapters for OpenAI, Anthropic, Google Gemini, OpenRouter, and Ollama.
- Provider-specific secure API key storage.
- Configurable provider, model, and custom base URL settings.

## 0.1.0 — 2026-11-02

### Added

- Approval-gated plan and code-chunk workflow.
- OpenAI-compatible model configuration.
- Native VS Code diff preview.
- Safe workspace path validation and stale-file protection.
- SecretStorage-backed API key handling.
- Unit tests for the session, protocol, orchestration, UI-message, and path-safety boundaries.
