# Changelog

All notable changes to Pair Flow are documented here.

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
