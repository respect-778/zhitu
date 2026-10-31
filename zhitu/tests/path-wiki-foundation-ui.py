import copy
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.environ.get("PATH_UI_BASE_URL", "http://127.0.0.1:5175")
INITIAL = {
    "revision": 4,
    "data": {
        "files": [
            {"id": "managed", "name": "知识库", "type": "folder", "parentId": None, "order": 0, "createdByKind": "bootstrap", "agentPermission": "manage"},
            {"id": "private", "name": "私人记录", "type": "folder", "parentId": None, "order": 1, "createdByKind": "user", "agentPermission": "none"},
            {"id": "target", "name": "拖拽目标", "type": "folder", "parentId": None, "order": 2, "createdByKind": "user", "agentPermission": "read"},
            {"id": "drag-note", "name": "待移动笔记", "type": "file", "parentId": None, "order": 3, "content": "拖拽样例", "createdByKind": "user", "agentPermission": "read", "metadata": {"createdAt": "2026-10-13T00:00:00.000Z", "updatedAt": "2026-10-13T00:00:00.000Z", "tags": ["相同标签不应成边"]}},
            {"id": "related", "name": "相关主题", "type": "file", "parentId": None, "order": 4, "content": "被链接内容", "createdByKind": "user", "agentPermission": "read", "metadata": {"createdAt": "2026-10-13T00:00:00.000Z", "updatedAt": "2026-10-13T00:00:00.000Z", "tags": ["相同标签不应成边"]}},
            {"id": "note", "name": "一篇名称很长用于验证悬停完整提示的 React 学习笔记", "type": "file", "parentId": "managed", "order": 0, "content": "编辑区应保持不变\n\n[[相关主题]]", "createdByKind": "user", "agentPermission": "read"},
            {"id": "blocked", "name": "父级屏蔽中的笔记", "type": "file", "parentId": "private", "order": 0, "content": "不可向 Agent 暴露", "createdByKind": "user", "agentPermission": "manage"},
        ],
        "openTabs": ["note"],
        "activeTabId": "note",
        "expandedFolderIds": ["managed", "private"],
        "activePlan": None,
        "mentorId": None,
        "wikiTemplateVersion": 1,
        "wikiInitializedAt": "2026-10-13T00:00:00.000Z",
    },
}

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
runs_dir = Path(__file__).parents[1] / ".agent-workflow" / "tasks" / "learning-wiki-foundation" / "runs"
runs_dir.mkdir(parents=True, exist_ok=True)


def drag_to_folder(page, source_id, target_id):
    source = page.locator(f'[data-file-id="{source_id}"]')
    target = page.locator(f'[data-file-id="{target_id}"]')
    source.scroll_into_view_if_needed()
    a = source.bounding_box()
    assert a
    page.mouse.move(a["x"]+60, a["y"]+a["height"]/2)
    page.mouse.down()
    page.mouse.move(a["x"]+68, a["y"]+a["height"]/2)
    expect(page.get_by_test_id("file-drag-overlay")).to_be_visible()
    # The root drop zone enters above the tree when dragging starts.
    b = target.bounding_box()
    assert b
    page.mouse.move(b["x"]+60, b["y"]+b["height"]/2, steps=5)
    expect(page.get_by_test_id("file-drag-overlay")).to_contain_text("移动到")
    page.mouse.up()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    try:
        for viewport in ({"width": 1440, "height": 1000}, {"width": 1024, "height": 768}):
            model = copy.deepcopy(INITIAL)
            writes = []
            errors = []

            def intercept(route):
                request = route.request
                endpoint = urlparse(request.url).path
                if endpoint.endswith("/growth/workspace"):
                    if request.method == "PUT":
                        payload = request.post_data_json
                        model["data"] = copy.deepcopy(payload["data"])
                        model["revision"] += 1
                        writes.append(copy.deepcopy(payload))
                    route.fulfill(json=copy.deepcopy(model))
                elif endpoint.endswith("/user/info"):
                    route.fulfill(json={"data": {"id": "100", "username": "test", "email": "test@example.invalid", "avatar": ""}, "message": "ok"})
                else:
                    route.fulfill(json={"data": [], "list": [], "total": 0, "message": "ok"})

            context = browser.new_context(viewport=viewport, permissions=["clipboard-read", "clipboard-write"])
            context.add_init_script("localStorage.setItem('userId','100');localStorage.setItem('token','wiki-ui-token');localStorage.setItem('username','test')")
            if viewport["width"] == 1024:
                context.add_init_script("localStorage.setItem('data-theme','dark')")
            context.route(f"{BASE_URL}/api/**", intercept)
            page = context.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(f"{BASE_URL}/path")
            page.wait_for_load_state("networkidle")

            editor = page.locator('.vditor-ir [contenteditable="true"]')
            expect(editor).to_contain_text("编辑区应保持不变")

            page.get_by_role("button", name="切换到阅读模式").click()
            internal_link = page.get_by_test_id("path-reading-view").get_by_role("link", name="相关主题")
            expect(internal_link).to_be_visible()
            internal_link.click()
            expect(page.get_by_test_id("path-tabs").get_by_role("tab", name="相关主题")).to_have_attribute("aria-selected", "true")
            page.get_by_test_id("path-tabs").get_by_role("tab", name="一篇名称很长用于验证悬停完整提示的 React 学习笔记").click()
            page.get_by_role("button", name="切换到编辑模式").click()
            editor.click()
            page.keyboard.press("Control+End")
            page.keyboard.press("Enter")
            page.keyboard.type("[[相关")
            expect(page.get_by_test_id("wiki-link-picker")).to_be_visible()
            expect(page.get_by_test_id("wiki-link-picker").get_by_role("option", name=re.compile("相关主题"))).to_be_visible()
            page.keyboard.press("Enter")
            expect(page.get_by_test_id("wiki-link-picker")).to_have_count(0)
            page.wait_for_timeout(1700)
            assert "[[相关主题]]" in next(item for item in model["data"]["files"] if item["id"] == "note")["content"]
            bindings = [item for item in model["data"]["linkBindings"] if item["sourceFileId"] == "note" and item["raw"] == "[[相关主题]]"]
            assert bindings and all(item["targetFileId"] == "related" and item["status"] == "resolved" for item in bindings)

            # A stable binding must survive a target rename without rewriting the user's Markdown.
            page.get_by_role("button", name="文件列表").click()
            related_row = page.locator('[data-file-id="related"]')
            related_row.click(button="right")
            page.get_by_text("重命名", exact=True).last.click()
            rename_input = related_row.locator("input")
            rename_input.fill("相关主题（已改名）")
            rename_input.press("Enter")
            page.wait_for_timeout(1700)
            assert next(item for item in model["data"]["files"] if item["id"] == "related")["name"] == "相关主题（已改名）"
            assert all(item["targetFileId"] == "related" and item["status"] == "resolved" for item in model["data"]["linkBindings"] if item["sourceFileId"] == "note")
            assert "[[相关主题]]" in next(item for item in model["data"]["files"] if item["id"] == "note")["content"]

            page.get_by_test_id("path-tabs").get_by_role("tab", name="一篇名称很长用于验证悬停完整提示的 React 学习笔记").click()
            page.get_by_role("button", name="切换到阅读模式").click()
            page.get_by_test_id("path-reading-view").get_by_role("link", name="相关主题").first.click()
            expect(page.get_by_test_id("path-tabs").get_by_role("tab", name="相关主题（已改名）")).to_have_attribute("aria-selected", "true")
            page.get_by_test_id("path-tabs").get_by_role("tab", name="一篇名称很长用于验证悬停完整提示的 React 学习笔记").click()

            # Moving into a hidden Agent scope requires explicit confirmation and preserves the binding.
            related_row = page.locator('[data-file-id="related"]')
            related_row.click(button="right")
            expect(page.get_by_role("menuitem", name="移动到…")).to_have_count(0)
            page.keyboard.press("Escape")
            page.locator('[data-file-id="private"]').click(button="right")
            expect(page.get_by_role("menuitem", name="移动到…")).to_have_count(0)
            page.keyboard.press("Escape")
            drag_to_folder(page, "related", "private")
            move_dialog = page.get_by_role("dialog", name="移动后 Agent 有效权限将改变")
            expect(move_dialog).to_be_visible()
            expect(page.get_by_text("只读 → 不可访问：1 项", exact=True)).to_be_visible()
            assert next(item for item in model["data"]["files"] if item["id"] == "related")["parentId"] is None
            move_dialog.locator(".ant-btn-default").click()
            expect(move_dialog).not_to_be_visible()
            expect(page.locator(".ant-modal-mask:visible")).to_have_count(0)
            assert next(item for item in model["data"]["files"] if item["id"] == "related")["parentId"] is None
            drag_to_folder(page, "related", "private")
            page.get_by_role("dialog", name="移动后 Agent 有效权限将改变").locator(".ant-btn-primary").click()
            page.wait_for_timeout(1700)
            assert next(item for item in model["data"]["files"] if item["id"] == "related")["parentId"] == "private"
            assert all(item["targetFileId"] == "related" and item["status"] == "resolved" for item in model["data"]["linkBindings"] if item["sourceFileId"] == "note")

            page.get_by_role("button", name="Agent 权限").click()
            expect(page.get_by_test_id("permission-tree-panel")).to_be_visible()
            expect(editor).to_contain_text("编辑区应保持不变")
            expect(page.get_by_text("仅限制 Agent，不影响你自己编辑。")).to_be_visible()

            long_name = page.get_by_test_id("permission-tree-panel").get_by_text("一篇名称很长用于验证悬停完整提示的 React 学习笔记", exact=True)
            expect(long_name).to_be_visible()
            assert long_name.evaluate("element => element.scrollWidth > element.clientWidth")
            long_name.hover()
            expect(page.get_by_text("一篇名称很长用于验证悬停完整提示的 React 学习笔记 · 用户创建", exact=True)).to_be_visible()

            blocked_button = page.get_by_role("button", name="父级屏蔽中的笔记 Agent 权限：不可访问")
            expect(blocked_button).to_be_visible()
            assert "父级" in (blocked_button.get_attribute("title") or "")

            note_permission = page.get_by_role("button", name="一篇名称很长用于验证悬停完整提示的 React 学习笔记 Agent 权限：只读")
            note_permission.click()
            # Wait for the intended debounced save, not a fixed 1.7s animation/network margin.
            with page.expect_response(lambda response:
                urlparse(response.url).path.endswith("/growth/workspace")
                and response.request.method == "PUT"
                and any(item["id"] == "note" and item.get("agentPermission") == "manage"
                        for item in response.request.post_data_json["data"]["files"])):
                page.get_by_role("menuitem", name="完全管理", exact=True).click()
            note = next(item for item in model["data"]["files"] if item["id"] == "note")
            assert note["agentPermission"] == "manage"

            folder_permission = page.get_by_role("button", name="知识库 Agent 权限：完全管理")
            folder_permission.click()
            page.get_by_text("不可访问", exact=True).last.click()
            expect(page.get_by_test_id("permission-impact-preview")).to_be_visible()
            assert next(item for item in model["data"]["files"] if item["id"] == "managed")["agentPermission"] == "manage"
            expect(page.get_by_role("button", name="确认更改 2 项")).to_be_visible()
            page.get_by_role("button", name="确认更改 2 项").click()
            page.wait_for_timeout(1700)
            assert all(item["agentPermission"] == "none" for item in model["data"]["files"] if item["id"] in {"managed", "note"})

            page.get_by_role("button", name="Markdown 说明").click()
            expect(page.get_by_test_id("markdown-guide-panel")).to_be_visible()
            expect(editor).to_contain_text("编辑区应保持不变")
            page.get_by_role("textbox", name="搜索 Markdown 说明").fill("圆点")
            expect(page.get_by_role("heading", name="列表与任务")).to_be_visible()
            expect(page.get_by_role("heading", name="标题")).to_have_count(0)
            expect(page.get_by_role("button", name="复制列表与任务示例")).to_have_count(0)
            expect(page.get_by_text("语法", exact=True)).to_be_visible()
            expect(page.get_by_text("示例", exact=True)).to_be_visible()
            expect(page.get_by_text("如何取消", exact=True)).to_be_visible()

            page.get_by_role("button", name="文件列表").click()
            source = page.locator('[data-file-id="drag-note"]')
            target = page.locator('[data-file-id="target"]')
            expect(source).to_be_visible()
            assert source.get_attribute("draggable") is None
            source_box = source.bounding_box()
            assert source_box
            page.mouse.move(source_box["x"] + 20, source_box["y"] + source_box["height"] / 2)
            page.mouse.down()
            page.mouse.move(source_box["x"] + 28, source_box["y"] + source_box["height"] / 2)
            expect(page.get_by_test_id("file-drag-overlay")).to_contain_text("待移动笔记")
            target_box = target.bounding_box()
            assert target_box
            page.mouse.move(target_box["x"] + 30, target_box["y"] + target_box["height"] / 2)
            expect(page.get_by_test_id("file-drag-overlay")).to_contain_text("移动到「拖拽目标」")
            writes_before_move = len(writes)
            page.mouse.up()
            page.wait_for_timeout(1700)
            assert next(item for item in model["data"]["files"] if item["id"] == "drag-note")["parentId"] == "target"
            assert len(writes) == writes_before_move + 1, "multi-resource move should enqueue one workspace update"

            drag_to_folder(page, "target", "private")
            page.get_by_role("dialog", name="移动后 Agent 有效权限将改变").locator(".ant-btn-primary").click()
            page.wait_for_timeout(1700)
            assert next(item for item in model["data"]["files"] if item["id"] == "target")["parentId"] == "private"
            assert next(item for item in model["data"]["files"] if item["id"] == "drag-note")["parentId"] == "target"

            page.get_by_role("button", name="知识图谱", exact=True).click()
            graph = page.get_by_test_id("knowledge-graph")
            expect(graph).to_be_visible()
            expect(graph).to_have_attribute("data-link-count", "1")
            expect(page.get_by_role("textbox", name="搜索知识图谱节点")).to_have_count(0)
            expect(page.get_by_role("button", name="放大知识图谱")).to_be_visible()
            expect(page.get_by_role("button", name="恢复知识图谱中心")).to_be_visible()
            page.wait_for_timeout(700)
            zoom_before = int(page.get_by_test_id("graph-zoom-label").inner_text().rstrip("%"))
            assert 20 <= zoom_before <= 125
            page.get_by_role("button", name="放大知识图谱").click()
            page.wait_for_timeout(180)
            zoom_after = int(page.get_by_test_id("graph-zoom-label").inner_text().rstrip("%"))
            assert zoom_before < zoom_after <= 400
            graph.hover(position={"x": 500, "y": 320})
            page.mouse.wheel(0, -120)
            page.wait_for_timeout(160)
            wheel_zoom = int(page.get_by_test_id("graph-zoom-label").inner_text().rstrip("%"))
            assert zoom_after < wheel_zoom <= 400

            # Permission-only updates must not rebuild the graph or move its camera.
            page.get_by_role("button", name="Agent 权限").click()
            # Its containing folder was just dragged into the denied scope.
            graph_permission = page.get_by_role("button", name="待移动笔记 Agent 权限：不可访问")
            assert "父级" in (graph_permission.get_attribute("title") or "")
            graph_permission.click()
            page.get_by_text("完全管理", exact=True).last.click()
            zoom_samples = []
            for _ in range(12):
                zoom_samples.append(int(page.get_by_test_id("graph-zoom-label").inner_text().rstrip("%")))
                page.wait_for_timeout(25)
            assert max(zoom_samples) - min(zoom_samples) <= 1, zoom_samples

            page.screenshot(path=str(runs_dir / f"wiki-panels-{viewport['width']}.png"), full_page=True)
            assert writes, "permission changes should use the existing save queue"
            assert errors == [], errors
            context.close()

        # New workspaces receive exactly four managed folders and five managed files.
        model = {"revision": 0, "data": None}

        def intercept_empty(route):
            request = route.request
            endpoint = urlparse(request.url).path
            if endpoint.endswith("/growth/workspace"):
                if request.method == "PUT":
                    payload = request.post_data_json
                    model["data"] = copy.deepcopy(payload["data"])
                    model["revision"] += 1
                route.fulfill(json=copy.deepcopy(model))
            elif endpoint.endswith("/user/info"):
                route.fulfill(json={"data": {"id": "101", "username": "new-user", "email": "new@example.invalid", "avatar": ""}, "message": "ok"})
            else:
                route.fulfill(json={"data": [], "list": [], "total": 0, "message": "ok"})

        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        context.add_init_script("localStorage.setItem('userId','101');localStorage.setItem('token','wiki-new-token');localStorage.setItem('username','new-user')")
        context.route(f"{BASE_URL}/api/**", intercept_empty)
        page = context.new_page()
        page.goto(f"{BASE_URL}/path")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1800)
        files = model["data"]["files"]
        assert len([item for item in files if item["type"] == "folder"]) == 4, files
        assert len([item for item in files if item["type"] == "file"]) == 5, files
        assert all(item["agentPermission"] == "manage" and item["createdByKind"] == "bootstrap" for item in files)
        assert model["data"]["wikiTemplateVersion"] == 1
        context.close()
    finally:
        browser.close()

print("path wiki foundation UI checks passed")
