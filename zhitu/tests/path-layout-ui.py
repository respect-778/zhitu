import copy
import json
import sys
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright


model = {
    "revision": 1,
    "data": {
        "files": [
            {"id": "folder-plan", "name": "我的规划", "type": "folder", "parentId": None, "order": 0},
            {"id": "folder-notes", "name": "学习笔记", "type": "folder", "parentId": None, "order": 1},
            {"id": "folder-react", "name": "React", "type": "folder", "parentId": "folder-notes", "order": 0},
            {"id": "note-a", "name": "测试笔记", "type": "file", "parentId": "folder-react", "content": "图谱切换后的正文", "fileType": "note", "order": 0},
        ],
        "openTabs": ["note-a"],
        "activeTabId": "note-a",
        "expandedFolderIds": [],
        "activePlan": None,
        "mentorId": None,
    },
}
initial_model = copy.deepcopy(model)
errors = []
console_errors = []
writes = []
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")


def intercept(route):
    request = route.request
    endpoint = urlparse(request.url).path
    if endpoint.endswith("/growth/workspace"):
        if request.method == "GET":
            route.fulfill(json=copy.deepcopy(model))
        elif request.method == "PUT":
            payload = request.post_data_json
            model["data"] = copy.deepcopy(payload["data"])
            model["revision"] += 1
            writes.append(copy.deepcopy(payload))
            route.fulfill(json={"message": "ok", **copy.deepcopy(model)})
        else:
            route.fulfill(status=405, json={})
    elif endpoint.endswith("/user/info"):
        route.fulfill(json={"data": {"id": "100", "username": "test", "email": "test@example.invalid", "avatar": ""}, "message": "ok"})
    else:
        route.fulfill(json={"data": [], "message": "ok", "list": [], "total": 0})


def drag_separator(page, separator, target_x):
    box = separator.bounding_box()
    assert box
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.mouse.down()
    page.mouse.move(target_x, box["y"] + box["height"] / 2, steps=12)
    page.mouse.up()


def sample_sidebar_toggle(page, name):
    return page.get_by_role("button", name=name).evaluate("""button => new Promise(resolve => {
        const panel = document.querySelector('[data-testid="path-sidebar-wrap"]');
        const navigation = document.querySelector('[data-testid="path-top-navigation"]');
        const divider = document.querySelector('[role="separator"]');
        const main = document.querySelector('[data-testid="path-main-area"]');
        const samples = [];
        const sample = () => {
            const panelBox = panel.getBoundingClientRect();
            samples.push({width: panelBox.width,
                alignment: navigation.getBoundingClientRect().right - divider.getBoundingClientRect().right,
                mainWidth: main.getBoundingClientRect().width});
        };
        // Observe after the app's observer has synchronized the top row before paint.
        const observer = new ResizeObserver(sample);
        observer.observe(panel);
        button.click();
        setTimeout(() => { sample(); observer.disconnect(); resolve(samples); }, 300);
    })""")


with sync_playwright() as playwright:
    runs_dir = Path(__file__).parents[1] / ".agent-workflow" / "tasks" / "path-obsidian-navigation" / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    browser = playwright.chromium.launch(
        headless=True,
        executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    )
    try:
        for viewport in ({"width": 1440, "height": 1000}, {"width": 1024, "height": 768}):
            model.clear()
            model.update(copy.deepcopy(initial_model))
            writes.clear()
            context = browser.new_context(viewport=viewport)
            context.add_init_script(
                "localStorage.setItem('userId','100');"
                "localStorage.setItem('token','isolated-ui-token');"
                "localStorage.setItem('username','test')"
            )
            context.route("http://127.0.0.1:5175/api/**", intercept)
            page = context.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("console", lambda event: console_errors.append(event.text) if event.type == "error" else None)
            try:
                page.goto("http://127.0.0.1:5175/path")
                page.wait_for_load_state("networkidle")

                top_navigation = page.get_by_test_id("path-top-navigation")
                activity_bar = page.get_by_test_id("path-activity-bar")
                expect(page.get_by_test_id("path-sidebar-wrap")).to_have_css("width", "300px")
                motion_samples = sample_sidebar_toggle(page, "收起侧栏")
                assert any(0 < sample["width"] < 300 for sample in motion_samples), motion_samples
                assert all(abs(sample["alignment"]) <= 1 for sample in motion_samples if sample["width"] >= 103), motion_samples
                assert all(sample["mainWidth"] >= 420 for sample in motion_samples), motion_samples
                expect(page.get_by_test_id("path-sidebar-wrap")).to_have_css("width", "0px")
                motion_samples = sample_sidebar_toggle(page, "展开侧栏")
                assert any(0 < sample["width"] < 300 for sample in motion_samples), motion_samples
                assert all(abs(sample["alignment"]) <= 1 for sample in motion_samples if sample["width"] >= 103), motion_samples
                expect(page.get_by_test_id("path-sidebar-wrap")).to_have_css("width", "300px")
                # Respect reduced motion without changing the expanded width.
                page.emulate_media(reduced_motion="reduce")
                reduced_samples = sample_sidebar_toggle(page, "收起侧栏")
                assert all(sample["width"] == 0 for sample in reduced_samples), reduced_samples
                page.get_by_role("button", name="展开侧栏").click()
                expect(page.get_by_test_id("path-sidebar-wrap")).to_have_css("width", "300px")
                page.emulate_media(reduced_motion="no-preference")
                expect(top_navigation.get_by_role("button", name="文件列表")).to_be_visible()
                expect(top_navigation.get_by_role("button", name="搜索")).to_be_visible()
                expect(activity_bar.get_by_role("button", name="导师")).to_be_visible()
                expect(activity_bar.get_by_role("button", name="知识图谱")).to_be_visible()
                assert activity_bar.get_by_role("button").count() == 2
                assert "active" not in (activity_bar.get_by_role("button", name="知识图谱").get_attribute("class") or "").lower()
                expect(page.get_by_text("当前计划", exact=True)).to_have_count(0)
                expect(page.get_by_test_id("file-tree").get_by_text("我的规划", exact=True)).to_be_visible()
                assert model["data"]["files"][0]["id"] == "folder-plan"

                page.get_by_role("button", name="导师").click()
                expect(page.get_by_text("我的导师", exact=True)).to_be_visible()
                page.get_by_role("button", name="文件列表").click()
                expect(page.get_by_test_id("file-tree")).to_be_visible()

                expand_button = page.get_by_role("button", name="全部展开")
                tree = page.get_by_test_id("file-tree")
                expanded_folders = tree.locator('[class*="folderChildren"][class*="folderExpanded"]')
                expect(expanded_folders).to_have_count(0)
                expand_button.click()
                expect(expanded_folders).to_have_count(3)
                expect(tree.get_by_text("测试笔记", exact=True)).to_be_visible()
                collapse_button = page.get_by_role("button", name="全部折叠")
                collapse_button.click()
                expect(expanded_folders).to_have_count(0)
                page.get_by_role("button", name="全部展开").click()

                for action_name in ("新建笔记", "新建文件夹", "导入", "排序"):
                    expect(page.get_by_role("button", name=action_name)).to_be_visible()
                page.get_by_role("button", name="导入").click()
                expect(page.get_by_text("导入文件", exact=True)).to_be_visible()
                expect(page.get_by_text("导入文件夹", exact=True)).to_be_visible()
                page.keyboard.press("Escape")
                page.get_by_role("button", name="排序").click()
                expect(page.get_by_text("按名称", exact=True)).to_be_visible()
                page.get_by_text("按名称", exact=True).click()

                toolbar_box = page.get_by_test_id("file-toolbar-actions").bounding_box()
                sidebar_box = page.get_by_test_id("path-sidebar").bounding_box()
                assert toolbar_box and sidebar_box
                toolbar_center = toolbar_box["x"] + toolbar_box["width"] / 2
                sidebar_center = sidebar_box["x"] + sidebar_box["width"] / 2
                assert abs(toolbar_center - sidebar_center) < 2
                page.wait_for_timeout(1800)
                assert any(file["id"] == "folder-plan" for file in model["data"]["files"])

                graph_button = activity_bar.get_by_role("button", name="知识图谱", exact=True)
                graph_button.click()
                graph_button.click()
                expect(page.get_by_text("知识图谱", exact=True)).to_have_count(2)

                page.get_by_role("button", name="文件列表").click()
                expect(page.get_by_test_id("file-tree")).to_be_visible()
                expect(page.get_by_text("知识图谱", exact=True)).to_have_count(2)

                page.get_by_role("button", name="搜索").click()
                expect(page.get_by_placeholder("搜索笔记内容...")).to_be_visible()
                expect(page.get_by_text("知识图谱", exact=True)).to_have_count(2)
                page.get_by_placeholder("搜索笔记内容...").fill("图谱切换后的正文")
                page.get_by_test_id("path-sidebar").get_by_text("图谱切换后的正文", exact=True).last.click()
                editor = page.locator('.vditor-ir [contenteditable="true"]')
                expect(editor).to_be_visible(timeout=30000)
                expect(editor).to_contain_text("图谱切换后的正文")

                page.get_by_test_id("graph-tab").click()
                expect(page.get_by_text("知识图谱", exact=True)).to_have_count(2)
                page.get_by_role("button", name="文件列表").click()
                expect(page.get_by_text("知识图谱", exact=True)).to_have_count(2)
                tree.get_by_text("测试笔记", exact=True).click()
                expect(editor).to_be_visible(timeout=30000)
                expect(editor).to_contain_text("图谱切换后的正文")

                graph_button.click()
                graph_canvas = page.get_by_test_id("path-main-area").locator("canvas")
                expect(graph_canvas).to_be_visible()
                separator = page.get_by_role("separator", name="调整侧栏宽度")
                sidebar_wrap = page.get_by_test_id("path-sidebar-wrap")
                expect(separator).to_be_visible()
                divider_box = separator.bounding_box()
                assert divider_box
                drag_separator(page, separator, divider_box["x"] + divider_box["width"] / 2 + 100)
                expect(sidebar_wrap).to_have_css("width", "400px")
                expect(graph_canvas).to_be_visible()
                page.get_by_role("button", name="收起侧栏").click()
                expect(sidebar_wrap).to_have_css("width", "0px")
                page.get_by_role("button", name="展开侧栏").click()
                expect(sidebar_wrap).to_have_css("width", "400px")
                page.screenshot(path=str(runs_dir / f"path-graph-resize-{viewport['width']}.png"), full_page=True)

                drag_separator(page, separator, viewport["width"] - 10)
                main_box = page.get_by_test_id("path-main-area").bounding_box()
                sidebar_box = sidebar_wrap.bounding_box()
                assert main_box and main_box["width"] >= 420
                assert sidebar_box and sidebar_box["width"] <= 560
                page.wait_for_timeout(150)
                canvas_box = graph_canvas.bounding_box()
                assert canvas_box and abs(canvas_box["width"] - main_box["width"]) < 2
                page.set_viewport_size({"width": 900, "height": viewport["height"]})
                page.wait_for_function("document.querySelector('[data-testid=path-main-area]').getBoundingClientRect().width >= 420")
                assert page.get_by_test_id("path-main-area").bounding_box()["width"] >= 420
                page.set_viewport_size(viewport)

                drag_separator(page, separator, 0)
                expect(sidebar_wrap).to_have_css("width", "0px")
                expect(page.get_by_role("button", name="展开侧栏")).to_be_visible()
                expect(graph_canvas).to_be_visible()

                divider_box = separator.bounding_box()
                assert divider_box
                drag_separator(page, separator, divider_box["x"] + divider_box["width"] / 2 + 240)
                expect(sidebar_wrap).to_have_css("width", "240px")
                expect(page.get_by_role("button", name="收起侧栏")).to_be_visible()
                expect(page.get_by_text("知识图谱", exact=True)).to_have_count(2)
                separator.focus()
                separator.press("ArrowLeft")
                expect(sidebar_wrap).to_have_css("width", "216px")
                separator.press("ArrowRight")
                expect(sidebar_wrap).to_have_css("width", "240px")
                separator.press("Home")
                expect(page.get_by_role("button", name="展开侧栏")).to_be_visible()
                separator.press("ArrowRight")
                expect(sidebar_wrap).to_have_css("width", "240px")
                tree.get_by_text("测试笔记", exact=True).click()
                expect(editor).to_be_visible(timeout=30000)

                page.get_by_role("button", name="新建文件夹").click()
                expect(tree.get_by_text("新建文件夹", exact=True)).to_be_visible()
                page.get_by_role("button", name="新建笔记").click()
                expect(page.get_by_role("textbox", name="输入文件名...")).to_have_value("未命名笔记")
                page.wait_for_timeout(1800)
                assert len(writes) > 0
                assert any(file["name"] == "新建文件夹" for file in model["data"]["files"])
                assert any(file["name"] == "未命名笔记" for file in model["data"]["files"])

                body_width = page.evaluate("document.body.scrollWidth")
                viewport_width = page.evaluate("window.innerWidth")
                assert body_width <= viewport_width
                assert not errors, errors
                unexpected_console_errors = [error for error in console_errors if "[antd: message] Static function can not consume context" not in error]
                assert not unexpected_console_errors, unexpected_console_errors
                page.screenshot(path=str(runs_dir / f"path-layout-{viewport['width']}.png"), full_page=True)
                print(f"PASS: learning workspace layout at {viewport['width']}x{viewport['height']}", flush=True)
            except Exception:
                failure = Path(__file__).parent / f"path-layout-{viewport['width']}-failure.png"
                page.screenshot(path=str(failure), full_page=True)
                print(json.dumps({"errors": errors, "console_errors": console_errors, "url": page.url}, ensure_ascii=False), flush=True)
                raise
            finally:
                context.close()
    finally:
        browser.close()
