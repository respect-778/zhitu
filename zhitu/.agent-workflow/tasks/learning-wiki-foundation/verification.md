# Verification

## Planned checks

- `npm run build`
- 定向 ESLint（仅本任务改动文件）
- 既有 `path-layout-ui.py`、`path-tabs-ui.py`、`path-editor-ui.py`、`path-markdown-interactions-ui.py`
- 新增权限、说明面板和初始化数据测试
- 1440×1000、1024×768、窄侧栏 239/240px 与明暗主题截图/断言
- 不访问真实 AI、不给真实工作区写测试数据

## Current status

Frontend foundation verified on 2026-10-13. The branch is uncommitted and has not been pushed.

| Check | Result |
|---|---|
| Production build | `npm run build` passed; existing large-chunk warning remains |
| Scoped lint | Changed TypeScript/TSX files passed targeted ESLint with zero diagnostics |
| Storage/concurrency regression | 21/21 Node tests passed |
| Existing Path browser regressions | `path-layout-ui.py`, `path-tabs-ui.py`, `path-editor-ui.py`, `path-markdown-interactions-ui.py` passed at 1440×1000 and 1024×768 |
| New Wiki foundation browser regression | `path-wiki-foundation-ui.py` passed at both viewports, including light/dark themes |
| Initialization | Mocked empty workspace persisted exactly four bootstrap folders and five bootstrap files with Agent manage permission |
| Permissions | Single file, folder impact confirmation, inherited denial, long-name tooltip, and move-induced effective-permission confirmation passed |
| Links and graph | `[[` picker, reading navigation, stable binding across rename/move, true-edge count, bounded zoom and no tag-generated edge passed |
| Drag | No native `draggable`; pointer overlay/drop and one atomic workspace write passed |
| Formatting | `git diff --check` passed (only line-ending notices) |

Evidence screenshots are under `runs/wiki-panels-1440.png` and `runs/wiki-panels-1024.png`.

Not verified and not represented as complete: server-enforced ACL, private attachments/Base64 migration, source snapshots, complete revision history, real Agent tools, or any model-driven organization.

## 2026-10-15 graph v0.7

- `node --test tests/path-graph.test.cjs tests/workspace-save-queue.test.cjs`: 11/11 passed.
- `tests/path-graph-ui.py`: passed on light/dark desktop, touch layout, DPR 1.5 and reduced motion; assertions inspect actual Canvas drawing, finite transitions, masks, glyph gaps, constant line widths, control geometry, zoom anchoring/bounds and camera stability.
- `tests/path-wiki-foundation-ui.py`, `tests/path-layout-ui.py`, `tests/path-tabs-ui.py`, `tests/path-editor-ui.py`, `tests/path-markdown-interactions-ui.py`: passed at their two configured viewports. The editor script had one sequential-run timing failure, then passed independently without editor logic changes; details remain in the evidence record.
- Final `npm run build`, scoped ESLint and tracked-source whitespace checks passed. Existing bundle-size and LF/CRLF notices remain.
- Detailed commands, reproduction measurements, limitations and screenshot names: [graph v0.7 evidence](runs/2026-10-15-graph-v07.md).
- UI tests intercepted workspace writes. No real user database, directory or AI configuration was modified.

## 2026-10-16 first visible frame

- `tests/path-graph-entry-ui.py`: six scenarios passed; initial visible camera does not zoom/pan, normal nodes settle, reduced-motion nodes remain stable, early wheel input is retained, and tab revisits preserve zoom.
- `tests/path-graph-ui.py`: independent run passed all existing light/dark, touch, DPR/reduced-motion checks.
- Graph model tests 6/6, scoped ESLint, final production build and source whitespace checks passed. Existing bundle-size warning remains.
- Original red measurements, final frame JSON/screenshots and earlier failed infrastructure/harness attempts are documented in [first-entry evidence](runs/2026-10-16-graph-entry.md).

## 2026-10-27 Wiki editing navigation

- `tests/path-wiki-link-interaction.test.cjs` plus existing graph unit tests: 11/11 passed.
- `tests/path-wikilink-navigation-ui.py`: reading and editing single click, Ctrl/Meta compatibility, path aliases, code exclusion, missing/ambiguous notices, rename-stable IDs and searchable Wiki help passed with mocked workspace writes.
- `tests/path-wikilink-live-edit-ui.py`: visible/non-zero link UI, ordinary-click navigation, raw-Markdown preservation, stable ArrowDown/ArrowUp selection and Enter insertion passed. Visual evidence: `runs/wiki-live-link-1440.png`.
- Scoped ESLint, production build and EditorArea whitespace check passed. Existing large-chunk and LF/CRLF advisories remain.
- Existing Wiki-foundation, direct Markdown-interaction and editor browser regressions passed at 1440×1000 and 1024×768.
- Exact scope, implementation and test-driver correction: [navigation evidence](runs/2026-10-27-wikilink-navigation.md).

## 2026-10-30 external Markdown links

- Browser audit first reproduced ordinary Vditor links using the browser default instead of `--wiki-link`; visited links could therefore appear purple and no external-link glyph was present.
- Focused live-edit regression now passes for edit/read and light/dark: ordinary Markdown links exactly match internal Wiki-link color, visited state stays blue, external protocols show a 12px glyph, and internal/relative links do not.
- Graph/Wiki unit tests 11/11, scoped ESLint, production build, editor layout and direct Markdown interaction regressions passed. Details are appended to [navigation evidence](runs/2026-10-27-wikilink-navigation.md).

## 2026-10-30 reading/editing typography parity

- Real browser measurements now keep reading and IR editing at the same 16px font size, 24px line box and heading scale. Reading mode only adds an 8px inset on each side and compacts block spacing from 16px to 12px.
- Reading paragraphs use `pre-wrap`, matching Vditor IR, so soft-line directory trees retain their line structure instead of collapsing into one paragraph.
- `tests/path-editor-ui.py` passed at 1440x1000 and 1024x768 with geometry, typography, compact-spacing and four-line soft-break assertions. Direct Markdown interactions passed at both viewports; the production build passed. Evidence: `path-obsidian-navigation/runs/path-reader-aligned-*.png`.
