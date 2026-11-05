# Pair Flow Marketplace Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a professional Pair Flow repository and a verified VS Code Marketplace Preview package.

**Architecture:** Use the tested 0.4.0 worktree as the source of truth, add presentation and release infrastructure around it, then integrate it into main while preserving local Pair Studio experiments. Keep publishing manual because Publisher credentials are owner-controlled.

**Tech Stack:** TypeScript, VS Code Extension API, Vitest, esbuild, `@vscode/vsce`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-05-marketplace-readiness-design.md`

## Global Constraints

- Public product identity is Pair Flow and extension ID is `pair-flow`.
- First Marketplace release is marked Preview.
- No credentials, API keys, local automation artifacts, or generated VSIX files are committed.
- Existing Pair Studio changes are preserved reversibly before main integration.
- Publication requires the owner's Publisher ID and account action.

## Review Focus

- Clean clone installs dependencies and produces the same VSIX.
- README image URLs render both on GitHub and Marketplace.
- Package metadata contains no placeholder publisher or broken resource URLs.
- VSIX excludes tests, local artifacts, maps, plans, and marketing source files where unnecessary.
- CI uses non-watch test commands and fails on type, build, packaging, or package-content errors.

---

### Task 1: Establish the release source of truth

**Files:**
- Modify: `.gitignore`
- Modify: `.vscodeignore`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: tested Pair Flow 0.4.0 implementation
- Produces: deterministic package scripts and VSIX inclusion rules

- [ ] Preserve the dirty main Pair Studio files in a reversible Git stash before integration.
- [ ] Add ignore rules for local Codex/Playwright/review/marketing-generated artifacts.
- [ ] Add `.vscodeignore` rules that exclude source tests, maps, plans, local assets, and development configuration from VSIX.
- [ ] Normalize scripts so `test` is non-watch and `package` runs tests, typecheck, build, and `vsce package --no-dependencies`.
- [ ] Run `npm ci`, `npm test`, and `npm run typecheck`; expect all to pass.
- [ ] Commit the release-source changes.

### Task 2: Marketplace identity and product documentation

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Create: `media/pair-flow.png`
- Create: `docs/images/pair-flow-review.png`
- Create: `docs/images/pair-flow-resume.png`
- Create: `docs/marketplace-publishing.md`

**Interfaces:**
- Consumes: stable 0.4.0 scripts and product screenshots
- Produces: Marketplace manifest and public setup documentation

- [ ] Add manifest metadata: preview, icon, banner, categories, keywords, repository, homepage, bugs, license, pricing, and extension capabilities.
- [ ] Generate a 256×256 PNG icon from the established Pair Flow visual mark and verify dimensions.
- [ ] Copy optimized walkthrough images to `docs/images` and reference them with HTTPS-compatible repository URLs.
- [ ] Rewrite README around value proposition, install, workflow, providers, privacy, settings, troubleshooting, development, and limitations.
- [ ] Add 0.4.0 release notes and a publisher-owner checklist that does not contain credentials.
- [ ] Run `npx vsce ls --tree`; verify package metadata and file inclusion.
- [ ] Commit Marketplace identity and documentation.

### Task 3: Community health and continuous integration

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`
- Create: `.github/ISSUE_TEMPLATE/config.yml`
- Create: `.github/pull_request_template.md`
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `CODE_OF_CONDUCT.md`

**Interfaces:**
- Consumes: deterministic scripts from Task 1
- Produces: public contribution and verification workflow

- [ ] Add CI for Node 20 with `npm ci`, tests, typecheck, build, package, and artifact upload.
- [ ] Add structured bug and feature forms that request VS Code version, extension version, provider, logs, and reproduction without secrets.
- [ ] Add contribution, security-reporting, conduct, and pull-request guidance.
- [ ] Validate all YAML and Markdown links locally where possible.
- [ ] Commit repository health files.

### Task 4: Release verification and main integration

**Files:**
- Verify: all tracked files
- Produce: `pair-flow-0.4.0.vsix` locally only

**Interfaces:**
- Consumes: Tasks 1–3
- Produces: clean main branch and verified Preview release candidate

- [ ] Run `npm test`, `npm run typecheck`, `npm run build`, `npm run package`, and `git diff --check`.
- [ ] Inspect VSIX contents and scan tracked/package files for likely secrets.
- [ ] Install the VSIX into an Extension Development Host or isolated extensions directory and smoke-test activation, plan, review, Stop, Resume, Accept, and Reject.
- [ ] Integrate the reviewed commits into main without dropping the saved Pair Studio experiment.
- [ ] Verify `git status`, recent history, and final VSIX checksum.
- [ ] Document the remaining owner-only Publisher creation and Marketplace upload steps.
