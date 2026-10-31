import copy
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.environ.get("PATH_UI_BASE_URL", "http://127.0.0.1:5175")
MARKDOWN = """## Heading sample

Normal **bold sample** and *italic sample* and ~~strike sample~~ and `inline code`.

> Quote sample

- List sample
- [ ] Task sample

1. Ordered sample

[Link sample](https://example.invalid/target)

```js
const answer = 42;
console.log(answer);
```

| Column A | Column B |
| --- | --- |
| Cell A | Cell B |

---

Last paragraph.

Soft tree
├─ server/
│  └─ index.js
└─ client/
"""
COMPAT_MARKDOWN = """> tree-probe/
├── server/                # Express + MongoDB
│   └── index.js
└── client/                # React (Vite)

来源: [MERN Stack Tutorial 完整学习总结](/community/47)
---

## TSX highlight sample

```tsx
import React from "react";
export function ProductCard({ title }: { title: string }) {
  return <article className="card">{title}</article>;
}
```
"""
INITIAL = {
    "revision": 1,
    "data": {
        "files": [
            {"id": "folder", "name": "Notes", "type": "folder", "parentId": None, "order": 0},
            {"id": "note-a", "name": "Markdown sample", "type": "file", "parentId": "folder", "content": MARKDOWN, "fileType": "note", "order": 0},
            {"id": "note-b", "name": "Second note", "type": "file", "parentId": "folder", "content": "Second note content.\n", "fileType": "note", "order": 1},
            {"id": "note-c", "name": "Reading compatibility", "type": "file", "parentId": "folder", "content": COMPAT_MARKDOWN, "fileType": "note", "order": 2},
        ],
        "openTabs": ["note-a", "note-b", "note-c"],
        "activeTabId": "note-a",
        "expandedFolderIds": ["folder"],
        "activePlan": None,
        "mentorId": None,
    },
}
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
runs_dir = Path(__file__).parents[1] / ".agent-workflow" / "tasks" / "path-obsidian-navigation" / "runs"
runs_dir.mkdir(parents=True, exist_ok=True)


def assert_centered_column(editor):
    # Read both boxes in one browser task so ResizeObserver cannot move the sidebar between them.
    column, container = editor.evaluate("""element => [
        element.querySelector(':scope > p').getBoundingClientRect().toJSON(),
        element.parentElement.getBoundingClientRect().toJSON(),
    ]""")
    left_gap = column["x"] - container["x"]
    right_gap = container["x"] + container["width"] - column["x"] - column["width"]
    assert column["width"] <= 801 and abs(left_gap - right_gap) <= 1, {"column": column, "container": container}


def select_content(target, end=False, whole=False):
    target.evaluate("""(element, options) => {
        element.closest('[contenteditable]').focus();
        const range = document.createRange();
        range.selectNodeContents(element);
        if (!options.whole) range.collapse(!options.end);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
    }""", {"end": end, "whole": whole})


def editor_action(page, label):
    page.get_by_role("button", name="编辑操作", exact=True).click()
    page.get_by_role("menuitem", name=label, exact=True).click()


def quote_style(quote):
    return quote.evaluate("""element => {
        const style = getComputedStyle(element);
        return {border:style.borderLeftWidth, background:style.backgroundColor, color:style.color,
            padding:style.padding, radius:style.borderRadius};
    }""")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    try:
        for viewport in ({"width": 1440, "height": 1000}, {"width": 1024, "height": 768}):
            model = copy.deepcopy(INITIAL)
            errors = []
            writes = []
            context = browser.new_context(viewport=viewport)
            context.add_init_script("localStorage.setItem('userId','100');localStorage.setItem('token','isolated-editor-token');localStorage.setItem('username','test')")
            if viewport["width"] == 1024:
                context.add_init_script("localStorage.setItem('data-theme','dark')")

            def intercept(route):
                request = route.request
                endpoint = urlparse(request.url).path
                if endpoint.endswith("/growth/workspace"):
                    if request.method == "PUT":
                        model["data"] = copy.deepcopy(request.post_data_json["data"])
                        model["revision"] += 1
                        writes.append(copy.deepcopy(model))
                    route.fulfill(json=copy.deepcopy(model))
                elif endpoint.endswith("/user/info"):
                    route.fulfill(json={"data": {"id": "100", "username": "test", "email": "test@example.invalid", "avatar": ""}, "message": "ok"})
                else:
                    route.fulfill(json={"data": [], "list": [], "total": 0})

            context.route(f"{BASE_URL}/api/**", intercept)
            page = context.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)))
            try:
                page.goto(f"{BASE_URL}/path")
                page.wait_for_load_state("networkidle")
                editor = page.locator('.vditor-ir [contenteditable="true"]')
                expect(editor).to_be_visible(timeout=30000)
                expected_syntax_color = "rgb(133, 178, 229)" if viewport["width"] == 1024 else "rgb(46, 89, 149)"
                edit_code = editor.locator('.vditor-ir__preview code.hljs').first
                expect(edit_code).to_be_visible()
                page.wait_for_function(
                    "node => node.classList.contains('hljs') && node.querySelectorAll('span').length > 0",
                    arg=edit_code.element_handle(),
                )
                expect(editor.locator('.hljs-ln-numbers')).to_have_count(0)
                edit_code.click()
                editable_code = editor.locator(".vditor-ir__marker--pre code").first
                expect(editable_code).to_be_visible()
                page.wait_for_timeout(100)
                assert editable_code.evaluate("node => getComputedStyle(node).cursor") == "text"
                assert editable_code.locator("span").first.evaluate("node => getComputedStyle(node).cursor") == "text"
                visible_code_surfaces = editor.locator(
                    '[data-type="code-block"] .vditor-ir__marker--pre, '
                    '[data-type="code-block"] .vditor-ir__preview'
                ).evaluate_all(
                    "nodes => nodes.filter(node => { const style = getComputedStyle(node); "
                    "return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0 }).length"
                )
                assert visible_code_surfaces == 1, visible_code_surfaces
                assert editable_code.evaluate(
                    "node => node.classList.contains('hljs') && node.querySelectorAll('span').length > 0"
                )
                page.evaluate("""code => {
                    window.__pathCodeHighlightDrops = 0;
                    window.__pathCodeHighlightObserver?.disconnect();
                    window.__pathCodeHighlightObserver = new MutationObserver(() => {
                        if (!code.hasAttribute('data-path-code-highlight') || !code.querySelector('span')) {
                            window.__pathCodeHighlightDrops += 1;
                        }
                    });
                    window.__pathCodeHighlightObserver.observe(code, {
                        attributes: true,
                        childList: true,
                        subtree: true,
                    });
                }""", editable_code.element_handle())
                code_box = editable_code.bounding_box()
                assert code_box
                for step in range(1, 8):
                    target_x = code_box["x"] + code_box["width"] * 0.5
                    target_y = code_box["y"] + code_box["height"] * step / 8
                    page.mouse.move(target_x, target_y)
                    page.mouse.click(target_x, target_y)
                page.keyboard.press("ArrowUp")
                page.keyboard.press("ArrowDown")
                page.wait_for_timeout(100)
                assert page.evaluate("window.__pathCodeHighlightDrops") == 0
                active_code_block = editable_code.locator("xpath=../..").first
                assert active_code_block.locator('.vditor-ir__marker--info').evaluate("node => getComputedStyle(node).color") == expected_syntax_color
                assert active_code_block.locator('[data-type="code-block-close-marker"]').evaluate("node => getComputedStyle(node).color") == expected_syntax_color
                save_status = page.get_by_role("status", name="学习规划保存状态")
                expect(save_status).to_have_text("未配置本地文件夹")
                expect(save_status).to_have_attribute("data-save-tone", "warning")
                unconfigured_warning = page.locator('.ant-message-notice-warning').filter(has_text="未配置本地文件夹")
                # The entry toast intentionally expires after five seconds; the
                # persistent footer state remains the deterministic assertion.
                if unconfigured_warning.count():
                    expect(unconfigured_warning).to_be_visible()
                page.screenshot(path=str(runs_dir / f"path-editor-highlight-{viewport['width']}.png"), full_page=True)
                expect(unconfigured_warning).not_to_be_visible(timeout=6500)
                editor.locator("blockquote p").click()
                expect(page.get_by_role("textbox", name="Markdown 源码")).to_have_count(0)
                assert editor.locator('[data-path-quote-marker]').evaluate("node => getComputedStyle(node).color") == expected_syntax_color
                edit_quote_style = quote_style(editor.locator("blockquote"))
                assert edit_quote_style["border"] == "0px" and edit_quote_style["background"] == "rgba(0, 0, 0, 0)", edit_quote_style
                assert edit_quote_style["padding"].startswith("0px 0px 0px 20px"), edit_quote_style

                nav_box = page.get_by_test_id("path-top-navigation").bounding_box()
                tab_box = page.get_by_test_id("path-tabs").bounding_box()
                assert nav_box and tab_box and abs(nav_box["y"] - tab_box["y"]) <= 1
                assert abs(nav_box["height"] - tab_box["height"]) <= 1

                toolbar_box = page.get_by_test_id("file-toolbar-actions").bounding_box()
                breadcrumb_box = page.get_by_test_id("path-document-toolbar").bounding_box()
                assert toolbar_box and breadcrumb_box
                assert abs(toolbar_box["y"] + toolbar_box["height"] / 2 - breadcrumb_box["y"] - breadcrumb_box["height"] / 2) <= 1
                expect(page.get_by_role("button", name="切换到阅读模式")).to_be_visible()
                original_column = editor.locator("p").filter(has_text="Normal").first.bounding_box()
                assert original_column
                title_input = page.get_by_role("textbox", name="输入文件名...")
                title_box = title_input.bounding_box()
                assert title_box
                assert abs(title_box["x"] - original_column["x"]) <= 1, {
                    "title": title_box,
                    "body": original_column,
                }
                assert abs(title_box["width"] - original_column["width"]) <= 1, {
                    "title": title_box,
                    "body": original_column,
                }
                assert title_input.evaluate("node => getComputedStyle(node).textAlign") in ("left", "start")
                edit_body_style = editor.evaluate("""node => {
                    const style = getComputedStyle(node);
                    return {fontSize: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight)};
                }""")
                edit_heading_size = float(editor.locator("h2").evaluate("node => parseFloat(getComputedStyle(node).fontSize)"))
                edit_paragraph_margin = float(editor.locator("p").filter(has_text="Normal").first.evaluate("node => parseFloat(getComputedStyle(node).marginBottom)"))
                edit_soft_tree = editor.locator("p").filter(has_text="Soft tree").first
                expect(edit_soft_tree).to_be_visible()
                assert edit_soft_tree.evaluate("node => getComputedStyle(node).whiteSpace") == "pre-wrap"
                page.get_by_role("button", name="切换到阅读模式").click()
                reading_view = page.get_by_test_id("path-reading-view")
                expect(reading_view).to_be_visible()
                expect(reading_view.locator("h2").filter(has_text="Heading sample")).to_have_text("Heading sample")
                expect(reading_view.locator("strong")).to_have_text("bold sample")
                assert quote_style(reading_view.locator("blockquote")) == edit_quote_style
                reading_column = reading_view.locator(".markdown-body > p").filter(has_text="Normal").first.bounding_box()
                assert reading_column and abs(reading_column["x"] - original_column["x"] - 8) <= 1, {"edit": original_column, "read": reading_column}
                assert abs(reading_column["width"] - original_column["width"] + 16) <= 1, {"edit": original_column, "read": reading_column}
                reading_body_style = reading_view.locator(".markdown-body").evaluate("""node => {
                    const style = getComputedStyle(node);
                    return {fontSize: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight)};
                }""")
                assert reading_body_style == edit_body_style, {"edit": edit_body_style, "read": reading_body_style}
                reading_heading_size = float(reading_view.locator("h2").evaluate("node => parseFloat(getComputedStyle(node).fontSize)"))
                assert abs(reading_heading_size - edit_heading_size) <= 0.1, {"edit": edit_heading_size, "read": reading_heading_size}
                reading_paragraph_margin = float(reading_view.locator(".markdown-body > p").filter(has_text="Normal").first.evaluate("node => parseFloat(getComputedStyle(node).marginBottom)"))
                assert reading_paragraph_margin < edit_paragraph_margin, {"edit": edit_paragraph_margin, "read": reading_paragraph_margin}
                reading_soft_tree = reading_view.locator(".markdown-body > p").filter(has_text="Soft tree").first
                expect(reading_soft_tree).to_be_visible()
                assert reading_soft_tree.evaluate("node => getComputedStyle(node).whiteSpace") == "pre-wrap"
                soft_lines = reading_soft_tree.inner_text().splitlines()
                assert soft_lines == ["Soft tree", "├─ server/", "│  └─ index.js", "└─ client/"], soft_lines
                page.screenshot(path=str(runs_dir / f"path-reader-aligned-{viewport['width']}.png"), full_page=True)
                expect(page.get_by_role("button", name="编辑操作", exact=True)).to_have_count(0)
                expect(reading_view.locator('input[type="checkbox"]')).to_be_disabled()
                expect(editor).not_to_be_visible()
                expect(page.get_by_role("textbox", name="输入文件名...")).not_to_be_visible()

                # Historical notes used a lazy blockquote for directory trees and
                # placed a separator directly after their source line. Reading
                # mode must present the intended code/source semantics and run
                # syntax highlighting, without rewriting the saved Markdown.
                page.get_by_test_id("path-tabs").get_by_text("Reading compatibility", exact=True).click()
                tree_quote = reading_view.locator("blockquote").filter(has_text="tree-probe/")
                expect(tree_quote).to_have_class(re.compile(r"path-tree-block"))
                tree_quote_style = tree_quote.evaluate("""node => ({
                    background: getComputedStyle(node).backgroundColor,
                    fontFamily: getComputedStyle(node).fontFamily,
                    marker: getComputedStyle(node, '::before').content,
                })""")
                assert tree_quote_style["background"] not in ("rgba(0, 0, 0, 0)", "transparent"), tree_quote_style
                assert "mono" in tree_quote_style["fontFamily"].lower(), tree_quote_style
                assert tree_quote_style["marker"] in ("none", '""'), tree_quote_style

                source_line = reading_view.locator(".markdown-body > p").filter(has_text="来源: MERN Stack Tutorial 完整学习总结")
                expect(source_line).to_have_count(1)
                source_style = source_line.evaluate("node => ({fontSize: parseFloat(getComputedStyle(node).fontSize), fontWeight: getComputedStyle(node).fontWeight})")
                assert source_style["fontSize"] == 16 and int(source_style["fontWeight"]) <= 500, source_style
                assert reading_view.locator("h2").filter(has_text="来源: MERN Stack Tutorial 完整学习总结").count() == 0

                tsx_code = reading_view.locator("pre > code.language-tsx")
                expect(tsx_code).to_have_count(1)
                page.wait_for_function("node => node.classList.contains('hljs') && node.querySelectorAll('span').length > 0", arg=tsx_code.element_handle())
                expect(reading_view.locator('.hljs-ln-numbers')).to_have_count(0)
                tsx_pre = tsx_code.locator("xpath=..").first
                expect(tsx_pre).to_have_attribute("data-language", "TypeScript-JSX")
                tsx_style = tsx_pre.evaluate("node => ({background: getComputedStyle(node).backgroundColor, label: getComputedStyle(node, '::before').content, labelColor: getComputedStyle(node, '::before').color})")
                assert tsx_style["background"] not in ("rgba(0, 0, 0, 0)", "transparent"), tsx_style
                assert "TypeScript-JSX" in tsx_style["label"], tsx_style
                assert tsx_style["labelColor"] == expected_syntax_color, tsx_style
                page.screenshot(path=str(runs_dir / f"path-reader-code-{viewport['width']}.png"), full_page=True)

                # Switching files in the reader must preserve the editor's content column.
                page.get_by_test_id("path-tabs").get_by_text("Second note", exact=True).click()
                expect(reading_view).to_contain_text("Second note content.")
                expect(editor).to_contain_text("Second note content.")
                page.get_by_role("button", name="切换到编辑模式").click()
                expect(editor).to_be_visible()
                restored_column = editor.locator("p").filter(has_text="Second note content.").first.bounding_box()
                assert restored_column and abs(restored_column["width"] - original_column["width"]) <= 1 and abs(restored_column["x"] - original_column["x"]) <= 1, {"before": original_column, "after": restored_column}
                assert_centered_column(editor)
                page.get_by_role("button", name="切换到阅读模式").click()
                page.get_by_test_id("path-tabs").get_by_text("Markdown sample", exact=True).click()
                expect(reading_view.locator("h2").filter(has_text="Heading sample")).to_have_text("Heading sample")
                page.get_by_role("button", name="切换到编辑模式").click()
                expect(editor).to_be_visible()
                restored_column = editor.locator("p").filter(has_text="Normal").first.bounding_box()
                assert restored_column and abs(restored_column["width"] - original_column["width"]) <= 1 and abs(restored_column["x"] - original_column["x"]) <= 1, {"before": original_column, "after": restored_column}
                assert_centered_column(editor)
                page.screenshot(path=str(runs_dir / f"path-editor-centered-{viewport['width']}.png"), full_page=True)

                # Container-only resizing must also recenter, without a window resize event.
                separator = page.get_by_role("separator", name="调整侧栏宽度")
                separator.focus()
                separator.press("End")
                expect(separator).to_have_attribute("aria-valuenow", separator.get_attribute("aria-valuemax"))
                assert_centered_column(editor)
                page.get_by_role("button", name="收起侧栏").click()
                expect(page.get_by_test_id("path-sidebar-wrap")).to_have_css("width", "0px")
                assert_centered_column(editor)
                page.get_by_role("button", name="展开侧栏").click()
                assert_centered_column(editor)
                page.set_viewport_size({"width": 900, "height": 768})
                assert_centered_column(editor)
                page.set_viewport_size(viewport)
                assert_centered_column(editor)

                for selector, marker in (("h2", "##"), ("strong", "**"), ("em", "*"), ("s", "~~"), ('[data-type="code"] code', "`")):
                    target = editor.locator(selector).first
                    target.click()
                    block = target if selector == "h2" else target.locator("..")
                    visible_marker = block.locator(".vditor-ir__marker").first
                    expect(visible_marker).to_be_visible()
                    assert visible_marker.evaluate("node => getComputedStyle(node).color") == expected_syntax_color
                    expect(block).to_contain_text(marker)

                editor.locator('[data-type="a"]').click()
                expect(editor.locator('.vditor-ir__marker--link')).to_be_visible()
                assert editor.locator('.vditor-ir__marker--link').evaluate("node => getComputedStyle(node).color") == expected_syntax_color
                assert len(context.pages) == 1
                editor.locator('.vditor-ir__preview').first.click()
                expect(editor.locator('[data-type="code-block"]')).to_have_class(re.compile("vditor-ir__node--expand"))
                assert "```" in editor.locator('[data-type="code-block"]').evaluate("element => getComputedStyle(element, '::before').content")

                # Structural blocks use native contenteditable behavior, without overlay inputs.
                for selector in ("blockquote p", "ul li:not(.vditor-task)", "li.vditor-task", "ol li", "td", "hr"):
                    editor.locator(selector).first.click()
                    expect(page.get_by_role("textbox", name="Markdown 源码")).to_have_count(0)

                # Native empty-line/item Enter exits quotes and lists.
                select_content(editor.locator("blockquote p"), end=True)
                page.keyboard.press("Enter")
                page.keyboard.press("Enter")
                assert editor.evaluate("element => element.contains(getSelection().anchorNode) && !getSelection().anchorNode.parentElement.closest('blockquote')")
                select_content(editor.locator("ol li"), end=True)
                page.keyboard.press("Enter")
                page.keyboard.press("Enter")
                assert editor.evaluate("element => element.contains(getSelection().anchorNode) && !getSelection().anchorNode.parentElement.closest('li')")

                # Code Enter preserves blank lines; Down reaches the closing fence.
                editor.locator('.vditor-ir__preview').first.click()
                select_content(editor.locator(".vditor-ir__marker--pre code"), end=True)
                page.keyboard.press("Enter")
                page.keyboard.press("Enter")
                assert page.evaluate("!!getSelection().anchorNode.parentElement.closest('.vditor-ir__marker--pre')")
                page.keyboard.press("ArrowDown")
                assert not page.evaluate("!!getSelection().anchorNode.parentElement.closest('.vditor-ir__marker--pre')")
                page.keyboard.press("Enter")
                assert not page.evaluate("!!getSelection().anchorNode.parentElement.closest('[data-type=code-block]')")

                # Menu actions use the saved caret and native undo, retaining all surrounding text.
                editor.locator("blockquote p").click()
                editor_action(page, "取消当前格式")
                expect(editor.locator("blockquote")).to_have_count(0)
                expect(editor).to_contain_text("Quote sample")
                page.wait_for_timeout(600)
                page.keyboard.press("Control+z")
                expect(editor.locator("blockquote p")).to_have_text("Quote sample")
                page.keyboard.press("Control+y")
                expect(editor.locator("blockquote")).to_have_count(0)
                page.keyboard.press("Control+z")
                expect(editor.locator("blockquote p")).to_have_text("Quote sample")

                editor.locator('.vditor-ir__preview').first.click()
                editor_action(page, "取消当前格式")
                expect(editor.locator('[data-type="code-block"]')).to_have_count(0)
                expect(editor).to_contain_text("const answer = 42;")
                expect(editor).to_contain_text("console.log(answer);")
                page.wait_for_timeout(600)
                page.keyboard.press("Control+z")
                expect(editor.locator(".vditor-ir__preview code")).to_contain_text("const answer = 42;")
                editor.locator("strong").click()
                editor_action(page, "取消当前格式")
                expect(editor.locator("strong")).to_have_count(0)
                expect(editor).to_contain_text("bold sample")
                page.wait_for_timeout(600)
                page.keyboard.press("Control+z")
                expect(editor.locator("strong")).to_have_text("bold sample")

                for selector, text in (("em", "italic sample"), ("s", "strike sample"), ('[data-type="code"]', "inline code"), ('[data-type="a"]', "Link sample"), ("h2", "Heading sample"), ("ol", "Ordered sample"), ("li.vditor-task", "Task sample"), ("ul:not(:has(.vditor-task))", "List sample")):
                    target = editor.locator(selector).first
                    target.click()
                    editor_action(page, "取消当前格式")
                    expect(editor.locator(selector)).to_have_count(0)
                    expect(editor).to_contain_text(text)
                    page.keyboard.press("Control+z")
                    expect(editor.locator(selector).first).to_contain_text(text)

                # A discoverable exit action inserts a plain paragraph after a code block.
                editor.locator('.vditor-ir__preview').first.click()
                editor_action(page, "在当前块后继续输入")
                assert not page.evaluate("!!getSelection().anchorNode.parentElement.closest('.vditor-ir__marker--pre')")
                page.keyboard.type("After code.")
                expect(editor.locator("p").filter(has_text="After code.")).to_be_visible()
                page.wait_for_timeout(900)

                # Commit the last keystroke before switching mode, then undo as a native edit.
                select_content(editor.locator("blockquote p"), whole=True)
                page.keyboard.insert_text("Updated quote")
                page.get_by_role("button", name="切换到阅读模式").click()
                expect(reading_view.locator("blockquote")).to_have_text("Updated quote")
                expect(reading_view.locator("table")).to_have_count(1)
                reading_table_scroll = reading_view.locator('.path-table-scroll')
                expect(reading_table_scroll).to_have_count(1)
                assert reading_table_scroll.evaluate("node => getComputedStyle(node).overflowX === 'auto'")
                assert reading_table_scroll.evaluate("node => getComputedStyle(node, '::-webkit-scrollbar').height === '8px'")
                reading_view.locator('table').evaluate("node => { node.style.minWidth = '1200px' }")
                assert reading_table_scroll.evaluate(
                    "node => node.scrollWidth > node.clientWidth"
                )
                page.wait_for_timeout(600)
                page.get_by_role("button", name="切换到编辑模式").click()
                editor.locator("p").filter(has_text="Last paragraph.").click()
                page.keyboard.press("Control+z")
                expect(editor.locator("blockquote p")).to_have_text("Quote sample")
                page.keyboard.press("Control+y")
                expect(editor.locator("blockquote p")).to_have_text("Updated quote")
                page.keyboard.press("Control+z")
                expect(editor.locator("blockquote p")).to_have_text("Quote sample")

                # The active block must belong to the correct file after a rapid tab change.
                select_content(editor.locator("blockquote p"), whole=True)
                page.keyboard.insert_text("Saved quote")
                page.get_by_test_id("path-tabs").get_by_text("Second note", exact=True).click()
                expect(editor).to_contain_text("Second note content.")
                page.get_by_test_id("path-tabs").get_by_text("Markdown sample", exact=True).click()
                expect(editor.locator("blockquote p")).to_have_text("Saved quote")
                expect(editor.locator("table")).to_have_count(1)
                editor_table = editor.locator('table').first
                assert editor_table.evaluate("node => getComputedStyle(node).overflowX === 'auto'")
                assert editor_table.evaluate("node => getComputedStyle(node).display === 'block'")
                assert editor_table.evaluate("node => getComputedStyle(node, '::-webkit-scrollbar').height === '8px'")
                editor_scroller = editor_table.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " vditor-reset ")][1]')
                editor_table.scroll_into_view_if_needed()
                editor_scroller.evaluate("node => { node.scrollTop = Math.max(0, node.scrollTop - 120) }")
                vertical_before = editor_scroller.evaluate("node => node.scrollTop")
                plain_table_box = editor_table.bounding_box()
                assert plain_table_box
                page.mouse.move(
                    plain_table_box["x"] + plain_table_box["width"] / 2,
                    plain_table_box["y"] + plain_table_box["height"] / 2,
                )
                page.mouse.wheel(0, 160)
                page.wait_for_timeout(100)
                assert editor_scroller.evaluate("node => node.scrollTop") > vertical_before
                editor_table.locator('td').first.evaluate("""cell => {
                    const probe = document.createElement('span');
                    probe.dataset.tableOverflowProbe = '';
                    probe.style.display = 'block';
                    probe.style.width = '1200px';
                    cell.append(probe);
                }""")
                editor_table_scroll = editor_table.evaluate("""node => {
                    const ancestors = [];
                    let current = node;
                    for (let index = 0; current && index < 5; index += 1, current = current.parentElement) {
                        const style = getComputedStyle(current);
                        ancestors.push({
                            tag: current.tagName,
                            className: current.className,
                            dataType: current.dataset?.type,
                            overflowX: style.overflowX,
                            clientWidth: current.clientWidth,
                            scrollWidth: current.scrollWidth,
                        });
                    }
                    return ancestors;
                }""")
                assert any(
                    item["overflowX"] == "auto" and item["scrollWidth"] > item["clientWidth"]
                    for item in editor_table_scroll
                ), editor_table_scroll
                editor_table.evaluate("node => { node.scrollLeft = 0 }")
                editor_table.scroll_into_view_if_needed()
                table_box = editor_table.bounding_box()
                assert table_box
                page.mouse.move(
                    table_box["x"] + table_box["width"] / 2,
                    table_box["y"] + table_box["height"] / 2,
                )
                page.mouse.wheel(0, 240)
                page.wait_for_timeout(100)
                assert editor_table.evaluate("node => node.scrollLeft") > 0, {
                    "table": editor_table.evaluate(
                        "node => ({clientWidth:node.clientWidth, scrollWidth:node.scrollWidth, scrollLeft:node.scrollLeft})"
                    ),
                    "ancestors": editor_table_scroll,
                }
                editor_table.evaluate("node => { node.scrollLeft = node.scrollWidth }")
                editor_scroller.evaluate("node => { node.scrollTop = Math.max(0, node.scrollTop - 80) }")
                vertical_before = editor_scroller.evaluate("node => node.scrollTop")
                table_box = editor_table.bounding_box()
                assert table_box
                page.mouse.move(
                    table_box["x"] + table_box["width"] / 2,
                    table_box["y"] + table_box["height"] / 2,
                )
                page.mouse.wheel(0, 160)
                page.wait_for_timeout(100)
                assert editor_scroller.evaluate("node => node.scrollTop") > vertical_before
                editor_table.locator('[data-table-overflow-probe]').evaluate("node => node.remove()")

                # Native table editing preserves its surrounding blocks.
                select_content(editor.locator("td").first, whole=True)
                page.keyboard.insert_text("Updated cell")
                page.get_by_role("button", name="切换到阅读模式").click()
                expect(reading_view.locator("td").first).to_have_text("Updated cell")
                expect(reading_view.locator("blockquote")).to_have_text("Saved quote")
                expect(reading_view.locator("li")).to_have_count(3)
                expect(reading_view.locator("pre code")).to_contain_text("const answer = 42;")
                page.get_by_role("button", name="切换到编辑模式").click()
                checkbox = editor.locator('li.vditor-task input[type="checkbox"]')
                checkbox.check()
                expect(checkbox).to_be_checked()
                expect(page.get_by_role("textbox", name="Markdown 源码")).to_have_count(0)

                # Native SV makes all markers editable, including code fences, without a textarea.
                editor_action(page, "编辑 Markdown 源码")
                source_editor = page.locator('.vditor-sv[contenteditable="true"]')
                expect(source_editor).to_be_visible()
                expect(editor).not_to_be_visible()
                expect(source_editor).to_contain_text("```")
                expect(source_editor).to_contain_text("> Saved quote")
                source_marker_colors = source_editor.locator('.vditor-sv__marker').evaluate_all(
                    "nodes => nodes.filter(node => node.getClientRects().length > 0)"
                    ".map(node => getComputedStyle(node).color)"
                )
                assert source_marker_colors and all(
                    color == expected_syntax_color for color in source_marker_colors
                ), source_marker_colors
                expect(page.get_by_role("textbox", name="Markdown 源码")).to_have_count(0)
                page.get_by_role("button", name="编辑操作", exact=True).click()
                expect(page.get_by_role("menuitem", name="取消当前格式", exact=True)).to_have_attribute("aria-disabled", "true")
                page.keyboard.press("Escape")
                # Vditor SV pairs its fences: backspacing the opening marker also
                # removes the matching closing marker. Code text stays in place.
                select_content(source_editor.locator('[data-type="code-block-open-marker"]'), end=True)
                for _ in range(3):
                    page.keyboard.press("Backspace")
                page.keyboard.press("Delete")  # language 'j'
                page.keyboard.press("Delete")  # language 's'
                expect(source_editor).not_to_contain_text("```")
                expect(source_editor).to_contain_text("const answer = 42;")
                page.screenshot(path=str(runs_dir / f"path-editor-source-{viewport['width']}.png"), full_page=True)
                # Last source keystrokes are captured before a rapid file/mode change.
                page.keyboard.press("Control+End")
                page.keyboard.type(" Source edit.")
                page.get_by_test_id("path-tabs").get_by_text("Second note", exact=True).click()
                expect(source_editor).to_contain_text("Second note content.")
                page.get_by_test_id("path-tabs").get_by_text("Markdown sample", exact=True).click()
                expect(source_editor).to_contain_text("Source edit.")
                page.get_by_role("button", name="切换到阅读模式").click()
                expect(reading_view).to_contain_text("Source edit.")
                expect(reading_view.locator("pre")).to_have_count(0)
                page.get_by_role("button", name="切换到编辑模式").click()
                expect(source_editor).to_be_visible()
                editor_action(page, "返回即时渲染")
                expect(editor).to_be_visible()
                expect(editor.locator('[data-type="code-block"]')).to_have_count(0)
                expect(editor).to_contain_text("const answer = 42;")
                assert_centered_column(editor)

                # Regular live-preview typing is also flushed before the reader is shown.
                editor.locator("p").filter(has_text="Last paragraph.").click()
                page.keyboard.press("End")
                page.keyboard.type(" Immediate edit.")
                page.get_by_role("button", name="切换到阅读模式").click()
                expect(reading_view).to_contain_text("Last paragraph. Immediate edit.")
                # No real local directory is granted; only the mocked workspace save is checked.
                with page.expect_response(lambda response: response.url.endswith("/growth/workspace") and response.request.method == "PUT"):
                    page.wait_for_timeout(1800)
                assert writes, "workspace should be saved through the isolated API"
                saved = next(item for item in writes[-1]["data"]["files"] if item["id"] == "note-a")["content"]
                assert "Saved quote" in saved and "Updated cell" in saved and "Immediate edit." in saved and "Source edit." in saved and "After code." in saved, saved
                assert "```" not in saved and "const answer = 42;" in saved and "console.log(answer);" in saved, saved
                assert re.search(r"\[[xX]\]", saved) and saved.count("Saved quote") == 1, saved
                assert next(item for item in writes[-1]["data"]["files"] if item["id"] == "note-b")["content"].strip() == "Second note content.", writes[-1]
                saved_compat = next(item for item in writes[-1]["data"]["files"] if item["id"] == "note-c")["content"]
                assert "来源: [MERN Stack Tutorial 完整学习总结](/community/47)" in saved_compat and "```tsx" in saved_compat, saved_compat
                assert not errors, errors
                page.screenshot(path=str(runs_dir / f"path-editor-{viewport['width']}.png"), full_page=True)
                print(f"PASS: editor layout and modes at {viewport['width']}x{viewport['height']}", flush=True)
            except Exception:
                page.screenshot(path=str(runs_dir / f"path-editor-{viewport['width']}-failure.png"), full_page=True)
                print(json.dumps({"errors": errors, "url": page.url}), flush=True)
                raise
            finally:
                context.close()
    finally:
        browser.close()
