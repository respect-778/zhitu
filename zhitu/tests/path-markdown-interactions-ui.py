"""Direct list syntax and code-fence interaction regression; all API writes mocked."""
import copy
import os
import re
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
BASE_URL = os.environ.get("PATH_UI_BASE_URL", "http://127.0.0.1:5175")
RUNS = Path(__file__).parents[1] / ".agent-workflow/tasks/path-obsidian-navigation/runs"
CODE = "const answer = 42;\nconsole.log(answer);"
QUOTE = "> Quote sample **kept bold**.\n>\n> Second paragraph.\n>\n> ```js\n> const quoted = 7;\n> ```\n>\n> - Quoted item\n>\n> > Nested quote.\n\nOutside quote.\n"
INITIAL = {"revision": 1, "data": {
    "files": [
        {"id": "typing", "name": "Typing fixture", "type": "file", "parentId": None, "order": 0, "content": "", "fileType": "note"},
        {"id": "list", "name": "List fixture", "type": "file", "parentId": None, "order": 1, "content": "- List item\n- Second item\n  - Nested child\n- Third item\n\nEnd.\n", "fileType": "note"},
        {"id": "code", "name": "Code fixture", "type": "file", "parentId": None, "order": 2, "content": f"```js\n{CODE}\n```\n", "fileType": "note"},
        {"id": "quote", "name": "Quote fixture", "type": "file", "parentId": None, "order": 3, "content": QUOTE, "fileType": "note"},
    ],
    "openTabs": ["typing", "list", "code", "quote"], "activeTabId": "typing", "expandedFolderIds": [], "activePlan": None, "mentorId": None,
}}


def select_contents(target, end=False):
    target.evaluate("""(element, end) => {
        element.closest('[contenteditable]').focus();
        const range = document.createRange(); range.selectNodeContents(element);
        if (end) range.collapse(false);
        getSelection().removeAllRanges(); getSelection().addRange(range);
    }""", end)


def activate_code_block(code):
    if not code.evaluate("node => node.classList.contains('vditor-ir__node--expand')"):
        code.locator('.vditor-ir__preview').click()
    editable = code.locator('.vditor-ir__marker--pre code')
    expect(editable).to_be_visible()
    expect(editable).to_have_attribute('data-path-code-highlight', '')
    assert editable.locator('span').count() > 0
    visible_surfaces = code.locator('.vditor-ir__marker--pre, .vditor-ir__preview').evaluate_all(
        "nodes => nodes.filter(node => { const style = getComputedStyle(node); "
        "return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0 }).length"
    )
    assert visible_surfaces == 1, visible_surfaces


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    try:
        for width, height in ((1440, 1000), (1024, 768)):
            model = copy.deepcopy(INITIAL)
            writes, errors = [], []
            context = browser.new_context(viewport={"width": width, "height": height})
            context.add_init_script("localStorage.setItem('userId','100');localStorage.setItem('token','isolated-markdown-fixture');localStorage.setItem('username','test')")
            if width == 1024:
                context.add_init_script("localStorage.setItem('data-theme','dark')")

            def intercept(route):
                endpoint = route.request.url.split("?")[0]
                if endpoint.endswith("/growth/workspace"):
                    if route.request.method == "PUT":
                        model["data"] = copy.deepcopy(route.request.post_data_json["data"])
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
                root = page.locator('.vditor-ir [contenteditable="true"]')
                expect(root).to_be_visible(timeout=30000)
                page.get_by_test_id("path-tabs").get_by_text("Quote fixture", exact=True).click()
                quote = root.locator(":scope > blockquote")
                quote.locator("p").first.click()
                quote_marker = quote.locator(":scope > [data-path-quote-marker]")
                expect(quote_marker).to_be_visible(timeout=3000)
                expect(quote_marker).to_have_text(">")
                second = quote.locator("p").filter(has_text="Second paragraph.")
                second.click()
                assert abs(quote_marker.bounding_box()["y"] - second.bounding_box()["y"]) <= 2
                select_contents(quote_marker)
                page.keyboard.press("Backspace")
                expect(root.locator(":scope > blockquote > blockquote")).to_have_count(0)
                expect(root.locator("blockquote")).to_have_count(1)  # Nested quote retained.
                expect(root.locator("strong")).to_have_text("kept bold")
                expect(root.locator(".vditor-ir__preview code")).to_contain_text("const quoted = 7;")
                expect(root.locator("li")).to_have_text("Quoted item")
                expect(root.locator(":scope > p").first).to_contain_text("Quote sample")
                page.keyboard.press("Control+z")
                expect(root.locator("blockquote")).to_have_count(2)
                page.keyboard.press("Control+y")
                expect(root.locator("blockquote")).to_have_count(1)
                page.keyboard.press("Control+z")
                expect(root.locator("blockquote")).to_have_count(2)
                nested = quote.locator("blockquote")
                nested.locator("p").click()
                nested.locator(":scope > [data-path-quote-marker]").click()
                page.keyboard.press("End")
                page.keyboard.press("Backspace")
                expect(root.locator("blockquote")).to_have_count(1)
                expect(quote).to_contain_text("Nested quote.")
                page.keyboard.press("Control+z")
                expect(root.locator("blockquote")).to_have_count(2)
                activate_code_block(quote.locator('[data-type="code-block"]'))
                expect(quote_marker).to_be_visible()
                expect(quote.locator('[data-type="code-block-close-marker"]')).to_be_visible()
                page.screenshot(path=str(RUNS / f"path-direct-quote-{width}.png"), full_page=True)
                page.get_by_role("button", name="切换到阅读模式").click()
                reader = page.get_by_test_id("path-reading-view")
                expect(reader.locator("blockquote")).to_have_count(2)
                expect(reader.locator("[data-path-quote-marker]")).to_have_count(0)
                expect(reader.locator("strong")).to_have_text("kept bold")
                page.get_by_role("button", name="切换到编辑模式").click()
                quote.locator("p").first.click()
                page.get_by_role("button", name="编辑操作", exact=True).click()
                page.get_by_role("menuitem", name="编辑 Markdown 源码", exact=True).click()
                source = page.locator('.vditor-sv[contenteditable="true"]')
                expect(source).to_be_visible()
                assert "> > Quote sample" not in source.inner_text(), source.inner_text()
                page.get_by_role("button", name="编辑操作", exact=True).click()
                page.get_by_role("menuitem", name="返回即时渲染", exact=True).click()
                expect(root.locator("blockquote")).to_have_count(2)
                quote.locator("p").first.click()
                page.get_by_test_id("path-tabs").get_by_text("Typing fixture", exact=True).click()
                page.get_by_test_id("path-tabs").get_by_text("Quote fixture", exact=True).click()
                expect(root.locator("blockquote")).to_have_count(2)
                expect(quote.locator(".vditor-ir__preview code")).to_contain_text("const quoted = 7;")
                page.get_by_test_id("path-tabs").get_by_text("Typing fixture", exact=True).click()
                root.click(position={"x": 45, "y": 16})
                page.keyboard.type("- ", delay=50)
                expect(root.locator("ul > li")).to_have_count(1, timeout=3000)
                page.keyboard.type("Created item.")
                expect(root.locator("li")).to_contain_text("Created item.")
                page.keyboard.press("Enter")
                page.keyboard.type("Next item.")
                expect(root.locator("li").nth(1)).to_contain_text("Next item.")
                page.keyboard.press("Enter")
                page.keyboard.press("Enter")
                assert page.evaluate("(() => { const node = getSelection().anchorNode; const element = node instanceof Element ? node : node.parentElement; return !!element.closest('p') && !element.closest('li') })()"), root.inner_html()
                page.keyboard.type("Outside list.")
                expect(root.locator(":scope > p")).to_contain_text("Outside list.")
                expect(root.locator("li")).to_have_count(2)

                page.get_by_test_id("path-tabs").get_by_text("List fixture", exact=True).click()
                item = root.locator("li").first
                item.click()
                marker = item.locator("[data-path-list-marker]")
                expect(marker).to_be_visible(timeout=3000)
                expect(marker).to_have_text("- ")
                page.screenshot(path=str(RUNS / f"path-direct-list-{width}.png"), full_page=True)
                select_contents(marker)
                page.keyboard.press("Backspace")
                expect(root.locator("li")).to_have_count(3)
                expect(root.locator("li").first).to_contain_text("Second item")
                expect(root.locator(":scope > p").filter(has_text="List item")).to_be_visible()
                page.keyboard.press("Control+z")
                expect(root.locator("li")).to_have_count(4)
                page.keyboard.press("Control+y")
                expect(root.locator("li")).to_have_count(3)
                page.keyboard.press("Control+z")
                expect(root.locator("li")).to_have_count(4)
                item = root.locator("li").filter(has_text="Second item").first
                item.click(position={"x": 55, "y": 12})
                marker = item.locator(":scope > [data-path-list-marker]")
                expect(marker).to_be_visible()
                select_contents(marker, end=True)
                page.keyboard.press("Backspace")  # Delete the space, then the marker.
                page.keyboard.press("Backspace")
                expect(root.locator("li")).to_have_count(3)
                expect(root.locator(":scope > p").filter(has_text="Second item")).to_be_visible()
                expect(root.locator("li").filter(has_text="Nested child")).to_be_visible()
                assert root.inner_text().index("List item") < root.inner_text().index("Second item") < root.inner_text().index("Nested child") < root.inner_text().index("Third item")
                page.keyboard.press("Control+z")
                expect(root.locator("li")).to_have_count(4)
                page.keyboard.press("Control+z")  # Restore the marker's space as well.

                # A revealed prefix must not become an extra '- ' in saved source.
                page.get_by_role("button", name="切换到阅读模式").click()
                expect(page.get_by_test_id("path-reading-view").locator("li")).to_have_count(4)
                page.get_by_role("button", name="切换到编辑模式").click()
                root.locator("li").first.click()
                page.get_by_role("button", name="编辑操作", exact=True).click()
                page.get_by_role("menuitem", name="编辑 Markdown 源码", exact=True).click()
                source = page.locator('.vditor-sv[contenteditable="true"]')
                expect(source).to_be_visible()
                assert "- - List item" not in source.inner_text()
                page.get_by_role("button", name="编辑操作", exact=True).click()
                page.get_by_role("menuitem", name="返回即时渲染", exact=True).click()
                expect(root.locator("li")).to_have_count(4)

                page.get_by_test_id("path-tabs").get_by_text("Code fixture", exact=True).click()
                code = root.locator('[data-type="code-block"]')
                activate_code_block(code)
                fence = code.locator('[data-type="code-block-close-marker"]')
                expect(fence).to_be_visible(timeout=3000)
                page.screenshot(path=str(RUNS / f"path-direct-markdown-{width}.png"), full_page=True)
                select_contents(fence, end=True)
                page.keyboard.press("Backspace")
                expect(root.locator('[data-type="code-block"]')).to_have_count(0)
                expect(root).to_contain_text("const answer = 42;")
                expect(root).to_contain_text("console.log(answer);")
                page.keyboard.press("Control+z")
                expect(root.locator('[data-type="code-block"]')).to_have_count(1)
                activate_code_block(code)
                expect(fence).to_be_visible()
                fence.click()
                page.keyboard.press("End")
                page.keyboard.press("Enter")
                assert not page.evaluate("!!getSelection().anchorNode.parentElement.closest('[data-type=code-block]')")
                page.keyboard.type("After fence.")
                expect(code.locator(".vditor-ir__marker--pre code")).to_have_text(CODE + "\n")
                expect(root.locator(":scope > p")).to_contain_text("After fence.")
                page.wait_for_timeout(900)
                activate_code_block(code)
                select_contents(code.locator(".vditor-ir__marker--pre code"), end=True)
                page.keyboard.press("ArrowDown")
                assert page.evaluate("(() => { const node = getSelection().anchorNode; return (node instanceof Element ? node : node.parentElement).closest('[data-type=code-block-close-marker]') !== null })()")
                page.keyboard.press("Enter")
                page.keyboard.type("Keyboard exit.")
                expect(code.locator(".vditor-ir__marker--pre code")).to_have_text(CODE + "\n")
                page.get_by_role("button", name="切换到阅读模式").click()
                reader = page.get_by_test_id("path-reading-view")
                expect(reader.locator("pre code")).to_have_text(CODE + "\n")
                expect(reader).to_contain_text("Keyboard exit.")
                page.get_by_role("button", name="切换到编辑模式").click()
                expect(root.locator('[data-type="code-block"]')).to_have_count(1)
                page.wait_for_timeout(1600)
                assert writes
                saved = {file["id"]: file["content"] for file in writes[-1]["data"]["files"]}
                assert saved["typing"] == "- Created item.\n- Next item.\n\nOutside list.\n", saved["typing"]
                assert saved["list"] == INITIAL["data"]["files"][1]["content"], saved["list"]
                assert f"```js\n{CODE}\n```" in saved["code"] and "Keyboard exit." in saved["code"], saved["code"]
                assert "> Quote sample **kept bold**." in saved["quote"] and "> > Quote sample" not in saved["quote"], saved["quote"]
                assert re.search(r"^>\s?> Nested quote\.$", saved["quote"], re.MULTILINE) and "> ```js\n> const quoted = 7;\n> ```" in saved["quote"], saved["quote"]
                assert "> - Quoted item" in saved["quote"] and "Outside quote." in saved["quote"], saved["quote"]
                assert not errors, errors
                print(f"PASS direct Markdown interactions {width}x{height}")
            finally:
                context.close()
    finally:
        browser.close()
