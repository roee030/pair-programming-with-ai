# Pair Flow Side Panel and Code Story Design

## Intent

Turn Pair Flow from a sparse webview tab into a persistent VS Code side-panel controller. The developer should always know what the agent is doing, how the current change connects to the goal, which file is being reviewed, and what action is required next.

## Root cause

Plan approval currently transitions to `requestingChunk`, replaces the plan UI with a nearly invisible animated line, and starts an HTTP request with no timeout or elapsed-time feedback. The webview is an editor tab rather than a persistent sidebar, and diff preview only opens the first file with no navigation model. A correct but slow request therefore appears broken.

## Chosen approach

Use a contributed Activity Bar container with a `WebviewViewProvider`. Keep the workflow and file story in this persistent panel and use native VS Code diff editors as the review surface. This follows the strongest patterns from VS Code Copilot Edits and Cursor: a changed-files working set, editor-native diffs, previous/next navigation, and automatic reveal of the next change.

Alternatives considered:

- A richer editor-tab webview offers more width but competes with code and repeats the current navigation problem.
- A custom diff renderer inside the webview offers visual control but loses native editor features and accessibility.

## Experience

- The goal is the story entry point.
- Plan steps are connected chapters with completed, active, and upcoming states.
- Every network or apply phase shows a large loader, specific activity text, elapsed time, and a stop/reset route.
- When a chunk arrives, the first file diff opens automatically in the editor.
- The panel shows all proposed files with file-type icons, line counts, selected state, and previous/next controls.
- Selecting a file or using previous/next changes the native diff editor while the panel stays open.
- The current chapter explains why the chunk exists and how it follows the story.
- Apply, revise, and reject are fixed at the bottom. Apply approves the whole current chunk only.
- After applying, the next chapter enters a visible generating state; when ready its first file opens automatically.

## Visual system

- Palette: VS Code theme surfaces plus blue `#4daafc` for active work, green `#3fb950` for approved chapters, amber `#d29922` for waiting, violet `#a78bfa` for AI activity, and red `#f85149` for rejection/error.
- Type: VS Code UI font for controls and story; editor monospace font for paths, diff metrics, timers, and code status.
- Scale: 11px metadata, 12px paths, 13px body, 15px chapter titles, 20px section titles, 26px entry-point statement.
- Memorable element: a connected vertical “code story” spine ending in a code-clock loader while the next chapter is generated.

## Safety and constraints

- No workspace mutation before chunk approval.
- Editor navigation does not imply approval.
- Proposed content is exposed through a read-only virtual document provider.
- Model requests time out with a recoverable error rather than loading forever.
- Reduced-motion users get a static loader with a live elapsed-time label.
