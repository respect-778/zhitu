# Wiki-link editing navigation

## Scope and observed gap

- User example: `[[Obsidian 日常归档 Skill]]` should open the corresponding learning note.
- Existing parser, `[[` picker, stable bindings and reading-mode anchors already implemented the data model. The first edit only added Ctrl/Cmd+click hit-testing; user review correctly found that completed links still looked like raw text, ordinary clicks did not navigate, and picker arrow selection was overwritten by the next caret/keyup refresh.
- Reused existing indexing and `onSelectFile`; no second link storage format, Agent change or Markdown rewrite was introduced.

## Implementation

- repo path: src/pages/Path/utils/wikiLinkInteraction.ts — mark completed Wiki syntax as visual-only internal links while retaining the raw `[[...]]` text in Vditor's DOM/serializer; exclude code examples and resolve via persisted target IDs.
- repo path: src/pages/Path/components/EditorArea/index.tsx — ordinary click opens a rendered internal link; Ctrl/Cmd remains compatible. Picker refresh preserves the active index for an unchanged candidate set, navigation keys stop before Vditor handles them, active items stay scrolled into view and Enter inserts the selected target.
- repo path: src/pages/Path/components/EditorArea/index.module.less — Obsidian-like linked-title presentation with a real 27px hit box; missing/ambiguous links use a muted dotted treatment.
- repo path: src/pages/Path/components/Sidebar/panels/MarkdownGuidePanel/MarkdownGuidePanel.tsx — separate web links from searchable “笔记关联（双链）”; document names, paths, aliases, navigation and removing the brackets.
- repo path: tests/path-wiki-link-interaction.test.cjs
- repo path: tests/path-wikilink-navigation-ui.py
- repo path: tests/path-wikilink-live-edit-ui.py

## Verified checks

- `node --test tests/path-wiki-link-interaction.test.cjs tests/path-graph.test.cjs`: 11/11 passed.
- Scoped ESLint for the three implementation files: no diagnostics.
- `npm run build`: TypeScript and production Vite build passed; existing large-chunk advisory remains.
- `tests/path-wikilink-navigation-ui.py`: passed with actual Vditor IR DOM and isolated API fixtures. Reading single click, editing ordinary/Ctrl/Meta click, path alias, inline-code exclusion, missing/duplicate targets, persisted target after renaming and searchable help all passed. No page errors.
- `tests/path-wikilink-live-edit-ui.py`: first reproduced both user symptoms, then passed. It verifies one visible resolved link with a non-zero hit box, ordinary-click navigation, unchanged source Markdown after decoration, persistent ArrowDown/ArrowUp selection and Enter insertion of the selected note. Screenshot: `wiki-live-link-1440.png`.
- Existing `tests/path-wiki-foundation-ui.py` passed at 1440×1000 and 1024×768, including initialization, picker, links, graph, permissions and pointer dragging. Existing `tests/path-markdown-interactions-ui.py` passed at both viewports for native list/quote/fence editing.
- `git diff --check -- src/pages/Path/components/EditorArea/index.tsx`: passed; only existing LF/CRLF notice.

The first rename browser attempt timed out because the test used an exact accessible menu name that included an icon. Reusing the existing test's exact-text menu selector fixed the driver; no production menu change was made.

## Boundaries

- API writes were intercepted. No real notes, database, Windows backup directory or AI settings were modified by the tests.
- The browser check runs Chrome on Windows; the Meta compatibility path was exercised there, not on physical macOS hardware. Source-mode/heading-specific gestures are not independently claimed by the new live-edit test.
- Local `agent-workflow` CLI is not installed; evidence and task/checkpoint records are maintained directly, without downloading a package.
- Existing unrelated working-tree changes are preserved; no commit or push requested or performed.

## 2026-10-30 external-link audit

- Real Vditor IR inspection reproduced the reported mismatch: the completed `[[...]]` link resolved to `rgb(46, 89, 149)`, while a normal `[OpenAI API](https://...)` link inherited the browser/Vditor blue (`rgb(0, 0, 255)`, and could appear purple after visiting) and had no external-link glyph.
- Editing and reading views now use the same theme token, `--wiki-link`, for both Wiki links and ordinary Markdown links. `:visited` is explicitly kept on that token, so browsing history cannot turn a link purple.
- Only `http`, `https`, `mailto` and `tel` destinations receive the 12px current-color external-link glyph. Wiki links, relative note links and page anchors do not receive a misleading external marker.
- `tests/path-wikilink-live-edit-ui.py` passed in light editing, reading and dark editing modes, including exact color equality and glyph mask/size checks. Existing editor and direct Markdown interaction checks passed at 1440x1000 and 1024x768; node tests 11/11, scoped ESLint, production build and whitespace checks also passed.
