import copy
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright


BASE_URL = "http://127.0.0.1:5175"
FILES = [
    {"id": "folder", "name": "Notes", "type": "folder", "parentId": None, "order": 0},
    *[
        {"id": f"note-{i}", "name": "短标题" if i == 1 else f"学习笔记 {i:02d}：较长的文件名与知识整理记录",
         "type": "file", "parentId": "folder", "content": f"正文 {i}\n", "fileType": "note", "order": i}
        for i in range(1, 25)
    ],
]
INITIAL = {"revision": 1, "data": {"files": FILES, "openTabs": ["note-1", "note-2"],
           "activeTabId": "note-1", "expandedFolderIds": ["folder"], "activePlan": None, "mentorId": None}}
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
runs_dir = Path(__file__).parents[1] / ".agent-workflow" / "tasks" / "path-obsidian-navigation" / "runs"


def settle_tabs(page):
    page.wait_for_function("""() => document.querySelector('[data-testid="path-tabs"]')
        .getAnimations({subtree: true}).every(animation => animation.playState !== 'running')""")


def inspect_tabs(page):
    settle_tabs(page)
    metrics = page.get_by_test_id("path-tabs").evaluate("""bar => ({
        width: bar.clientWidth, scrollWidth: bar.scrollWidth, height: bar.clientHeight,
        tabs: [...bar.querySelectorAll('[role="tab"]')].map(tab => tab.getBoundingClientRect().toJSON()),
        stripWidth: bar.firstElementChild.clientWidth, stripScrollWidth: bar.firstElementChild.scrollWidth,
        button: bar.querySelector('button[title="新建标签页"]').getBoundingClientRect().toJSON(),
        menuButton: bar.querySelector('button[title="标签页操作"]').getBoundingClientRect().toJSON(),
        bounds: bar.getBoundingClientRect().toJSON(),
    })""")
    widths = [tab["width"] for tab in metrics["tabs"]]
    if widths:
        assert max(widths) - min(widths) <= 1 and max(widths) <= 200.1, metrics
    assert metrics["scrollWidth"] <= metrics["width"] + 1, metrics
    assert metrics["stripScrollWidth"] <= metrics["stripWidth"] + 1, metrics
    assert metrics["height"] == 41, metrics
    assert metrics["button"]["x"] + metrics["button"]["width"] <= metrics["bounds"]["right"] + 1, metrics
    assert abs(metrics["menuButton"]["right"] - metrics["bounds"]["right"]) <= 1, metrics
    assert metrics["button"]["right"] <= metrics["menuButton"]["x"] + 1, metrics
    if widths:
        assert metrics["button"]["x"] >= metrics["tabs"][-1]["right"] - 1, metrics
    return widths[0] if widths else 0


def open_tab_menu(page, count):
    page.get_by_role("button", name="标签页操作", exact=True).click()
    action = page.get_by_role("menuitem", name="全部关闭")
    expect(action).to_be_visible()
    # Opening the menu alone must not close or change any tabs.
    expect(page.get_by_test_id("path-tabs").get_by_role("tab")).to_have_count(count)
    return action


def assert_empty_workspace(page):
    expect(page.get_by_test_id("path-tabs").get_by_role("tab")).to_have_count(0)
    expect(page.locator(".vditor")).to_have_count(0)
    expect(page.get_by_test_id("path-main-area").locator("canvas")).to_have_count(0)
    expect(page.get_by_text("新建笔记 (Alt + N)", exact=True)).to_be_visible()
    expect(page.get_by_role("button", name="返回", exact=True)).to_be_disabled()
    expect(page.get_by_role("button", name="前进", exact=True)).to_be_disabled()
    inspect_tabs(page)


def sample_width_change(target):
    return target.evaluate("""target => new Promise(resolve => {
        const firstTab = document.querySelector('[data-testid="path-tabs"] [role="tab"]');
        const widths = [firstTab.getBoundingClientRect().width];
        const observer = new ResizeObserver(() => widths.push(firstTab.getBoundingClientRect().width));
        observer.observe(firstTab);
        const tabList = firstTab.parentElement;
        const mutationObserver = new MutationObserver(() => {
            mutationObserver.disconnect();
            // Follow the animation clock instead of a wall timer, which can expire before a busy paint.
            firstTab.getBoundingClientRect();
            Promise.all(firstTab.getAnimations().map(animation => animation.finished.catch(() => {})))
                .then(() => {
                    widths.push(firstTab.getBoundingClientRect().width);
                    observer.disconnect();
                    resolve(widths);
                });
        });
        mutationObserver.observe(tabList, {childList: true});
        target.click();
    })""")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    try:
        for viewport in ({"width": 1440, "height": 1000}, {"width": 1024, "height": 768}):
            model = copy.deepcopy(INITIAL)
            errors = []
            context = browser.new_context(viewport=viewport)
            context.add_init_script("""window.tabMotionEvents = [];
                for (const type of ['animationstart', 'transitionrun']) {
                    document.addEventListener(type, event => {
                        if (event.target.closest?.('[data-testid="path-tabs"]') &&
                            (type === 'animationstart' || event.propertyName === 'width')) {
                            window.tabMotionEvents.push({type, name: event.animationName || event.propertyName});
                        }
                    }, true);
                }""")
            context.add_init_script("localStorage.setItem('userId','100');localStorage.setItem('token','isolated-tabs-token');localStorage.setItem('username','test')")
            if viewport["width"] == 1024:
                context.add_init_script("localStorage.setItem('data-theme','dark')")

            def intercept(route):
                endpoint = urlparse(route.request.url).path
                if endpoint.endswith("/growth/workspace"):
                    if route.request.method == "PUT":
                        model["data"] = copy.deepcopy(route.request.post_data_json["data"])
                        model["revision"] += 1
                    route.fulfill(json=copy.deepcopy(model))
                elif endpoint.endswith("/user/info"):
                    route.fulfill(json={"data": {"id": "100", "username": "test", "avatar": ""}, "message": "ok"})
                else:
                    route.fulfill(json={"data": [], "list": [], "total": 0})

            context.route(f"{BASE_URL}/api/**", intercept)
            # Serve the installed editor assets so the test does not depend on CDN timing.
            context.route(re.compile(r"https://cdn\.jsdelivr\.net/npm/vditor@[^/]+/dist/.*"),
                          lambda route: route.fulfill(path=str(Path(__file__).parents[1] / "node_modules/vditor/dist" /
                                                              urlparse(route.request.url).path.split("/dist/", 1)[1])))
            page = context.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)))
            try:
                page.goto(f"{BASE_URL}/path")
                page.wait_for_load_state("networkidle")
                bar = page.get_by_test_id("path-tabs")
                tree = page.get_by_test_id("file-tree")
                expect(bar.get_by_role("tab")).to_have_count(2)
                assert inspect_tabs(page) == 200
                page.screenshot(path=str(runs_dir / f"path-tabs-few-{viewport['width']}.png"), full_page=True)

                initial_motion = page.evaluate("window.tabMotionEvents")
                page.locator("header").get_by_text("探索", exact=True).click()
                expect(bar).to_have_count(0)
                page.evaluate("window.tabMotionEvents = []")
                page.locator("header").get_by_text("学习规划", exact=True).click()
                expect(bar.get_by_role("tab")).to_have_count(2)
                page.wait_for_load_state("networkidle")
                inspect_tabs(page)
                return_motion = page.evaluate("window.tabMotionEvents")
                assert not return_motion, {"unexpected route-entry motion": return_motion}
                assert not initial_motion, {"unexpected restored-tabs motion": initial_motion}
                page.evaluate("window.tabMotionEvents = []")

                for i in range(3, 7):
                    tree.get_by_text(FILES[i]["name"], exact=True).click()
                    expect(bar.get_by_role("tab")).to_have_count(i)
                    inspect_tabs(page)
                assert any(event["type"] == "animationstart" for event in page.evaluate("window.tabMotionEvents")), "New tabs should still animate"
                before = inspect_tabs(page)
                samples = sample_width_change(tree.get_by_text(FILES[7]["name"], exact=True))
                expect(bar.get_by_role("tab")).to_have_count(7)
                after = inspect_tabs(page)
                assert after < before and any(after + 0.5 < width < before - 0.5 for width in samples), samples

                samples = sample_width_change(bar.get_by_role("button", name=f"关闭 {FILES[7]['name']}", exact=True))
                restored = inspect_tabs(page)
                assert abs(restored - before) <= 1 and any(after + 0.5 < width < before - 0.5 for width in samples), {"before": before, "after": after, "restored": restored, "samples": samples}

                for i in range(7, 25):
                    tree.get_by_text(FILES[i]["name"], exact=True).click()
                    expect(bar.get_by_role("tab")).to_have_count(i)
                inspect_tabs(page)
                last_tab = bar.get_by_role("tab", name=FILES[24]["name"], exact=True)
                expect(last_tab).to_have_attribute("aria-selected", "true")
                bar.get_by_role("tab", name=FILES[1]["name"], exact=True).click()
                expect(bar.get_by_role("tab")).to_have_count(24)
                expect(bar.get_by_role("tab", name=FILES[1]["name"], exact=True)).to_have_attribute("aria-selected", "true")
                expect(page.locator('.vditor-ir [contenteditable="true"]')).to_contain_text("正文 1")
                # Re-entry with crowded, previously animated tabs must also be instant.
                page.locator("header").get_by_text("探索", exact=True).click()
                expect(bar).to_have_count(0)
                page.evaluate("window.tabMotionEvents = []")
                page.locator("header").get_by_text("学习规划", exact=True).click()
                expect(bar.get_by_role("tab")).to_have_count(24)
                page.wait_for_load_state("networkidle")
                inspect_tabs(page)
                assert not page.evaluate("window.tabMotionEvents"), "Crowded restored tabs must not animate"
                page.get_by_role("button", name="知识图谱", exact=True).click()
                expect(bar.get_by_role("tab")).to_have_count(25)
                inspect_tabs(page)
                expect(bar.get_by_test_id("graph-tab")).to_have_attribute("aria-selected", "true")
                page.screenshot(path=str(runs_dir / f"path-tabs-many-{viewport['width']}.png"), full_page=True)
                bar.get_by_role("button", name="关闭 知识图谱", exact=True).click()
                expect(bar.get_by_role("tab")).to_have_count(24)
                inspect_tabs(page)
                page.get_by_role("button", name="收起侧栏").click()
                expect(page.get_by_test_id("path-sidebar-wrap")).to_have_css("width", "0px")
                inspect_tabs(page)
                page.get_by_role("button", name="展开侧栏").click()
                expect(page.get_by_test_id("path-sidebar-wrap")).to_have_css("width", "300px")
                inspect_tabs(page)
                page.set_viewport_size({"width": 900, "height": 768})
                inspect_tabs(page)
                page.set_viewport_size(viewport)
                inspect_tabs(page)
                page.emulate_media(reduced_motion="reduce")
                samples = sample_width_change(bar.get_by_role("button", name=f"关闭 {FILES[24]['name']}", exact=True))
                after = inspect_tabs(page)
                assert all(abs(width - samples[0]) <= 1 or abs(width - after) <= 1 for width in samples), samples
                page.evaluate("window.tabMotionEvents = []")
                bar.get_by_role("button", name="新建标签页", exact=True).click()
                expect(bar.get_by_role("tab")).to_have_count(24)
                expect(page.get_by_role("textbox", name="输入文件名...")).to_have_value("未命名笔记")
                inspect_tabs(page)
                assert not page.evaluate("window.tabMotionEvents"), "Reduced motion should suppress new-tab entry too"
                # Closing all immediately after typing keeps the last edit and every file.
                tree.get_by_text(FILES[1]["name"], exact=True).click()
                editor = page.locator('.vditor-ir [contenteditable="true"]')
                expect(editor).to_contain_text("正文 1")
                editor.click()
                editor.press("Control+End")
                marker = "关闭前最后输入"
                editor.press_sequentially(marker)
                action = open_tab_menu(page, 24)
                page.screenshot(path=str(runs_dir / f"path-tabs-menu-{viewport['width']}.png"), full_page=True)

                def saved_closed(response):
                    if not response.url.endswith("/growth/workspace") or response.request.method != "PUT":
                        return False
                    data = response.request.post_data_json["data"]
                    return (data["openTabs"] == [] and data["activeTabId"] is None and
                            marker in next(file["content"] for file in data["files"] if file["id"] == "note-1"))

                with page.expect_response(saved_closed):
                    action.click()
                    assert_empty_workspace(page)
                expect(page.get_by_role("menuitem", name="全部关闭")).not_to_be_visible()
                assert len(model["data"]["files"]) == len(FILES) + 1, model
                for original in FILES[2:]:
                    actual = next(file for file in model["data"]["files"] if file["id"] == original["id"])
                    assert actual["content"] == original["content"], actual
                empty_action = open_tab_menu(page, 0)
                expect(empty_action).to_have_attribute("aria-disabled", "true")
                page.keyboard.press("Escape")
                page.screenshot(path=str(runs_dir / f"path-tabs-closed-{viewport['width']}.png"), full_page=True)

                # Closed tabs stay closed on reload; stored files can still be reopened.
                page.reload()
                page.wait_for_load_state("networkidle")
                assert_empty_workspace(page)
                tree.get_by_text(FILES[1]["name"], exact=True).click()
                expect(page.locator('.vditor-ir [contenteditable="true"]')).to_contain_text(marker)
                page.get_by_role("button", name="知识图谱", exact=True).click()
                expect(bar.get_by_test_id("graph-tab")).to_have_attribute("aria-selected", "true")
                open_tab_menu(page, 2).click()
                assert_empty_workspace(page)
                page.get_by_role("button", name="知识图谱", exact=True).click()
                open_tab_menu(page, 1).click()
                assert_empty_workspace(page)
                bar.get_by_role("button", name="新建标签页", exact=True).click()
                expect(bar.get_by_role("tab")).to_have_count(1)
                expect(page.get_by_role("textbox", name="输入文件名...")).to_have_value("未命名笔记")
                assert inspect_tabs(page) == 200
                assert not errors, errors
                print(f"PASS: instant restored tabs, animated user actions and close-all menu at {viewport['width']}x{viewport['height']}", flush=True)
            except Exception:
                page.screenshot(path=str(runs_dir / f"path-tabs-{viewport['width']}-failure.png"), full_page=True)
                raise
            finally:
                context.close()
    finally:
        browser.close()
