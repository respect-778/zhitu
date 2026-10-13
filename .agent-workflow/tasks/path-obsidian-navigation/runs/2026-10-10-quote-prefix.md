# Editable quote prefixes

Date: 2026-10-10. Branch: codex/workspace-citation-integrity; baseline HEAD fd5660b1f1194b081e13a2ee690078a0f6e1677c. Changes uncommitted.

The gray blocks remain Markdown quotes. The preceding project adapter handled list prefixes and code fences but had no quote-prefix handler, so clicking a quote could not reveal `>`. The new quote assertion reproduced this before the fix.

The active quote now displays a real editable `>` span beside the clicked paragraph or child block, including quoted code and long quotes. Backspace/Delete on that marker unwraps only the current quote layer, retaining original inline text, lists, code and nested quotes. Added transactions use the native undo stack. Instance-level Lute filtering removes quote and list display markers from parsing/serialization; selection changes and cleanup remove inactive markers. The dependency package and neutral quote appearance are unchanged.

## Verification

- RED: `python tests/path-markdown-interactions-ui.py` failed the new visible quote-marker assertion; actual marker was absent.
- GREEN: final direct-interaction script passed at 1440x1000 light and 1024x768 dark. Checks include first/second paragraph markers and vertical alignment, outer-layer removal preserving bold/code/list/inner quote, inner-layer removal preserving outer quote, undo/redo, quoted-code click, reader/IR/SV and rapid file switching, plus prior list/fence regressions.
- Saved Markdown retains quote depth, quoted code fences, list items and outside text without extra prefixes. Lute's `>>` and `> >` normalization represent the same nested quote; the assertion checks either form.
- Full `PATH_UI_BASE_URL=http://localhost:5173 python tests/path-editor-ui.py` passed both viewports, retaining formatting removal, undo/redo, native quote/table/task operations, source editing, centered layout and mocked persistence. Editor assertions check quote paragraph text directly; reader assertions remain unchanged.
- `npm run build` passed (existing large-chunk warning). Scoped ESLint passed for markdownInteractions.ts, markdownEditing.ts and DocumentToolbar.tsx. Diff formatting check passed. No tabs/layout/Node/full-lint rerun was needed for this editor interaction; previous diagnostics retain their dates.
- Inspected screenshots: [light quote](path-direct-quote-1440.png), [dark quote](path-direct-quote-1024.png). Marker appears beside the clicked code block without a rectangular editing overlay; quote/code content and centered layout remain intact.

Tests used headless installed Chrome, isolated fixtures and mocked API calls against the user's existing localhost:5173 Vite, which remains running. No real database/directory writes, commit, push or deployment.
