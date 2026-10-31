# Knowledge graph first-entry correction — 2026-10-16

## Reproduction and cause

- Scope: learning planning only; AI assistant/backend unchanged. Existing checks started after 4.3 seconds and missed the entrance.
- Red command: `python C:/Users/32005/.agents/skills/webapp-testing/scripts/with_server.py --server "npm run dev -- --host 127.0.0.1 --port 5175 --strictPort" --port 5175 -- python tests/path-graph-entry-ui.py --quick`.
- Six-note fixture: first visible zoom `2.201284885406494`, final zoom `1.25`; assertion `First visible graph zoom jumps before settling` failed.
- Ranked hypotheses: delayed initial fit, library automatic zoom, viewport resizing. Removing only the delayed fit left zoom constant at `2.201284885406494`: the application's 320ms delayed zero-duration fit caused the jump after exposing the library's default camera.

## Fix

- Measure the real viewport before mounting the renderer; remove the placeholder 800×600 frame and the delayed fit.
- Configure forces before rendering, with 80 initial warmup ticks. The existing force simulation then provides gentle visible settling, without random shaking or camera animation.
- Keep renderer/controls hidden during preparation. Apply the initial camera synchronously, and reveal only after a complete frame has actually been painted with it. Entrance RAF is cancelled on unmount.
- Reduced motion: 240 warmup ticks, zero visible simulation ticks. Existing tab revisits, permission changes and visibility events do not replay initialization.
- Manual restore-center and anchored wheel/button zoom remain unchanged; early input is not overwritten by a late fit.
- The [Obsidian graph documentation](https://help.obsidian.md/Plugins/Graph+view) describes center/repel/link forces, not exact entrance implementation/timing. This follows the user's reference behavior, without claiming identical proprietary internals.

## Verification

- New first-entry test passed all six scenarios: light/dark six-note graph, 40 notes at 1024px, single note, reduced motion at DPR 1.5, immediate wheel input.
- Passive entrance zoom/center stayed constant; every node remained inside the viewport. First visible frames appeared approximately 72–110ms after the recorded click start in the final fixture run, not a production performance guarantee.
- Six-node settling distance: about 3.7 world pixels. Reduced-motion movement: 0 pixels. Existing graph revisit preserved zoom. Early wheel input monotonically increased 125% to about 150% without resetting.
- Independent existing `tests/path-graph-ui.py` run against isolated port 5176 passed light/dark desktop, touch and reduced-motion/DPR configurations: hover colors/masks, labels, constant-width edges, control geometry, wheel anchoring/bounds and visibility stability.
- Graph model tests: 6/6 passed. Scoped ESLint and final `npm run build` passed; existing large-bundle warning remains.
- Initial parallel build/lint encountered local Node allocation failures; independent reruns passed without dependency or memory-setting changes. Earlier browser attempts timed out during page startup/tab lookup and are not counted as passing; the independent final graph run passed all configurations.
- Tests intercepted APIs with synthetic workspaces. No real notes, database, local user directory or AI configuration changed. Temporary test servers exited; existing user server on port 5173 remained running.

Evidence: `graph-entry-*.json`, `graph-entry-first.png`, `graph-entry-settled.png`, and existing graph Canvas screenshots in this directory.

## Boundaries

- Changes remain uncommitted on `codex/learning-planning-wiki-foundation`.
- Large-vault performance, literal browser zoom and exact Obsidian internals are not claimed.
- Existing task records were updated directly because agent-workflow CLI was previously unavailable; no substitute CLI was downloaded.
