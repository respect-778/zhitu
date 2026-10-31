"""Regression: Wiki links look/act like links and picker arrows retain selection."""
import copy
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
BASE_URL = os.environ.get("PATH_UI_BASE_URL", "http://127.0.0.1:5176")
RUNS = Path(__file__).parents[1] / ".agent-workflow/tasks/learning-wiki-foundation/runs"
RUNS.mkdir(parents=True, exist_ok=True)
TITLE = "Obsidian 日常归档 Skill"
EXTERNAL_LABEL = "OpenAI API"
SOURCE_CONTENT = f"# Obsidian 专用\n\n- [[{TITLE}]]\n\n[{EXTERNAL_LABEL}](https://platform.openai.com/docs)\n\n[["
INITIAL = {"revision": 1, "data": {
    "files": [
        {"id": "source", "name": "Skills总览", "type": "file", "parentId": None, "order": 0,
         "content": SOURCE_CONTENT},
        {"id": "target", "name": TITLE, "type": "file", "parentId": None, "order": 1, "content": "# 归档流程\n"},
        {"id": "second", "name": "第二份候选笔记", "type": "file", "parentId": None, "order": 2, "content": "# 第二份\n"},
    ],
    "openTabs": ["source"], "activeTabId": "source", "expandedFolderIds": [],
    "activePlan": None, "mentorId": None,
}}


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    failures = []
    try:
        model = copy.deepcopy(INITIAL)
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        context.add_init_script("localStorage.setItem('userId','114');localStorage.setItem('token','wiki-live-test')")

        def intercept(route):
            endpoint = urlparse(route.request.url).path
            if endpoint.endswith("/growth/workspace"):
                if route.request.method == "PUT":
                    model["data"] = copy.deepcopy(route.request.post_data_json["data"])
                    model["revision"] += 1
                route.fulfill(json=copy.deepcopy(model))
            elif endpoint.endswith("/user/info"):
                route.fulfill(json={"data": {"id": "114", "username": "wiki-live", "email": "test@example.invalid", "avatar": ""}})
            else:
                route.fulfill(json={"data": [], "list": [], "total": 0})

        context.route(f"{BASE_URL}/api/**", intercept)
        page = context.new_page()
        page.goto(f"{BASE_URL}/path", wait_until="networkidle")
        editor = page.locator('.vditor-ir [contenteditable="true"]')

        try:
            links = editor.locator('[data-wiki-link-target-id="target"]')
            assert links.count() == 1, links.count()
            link = links.first
            link.wait_for(state="visible", timeout=1500)
            assert link.get_attribute("data-wiki-link-status") == "resolved"
            page.screenshot(path=str(RUNS / "wiki-live-link-1440.png"), full_page=True)
            link.click()
            page.get_by_role("tab", name=TITLE, exact=True).wait_for(state="visible", timeout=1500)
            assert page.get_by_role("tab", name=TITLE, exact=True).get_attribute("aria-selected") == "true"
            page.wait_for_timeout(600)
            assert next(item for item in model["data"]["files"] if item["id"] == "source")["content"] == SOURCE_CONTENT
        except Exception as error:
            failures.append(f"live-link styling/single-click navigation: {error}")

        page.get_by_role("tab", name="Skills总览", exact=True).click()
        try:
            internal = editor.locator('[data-wiki-link-target-id="target"]').first
            external = editor.locator('.vditor-ir__link').filter(has_text=EXTERNAL_LABEL)
            colors = page.evaluate("""([internal,external]) => ({
              internal: getComputedStyle(internal, '::after').color,
              external: getComputedStyle(external).color,
              icon: getComputedStyle(external, '::after').content,
              iconMask: getComputedStyle(external, '::after').maskImage,
              iconWidth: getComputedStyle(external, '::after').width,
            })""", [internal.element_handle(), external.element_handle()])
            assert colors["external"] == colors["internal"], colors
            assert colors["icon"] == '""' and colors["iconMask"] != "none" and colors["iconWidth"] == "12px", colors
        except Exception as error:
            failures.append(f"external-link shared blue/icon: {error}")

        try:
            page.get_by_role("button", name="切换到阅读模式", exact=True).click()
            reading = page.get_by_test_id("path-reading-view")
            internal_reading = reading.get_by_role("link", name=TITLE, exact=True)
            external_reading = reading.get_by_role("link", name=EXTERNAL_LABEL, exact=True)
            reading_style = page.evaluate("""([internal,external]) => ({
              internal: getComputedStyle(internal).color,
              external: getComputedStyle(external).color,
              externalMask: getComputedStyle(external, '::after').maskImage,
              externalWidth: getComputedStyle(external, '::after').width,
              internalMask: getComputedStyle(internal, '::after').maskImage,
            })""", [internal_reading.element_handle(), external_reading.element_handle()])
            assert reading_style["external"] == reading_style["internal"], reading_style
            assert reading_style["externalMask"] != "none" and reading_style["externalWidth"] == "12px", reading_style
            assert reading_style["internalMask"] == "none", reading_style
            page.get_by_role("button", name="切换到编辑模式", exact=True).click()
            page.evaluate("document.documentElement.setAttribute('data-theme','dark')")
            page.wait_for_timeout(250)
            internal_dark = editor.locator('[data-wiki-link-target-id="target"]').first
            external_dark = editor.locator('.vditor-ir__link').filter(has_text=EXTERNAL_LABEL)
            dark_style = page.evaluate("""([internal,external]) => ({
              internal: getComputedStyle(internal, '::after').color,
              external: getComputedStyle(external).color,
              externalMask: getComputedStyle(external, '::after').maskImage,
            })""", [internal_dark.element_handle(), external_dark.element_handle()])
            assert dark_style["external"] == dark_style["internal"] and dark_style["externalMask"] != "none", dark_style
            page.evaluate("document.documentElement.setAttribute('data-theme','light')")
        except Exception as error:
            failures.append(f"reading external-link shared blue/icon: {error}")

        try:
            last_block = editor.locator("p").last
            last_block.click()
            page.keyboard.press("End")
            page.keyboard.type("x")
            page.keyboard.press("Backspace")
            picker = page.get_by_test_id("wiki-link-picker")
            picker.wait_for(state="visible", timeout=1500)
            selected_before = picker.locator('[role="option"][aria-selected="true"]').inner_text()
            page.keyboard.press("ArrowDown")
            selected_after = picker.locator('[role="option"][aria-selected="true"]').inner_text()
            assert selected_after != selected_before, (selected_before, selected_after)
            page.keyboard.press("ArrowUp")
            selected_returned = picker.locator('[role="option"][aria-selected="true"]').inner_text()
            assert selected_returned == selected_before, (selected_before, selected_returned)
            page.keyboard.press("ArrowDown")
            selected = picker.locator('[role="option"][aria-selected="true"]')
            selected_id = selected.get_attribute("data-wiki-link-candidate-id")
            selected_label = selected.locator("strong").inner_text()
            page.keyboard.press("Enter")
            picker.wait_for(state="hidden", timeout=1500)
            inserted = editor.locator(f'[data-wiki-link-target-id="{selected_id}"]').last
            inserted.wait_for(state="visible", timeout=1500)
            assert inserted.get_attribute("data-wiki-link-label") == selected_label
        except Exception as error:
            failures.append(f"picker ArrowDown/ArrowUp selection: {error}")

        context.close()
    finally:
        browser.close()

if failures:
    raise AssertionError("\n\n".join(failures))
print("Wiki live-edit checks passed")
