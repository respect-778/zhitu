# Checkpoint

- Branch: `codex/learning-planning-wiki-foundation`
- Baseline: `4267a6e531ec031a31d9d604cd56ec4f2a8bde98`
- Status: frontend foundation implemented and verified; uncommitted, pending user review
- Scope guard: learning planning only; AI assistant excluded

## Implemented checkpoint

- New workspaces receive four managed folders and five managed notes; existing workspaces are not silently rebuilt.
- User-created/imported/recovered content defaults to Agent read-only; bootstrap content defaults to full management.
- Left activity bar contains mentor, knowledge graph, Agent permissions and Markdown help. Permission changes stay in the left panel and folder changes require an impact confirmation.
- Internal file moves use pointer dragging plus a non-drag “move to” menu; invalid cycles/name collisions are blocked and effective Agent-permission changes require confirmation.
- Markdown light/dark × edit/read tokens are scoped to learning planning; guide content exposes only verified interactions.
- Wiki links parse outside code, offer `[[` candidates, persist target IDs and survive target rename/move without rewriting user Markdown.
- Knowledge graph now renders only resolved Wiki links, uses bounded 2D zoom/forces and remembers settled node positions while the workspace remains mounted.

## Deliberately not claimed

- No AI assistant, model call, automatic organization or background task was added.
- Agent permissions are workspace metadata in this slice, not yet a server-enforced ACL boundary.
- Private attachment upload, old Base64 conversion, source snapshots and full content-version history require the separate backend phase; the Markdown guide labels private attachment short links as unavailable.

## 2026-10-15 graph v0.7 checkpoint

- KnowledgeGraph is now isolated from EditorArea. Distinct incoming note counts drive bounded radii; one-hop preserved nodes, softly masked background items and accent-only constant-width edges share a finite hover transition.
- Desktop/touch control boxes, icon centering, glyph-based 6px/9px spacing, cancellable anchored zoom and stable camera behavior are implemented and browser-checked.
- Graph unit/browser checks, existing workspace/navigation regressions, independent editor/Markdown regressions, final build and scoped lint passed. One editor batch-run timing failure is explicitly recorded in runs/2026-10-15-graph-v07.md.
- Changes remain uncommitted on the existing feature branch. This completes the current graph UI refinement, not the separately scoped backend/Agent phase or the unmeasured large-graph performance targets.

## 2026-10-16 entrance checkpoint

- Fixed first-entry default-zoom flash followed by the delayed instantaneous fit. The actual viewport and warmed node layout are prepared before revealing a correctly painted camera frame; visible movement belongs only to nodes.
- Added first-frame regression covering six scenarios, with independent existing Canvas checks, model tests, scoped lint and final build passing. See runs/2026-10-16-graph-entry.md.
- No AI assistant changes; existing uncommitted work preserved. No commit or push performed.

## 2026-10-24 context-menu update

- Removed the file/folder “move to” menu at the user's request. Existing pointer dragging and permission-impact confirmation remain; both viewport regressions passed with actual file and folder drags.
- No graph/editor/AI-assistant implementation changes in this menu adjustment. Related storage-warning recovery is recorded in storage-settings-status.

## 2026-10-27 Wiki editing navigation

- Existing `[[note]]` reading links and picker are retained; completed syntax now looks like an internal link in IR and ordinary click opens it. Ctrl/Cmd remains compatible. Paths/aliases and persisted target IDs are reused; examples inside code do not navigate and raw Markdown remains unchanged.
- Picker ArrowDown/ArrowUp now keeps its active option across caret/keyup refreshes, scrolls that option into view and Enter inserts the currently selected note.
- Markdown help has a separate searchable Wiki-link section using the user's exact example. Missing/ambiguous targets are not guessed or auto-created.
- Node tests (11/11), scoped lint, production build, focused live-edit/navigation checks and existing two-viewport Wiki/Markdown/editor regressions passed. Detailed evidence and boundaries: runs/2026-10-27-wikilink-navigation.md.

## 2026-10-30 external-link presentation

- Normal Markdown links and `[[...]]` now share the same light/dark `--wiki-link` color in editing and reading; visited history no longer changes normal links to purple.
- External web/mail/telephone destinations alone show a small current-color external-link glyph. Internal Wiki links, anchors and relative links remain unmarked.
- Focused browser assertions plus existing editor/Markdown regressions, unit tests, lint and build passed. No AI assistant behavior changed.

## 2026-10-30 reading layout parity

- Reading and editing now share the same body typography and heading scale. Reading remains a separate non-editable renderer, with only a subtle 8px inset and 12px compact block rhythm.
- Soft line breaks are preserved in reading paragraphs, fixing collapsed directory trees. Editor and Markdown browser regressions plus the production build passed.
