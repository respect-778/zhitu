# Markdown native editing and quote appearance

Date: 2026-10-10. Branch: codex/workspace-citation-integrity; HEAD fd5660b1f1194b081e13a2ee690078a0f6e1677c. Uncommitted workspace.

## Cause and change

The prior structural source overlay intercepted quote/list/table clicks and all textarea keydowns. Its border/outline produced the user's rectangular field. Removed the overlay; preserved link marker reveal. Native Vditor commands remain registered behind the hidden toolbar, and DocumentToolbar exposes cancel current format, insert after block, and IR/SV mode switching. Selection is restored before commands; current DOM format overrides debounced toolbar highlight state. Reader/menu boundaries take undo snapshots, and host keyboard events capture native mutations that do not emit input.

Quotes use the same LESS mixin in ByteMD and Vditor: neutral theme background, 10px/16px padding, 4px radius, normal text, no border. SV uses the existing container-based centered content column. No editor dependency or backend/data schema changed.

## Verification

- Before fix: `python tests/path-editor-ui.py` failed at the quote-click assertion: expected 0 Markdown-source textboxes, actual 1.
- Final: test run through webapp-testing `with_server.py`, Vite isolated at 127.0.0.1:5175, passed 1440x1000 light and 1024x768 dark. API requests mocked; no real directory granted.
- Covered native quote/list empty-item Enter exit; code Enter keeps newlines, Down leaves it. All exposed removal cases (quote, multiline code, heading, bold, italic, strike, inline code, link, ordered/unordered/task list) preserve text and undo. Quote redo succeeds. Insert-after produces plain text outside code.
- Both themes compare computed quote border/background/text/padding/radius across reading/editing. No textarea appears on structural clicks. Existing readonly, syntax reveal, centered column and sidebar/window resizing checks retained.
- Native table editing and task toggling preserve surrounding content. Native SV exposes editable markers; three Backspaces at opening fence remove paired fences, then language deletion retains both code lines. Rapid SV file switches and reader/IR switches retain final input. Mocked PUT retains quote/table/task/plain/source edits and leaves second note unchanged. No pageerror.
- Existing `tests/path-tabs-ui.py` passed at both viewports, including restored tabs without motion, animated add/close, close-all menu and content retention.
- Final `npm run build` passed. Existing large chunk warning remains. `npx eslint .../markdownEditing.ts .../DocumentToolbar.tsx` and `git diff --check` passed. EditorArea scoped lint retains its known two errors/two warnings; no new diagnostics. No full lint, Node or independent layout script rerun.
- Screenshots reviewed: [light reader](path-editor-1440.png), [dark editor](path-editor-centered-1024.png), [dark source](path-editor-source-1024.png). These are isolated fixtures, not user documents.

## Limits

Code blocks follow Vditor's native behavior; double Enter does not exit them. Use Down at the end or the menu's continue-input action. Direct raw markers are editable through native SV; IR keeps its native visual markers. Format cancellation addresses the nearest active format rather than flattening an entire document. Vite stopped after verification. No commit, push, deployment, real database or user-folder write.
