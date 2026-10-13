# Direct Markdown list and code-fence interactions

Date: 2026-10-10. Branch: codex/workspace-citation-integrity; baseline HEAD fd5660b1f1194b081e13a2ee690078a0f6e1677c. Changes uncommitted.

## Evidence and implementation

The read-only comparison verified installed Vditor 3.11.2 JS/CSS against the published package and IR source against its upstream tag. Native IR waits for list body text after `- `; existing list items expose no editable source prefix. Native code fences were CSS decoration while their DOM marker spans were hidden. These are library limits. The project now adds `markdownInteractions.ts` at the editor-instance boundary; node_modules, dependencies and Markdown storage format are unchanged.

Empty paragraphs convert immediately on typing the space after a list marker. Only the active non-task unordered item displays an editable prefix; deleting it unwraps that item, preserving inline text, siblings and nested blocks. Lute's IR parse/serialize methods filter UI prefixes so they never become duplicate Markdown. Native key handling sees undecorated items. Empty-item exit creates a paragraph and restores its caret; a first implementation left selection on PRE/root and following text went to the first item, which the save assertion caught and the final implementation fixes.

Expanded code blocks display their native closing marker as real text, replacing the closing pseudo-element. Clicking it or pressing Down from code end reaches that text. Enter inserts an ordinary block after code; Backspace/Delete uses native format cancellation and retains code. Enter inside the code body still inserts blank lines. Added operations take native undo snapshots and synchronously publish Markdown. All listeners, observers and wrapped Lute methods are restored on unmount.

## Verification

- RED: new `python tests/path-markdown-interactions-ui.py` failed immediately after typing `- `, expected one list item and found none.
- GREEN: final direct test passed at 1440x1000 light and 1024x768 dark. Immediate creation, consecutive items, empty-item exit and exact saved typing content pass.
- Prefix deletion on the first item and a middle item with a nested child retains text and order; native undo/redo works. Reader/IR/SV switching retains four original items, no duplicated prefix, and final list Markdown equals the normalized initial fixture.
- Closing-fence click and Down/Enter exit work with an end-of-document code block. Fence Backspace removes formatting, preserves both code lines and can undo. Subsequent ordinary typing, reading/edit switching and mocked saves retain the code fence and its original content.
- Final full `PATH_UI_BASE_URL=http://localhost:5173 python tests/path-editor-ui.py` passed both viewports: existing quote/style/format-menu removal, undo/redo, table/task, SV fence deletion, rapid mode/file switching, centered column and sidebar/window resizing regressions. The earlier Down assertion now checks fence Enter as the exit.
- An initial full run parallel with the build failed the code-menu undo assertion once. Native undo-stack inspection and the subsequent complete run passed; diagnostic probes were removed, and the final clean full run passed both viewports. No underlying library change was claimed for that transient result.
- `npm run build` passed; existing large chunk warning remains. Scoped ESLint passed for markdownInteractions.ts, markdownEditing.ts and DocumentToolbar.tsx. `git diff --check` passed. No tabs/layout/Node/full-lint rerun for this change; existing EditorArea lint diagnostics retain their preceding evidence.
- Screenshots: [light list](path-direct-list-1440.png), [dark list](path-direct-list-1024.png), [light code](path-direct-markdown-1440.png), [dark code](path-direct-markdown-1024.png).

## Boundaries

Tests used headless installed Chrome and the user's existing Vite at localhost:5173, which remains running. All API calls were intercepted; fixtures use normalized terminal newlines. No real backend, database or directory grant/write, commit, push or deployment. Source mode, ordered/task lists and code-body newline semantics stay native. The old Down-only exit statement in the prior native-editing evidence is historical; current IR uses Down to fence, then Enter.
