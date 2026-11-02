# Pair Flow Side Panel Code Story Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the editor-tab UI with a persistent, visually rich side panel that tells the code-change story and drives native multi-file diff navigation.

**Architecture:** Register a VS Code Activity Bar webview view and a read-only proposed-content provider. The view owns selected-file navigation while the orchestrator owns workflow state and approval boundaries.

**Tech Stack:** TypeScript, VS Code Extension API, webview HTML/CSS/JS, Vitest

**Spec:** `docs/superpowers/specs/2026-11-02-side-panel-code-story-design.md`

## Global Constraints

- Approval remains mandatory for every chunk.
- File navigation never writes workspace content.
- Loading and error phases must always explain what is happening.
- Use native VS Code diff editors for review.

## Review Focus

- Approve-plan double clicks must not launch duplicate requests.
- Slow or hung provider calls must show progress and terminate with a recoverable timeout.
- New files must open in diff review without a missing-file error.
- Previous/next navigation must stay within the proposed file list.
- Closing and reopening the side panel must preserve the active session UI.

---

### Task 1: Request lifecycle and visible progress

- [ ] Add failing tests for duplicate action suppression and provider timeout.
- [ ] Implement action locking, timeout propagation, and descriptive busy state.
- [ ] Verify focused and full tests.

### Task 2: Persistent Activity Bar view

- [ ] Add failing message/render tests for sidebar state and navigation commands.
- [ ] Replace `WebviewPanel` with `WebviewViewProvider` and contribute the Pair Flow Activity Bar container and icon.
- [ ] Verify typecheck and activation bundle.

### Task 3: Native multi-file diff navigation

- [ ] Add failing tests for bounded previous/next selection and proposed URI generation.
- [ ] Add a read-only proposed-content provider, automatic first-file reveal, clickable file rows, and previous/next editor navigation.
- [ ] Verify all file states, including new files.

### Task 4: Code story visual redesign

- [ ] Add render tests for entry point, connected chapters, code-clock loader, file metrics, and fixed chunk actions.
- [ ] Implement the new semantic HTML, icon system, typography scale, color states, responsive sidebar CSS, elapsed timer, and reduced-motion behavior.
- [ ] Package and install the VSIX in an isolated smoke profile.

### Task 5: Release

- [ ] Update README and changelog, bump version, run the full verification gate, commit, and push.
- [ ] Publish a GitHub release and wait for green public CI.
