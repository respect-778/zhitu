import copy
import json
import sys
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

model = {
    "revision": 1,
    "data": {
        "files": [
            {"id": "folder-notes", "name": "学习笔记", "type": "folder", "parentId": None, "order": 0},
            {"id": "folder-cite", "name": "引用收藏", "type": "folder", "parentId": None, "order": 1},
            {"id": "note-a", "name": "测试笔记", "type": "file", "parentId": "folder-notes", "content": "初始内容", "fileType": "note", "order": 0},
        ],
        "openTabs": ["note-a"], "activeTabId": "note-a", "expandedFolderIds": ["folder-notes"], "activePlan": None, "mentorId": None,
    },
}
writes = []
errors = []
console_errors = []
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
fail_next_save = False

def intercept(route):
    global fail_next_save
    request = route.request
    endpoint = urlparse(request.url).path
    if endpoint.endswith("/growth/workspace"):
        if request.method == "GET":
            route.fulfill(json=copy.deepcopy(model))
        elif request.method == "PUT":
            payload = request.post_data_json
            if fail_next_save:
                fail_next_save = False
                route.fulfill(status=503, json={"message": "测试中的临时网络失败"})
                return
            if payload.get("revision") != model["revision"]:
                route.fulfill(status=409, json={"message": "工作区已更新，本地修改已保留", "current": copy.deepcopy(model)})
                return
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

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    context.add_init_script("localStorage.setItem('userId','100');localStorage.setItem('token','isolated-ui-token');localStorage.setItem('username','test')")
    context.route("http://127.0.0.1:5175/api/**", intercept)
    page = context.new_page()
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda event: console_errors.append(event.text) if event.type == "error" else None)
    try:
        page.goto("http://127.0.0.1:5175/path")
        page.wait_for_load_state("networkidle")
        editor = page.locator('.vditor-ir [contenteditable="true"]')
        expect(editor).to_be_visible(timeout=30000)
        expect(editor).to_contain_text("初始内容")
        editor.fill("正常保存后的内容")
        expect(page.get_by_text("等待同步", exact=True)).to_be_visible(timeout=5000)
        expect(page.get_by_text("已保存", exact=True)).to_be_visible(timeout=15000)
        assert "正常保存后的内容" in next(file for file in model["data"]["files"] if file["id"] == "note-a")["content"]
        print("PASS: normal editor changes are saved with a revision", flush=True)

        editor.fill("马上切换导航的修改")
        page.get_by_text("简历制作", exact=True).first.click()
        expect(page).to_have_url("http://127.0.0.1:5175/resume")
        expect(editor).not_to_be_visible(timeout=15000)
        page.wait_for_timeout(1800)
        assert "马上切换导航的修改" in next(file for file in model["data"]["files"] if file["id"] == "note-a")["content"]
        print("PASS: navigation retains and flushes the latest edit", flush=True)
        page.get_by_text("学习规划", exact=True).first.click()
        expect(editor).to_be_visible(timeout=30000)
        expect(page.get_by_text("已保存", exact=True)).to_be_visible(timeout=15000)

        model["data"]["files"].append({"id": "remote-cite", "name": "另一页新增引用", "type": "file", "parentId": "folder-cite", "order": 0, "content": "远端引用内容", "fileType": "note"})
        model["revision"] += 1
        editor.fill("存在冲突的本地修改")
        expect(page.get_by_role("button", name="保留副本并更新")).to_be_visible(timeout=15000)
        assert any(file["id"] == "remote-cite" for file in model["data"]["files"])
        assert "存在冲突的本地修改" not in next(file for file in model["data"]["files"] if file["id"] == "note-a")["content"]
        expect(editor).to_contain_text("存在冲突的本地修改")
        page.get_by_role("button", name="保留副本并更新").click()
        expect(page.get_by_text("已保存", exact=True)).to_be_visible(timeout=15000)
        assert any(file["id"] == "remote-cite" for file in model["data"]["files"])
        assert any("本地副本" in file["name"] and "存在冲突的本地修改" in file.get("content", "") for file in model["data"]["files"])
        print("PASS: conflict keeps remote citations and recovers local edits as a copy", flush=True)

        fail_next_save = True
        editor.fill("失败后需要重试的修改")
        expect(page.get_by_role("button", name="重试同步")).to_be_visible(timeout=15000)
        page.get_by_role("button", name="重试同步").click()
        expect(page.get_by_text("已保存", exact=True)).to_be_visible(timeout=15000)
        assert any("失败后需要重试的修改" in file.get("content", "") for file in model["data"]["files"])
        print("PASS: failed saves keep the draft and retry successfully", flush=True)

        active_id = model["data"]["activeTabId"]
        next(file for file in model["data"]["files"] if file["id"] == active_id)["content"] = "另一页更新了同一篇笔记"
        model["revision"] += 1
        page.evaluate("window.dispatchEvent(new Event('focus'))")
        expect(editor).to_contain_text("另一页更新了同一篇笔记", timeout=15000)
        print("PASS: clean focus refresh updates the open editor", flush=True)
        assert not errors, errors
        print(json.dumps({"page_errors": errors, "successful_writes": len(writes), "status": "passed"}, ensure_ascii=False), flush=True)
    except Exception:
        print(json.dumps({"page_errors": errors, "console_errors": console_errors, "url": page.url, "body": page.locator("body").inner_text()[:1500]}, ensure_ascii=False), flush=True)
        page.screenshot(path=str(Path(__file__).parent / "workspace-ui-failure.png"), full_page=True)
        raise
    finally:
        context.close()
        browser.close()
