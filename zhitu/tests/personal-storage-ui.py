import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
fixture = json.loads(os.environ["PERSONAL_STORAGE_UI_FIXTURE"])
frontend = fixture["frontendUrl"].rstrip("/")
backend = fixture["baseUrl"].rstrip("/")
artifacts = Path(__file__).parents[1] / ".agent-workflow/tasks/storage-settings-status/runs"
artifacts.mkdir(parents=True, exist_ok=True)
results, errors = [], []
legacy = {"id": "legacy-ui", "title": "迁移简历", "templateId": "minimalist", "createdAt": "2026-10-07", "updatedAt": "2026-10-07", "basic": {"name": "旧缓存同学"}}


def passed(label):
    results.append(label)
    print("PASS: " + label, flush=True)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    init_script = """fixture => {
      localStorage.setItem('userId', fixture.userId);
      localStorage.setItem('token', fixture.token);
      localStorage.setItem('username', 'personal-storage-test');
      if (!sessionStorage.getItem('legacy-seeded')) {
        localStorage.setItem('zhitu_resumes_' + fixture.userId, JSON.stringify([fixture.legacy]));
        sessionStorage.setItem('legacy-seeded', '1');
      }
      window.__backupPermission = sessionStorage.getItem('backup-permission') || 'granted';
      window.__cancelPicker = false;
      // Native OS picker is simulated. All directory/stream/IndexedDB operations are real Chromium APIs.
      FileSystemDirectoryHandle.prototype.queryPermission = async () => window.__backupPermission;
      FileSystemDirectoryHandle.prototype.requestPermission = async () => {
        sessionStorage.setItem('backup-permission', 'granted'); return (window.__backupPermission = 'granted');
      };
      window.showDirectoryPicker = async () => {
        if (window.__cancelPicker) throw new DOMException('cancelled', 'AbortError');
        return (await navigator.storage.getDirectory()).getDirectoryHandle('验收个人目录', {create: true});
      };
    }"""
    context.add_init_script("(" + init_script + ")(" + json.dumps({**fixture, "legacy": legacy}) + ");")

    fail_resume_save = False
    def intercept(route):
        endpoint = urlparse(route.request.url).path.removeprefix("/api")
        if endpoint in ("/growth/workspace", "/resume/workspace"):
            if fail_resume_save and endpoint == "/resume/workspace" and route.request.method == "PUT":
                route.fulfill(status=503, json={"message": "isolated save failure"})
                return
            response = route.fetch(url=backend + endpoint)
            route.fulfill(response=response)
        elif endpoint == "/user/info":
            route.fulfill(json={"data": {"id": fixture["userId"], "username": "personal-storage-test", "email": "test@example.invalid", "avatar": ""}, "message": "ok"})
        elif endpoint == "/chat/getAiModel":
            route.fulfill(json={"data": {"ai_name": "", "model_version": ""}, "message": "ok"})
        else:
            route.fulfill(json={"data": [], "message": "ok", "list": [], "total": 0})
    context.route(frontend + "/api/**", intercept)
    page = context.new_page()
    page.on("pageerror", lambda error: errors.append(str(error)))

    def cloud(kind="resume", token=None):
        response = context.request.get(backend + "/" + kind + "/workspace", headers={"Authorization": "Bearer " + (token or fixture["token"])})
        assert response.status == 200
        return response.json()

    def until(check, timeout=30):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if check():
                return
            page.wait_for_timeout(150)
        raise AssertionError("condition was not reached within %s seconds" % timeout)

    def disk():
        return page.evaluate("""async () => {
          const result = {}, root = await (await navigator.storage.getDirectory()).getDirectoryHandle('验收个人目录');
          async function visit(folder, prefix) {
            for await (const [name, entry] of folder.entries()) {
              if (entry.kind === 'directory') await visit(entry, prefix + name + '/');
              else result[prefix + name] = await (await entry.getFile()).text();
            }
          }
          await visit(root, ''); return result;
        }""")

    return_url = frontend + "/resume"
    def settings():
        global return_url
        return_url = page.url
        if "/resume/" in return_url:
            page.get_by_role("button", name="返回", exact=True).click()
            expect(page).to_have_url(frontend + "/resume")
        page.locator("header").get_by_alt_text("头像", exact=True).click()
        page.get_by_role("menuitem").filter(has_text=re.compile(r"设置")).click()
        expect(page).to_have_url(frontend + "/setting")
        page.get_by_role("button", name="路径配置", exact=True).click()
        expect(page.get_by_role("region", name="路径配置")).to_be_visible()

    def close_settings():
        page.get_by_role("button", name="返回", exact=True).click()
        if "/resume/" in return_url:
            expect(page).to_have_url(frontend + "/resume")
            page.go_back()
        expect(page).to_have_url(return_url)

    try:
        page.goto(frontend + "/resume")
        page.wait_for_load_state("networkidle")
        expect(page.get_by_text("迁移简历", exact=True)).to_be_visible(timeout=30000)
        until(lambda: cloud()["data"] is not None)
        expect(page.get_by_role("status", name="简历保存状态")).to_have_text("未配置本地文件夹", timeout=20000)
        expect(page.get_by_role("button", name="个人资料存储", exact=True)).to_have_count(0)
        assert page.evaluate("uid => localStorage.getItem('zhitu_resume_migrated_' + uid)", fixture["userId"]) == "1"
        passed("legacy cache migrated and marked complete only after server acknowledgement")

        page.goto(frontend + "/resume/legacy-ui")
        page.wait_for_load_state("networkidle")
        name_input = page.locator("label").filter(has_text=re.compile(r"^姓名$")).locator("..").locator("input")
        expect(name_input).to_have_value("旧缓存同学", timeout=20000)
        name_input.fill("导航前最后一次修改")
        page.get_by_role("button", name="返回", exact=True).click()
        until(lambda: cloud()["data"]["resumes"][0]["basic"]["name"] == "导航前最后一次修改")
        passed("editing followed immediately by SPA navigation flushes the latest draft")

        settings()
        page.get_by_role("button", name="选择电脑目录", exact=True).click()
        expect(page.get_by_text("本地副本已保存", exact=False)).to_be_visible(timeout=20000)
        resume_path = "KNOWVIA/user-%s/简历/resumes.json" % fixture["userId"]
        workspace_path = "KNOWVIA/user-%s/学习规划/workspace.json" % fixture["userId"]
        until(lambda: resume_path in disk() and workspace_path in disk())
        assert json.loads(disk()[resume_path])["data"]["resumes"][0]["basic"]["name"] == "导航前最后一次修改"
        page.screenshot(path=str(artifacts / "shared-directory.png"))
        close_settings()
        expect(page.get_by_role("status", name="简历保存状态")).to_have_text("已保存到本地文件夹", timeout=20000)
        expect(page.get_by_role("status", name="简历保存状态")).to_have_css("color", "rgb(56, 158, 13)")
        expect(page.get_by_text("已保存到服务器", exact=True)).to_have_count(0)
        page.screenshot(path=str(artifacts / "resume-local-status.png"))
        passed("one directory binding writes real resume JSON and learning workspace JSON")

        page.goto(frontend + "/path")
        page.wait_for_load_state("networkidle")
        return_url = page.url
        page.get_by_role("button", name="路径配置", exact=True).click()
        expect(page).to_have_url(frontend + "/setting#personal-directory")
        expect(page.get_by_test_id("personal-directory-name")).to_have_text("验收个人目录")
        expect(page.get_by_role("region", name="路径配置")).to_contain_text("验收个人目录/KNOWVIA/user-%s/学习规划/" % fixture["userId"])
        expect(page.get_by_role("region", name="路径配置")).to_contain_text("验收个人目录/KNOWVIA/user-%s/简历/" % fixture["userId"])
        close_settings()
        page.get_by_title("新建笔记", exact=True).click()
        editor = page.locator('.vditor-ir [contenteditable="true"]')
        expect(editor).to_be_visible(timeout=30000)
        editor.fill("这是一段需要同时保存到服务器和电脑目录的学习记录。")
        until(lambda: any(file.get("name") == "未命名笔记" and "学习记录" in file.get("content", "") for file in cloud("growth")["data"]["files"]))
        until(lambda: any(name.endswith(".md") and "学习记录" in content for name, content in disk().items()))
        expect(page.get_by_role("status", name="学习规划保存状态")).to_have_text("已保存到本地文件夹", timeout=20000)
        expect(page.get_by_role("status", name="学习规划保存状态")).to_have_css("color", "rgb(56, 158, 13)")
        page.screenshot(path=str(artifacts / "learning-local-status.png"))
        passed("learning editor changes produce real Markdown through the same persisted directory handle")

        page.evaluate("localStorage.clear()")
        page.goto(frontend + "/resume/legacy-ui")
        page.wait_for_load_state("networkidle")
        expect(name_input).to_have_value("导航前最后一次修改", timeout=30000)
        settings()
        expect(page.get_by_test_id("personal-directory-name")).to_have_text("验收个人目录")
        close_settings()
        passed("clearing browser cache restores resume from MySQL and directory handle from IndexedDB")

        settings()
        page.evaluate("window.__cancelPicker = true")
        page.get_by_role("button", name="更换电脑目录", exact=True).click()
        expect(page.get_by_role("button", name="解除目录绑定")).to_be_visible()
        close_settings()
        page.evaluate("sessionStorage.setItem('backup-permission', 'denied'); window.__backupPermission = 'denied'")
        name_input.fill("权限失效服务器仍保存")
        until(lambda: cloud()["data"]["resumes"][0]["basic"]["name"] == "权限失效服务器仍保存")
        expect(page.get_by_role("status", name="简历保存状态")).to_have_text("本地文件夹需要重新授权", timeout=20000)
        settings()
        expect(page.get_by_text("目录需要重新授权", exact=False)).to_be_visible(timeout=20000)
        page.get_by_role("button", name="重新授权", exact=True).click()
        expect(page.get_by_text("本地副本已保存", exact=False)).to_be_visible(timeout=20000)
        close_settings()
        passed("picker cancellation retains binding; revoked permissions do not block cloud and explicit reauthorization resumes backup")

        # Force a real remote edit while the page still has the old revision, then exercise visible conflict recovery.
        snapshot = cloud()
        remote = snapshot["data"]
        remote["resumes"][0]["basic"]["name"] = "远端编辑者"
        response = context.request.put(backend + "/resume/workspace", headers={"Authorization": "Bearer " + fixture["token"]}, data={"data": remote, "revision": snapshot["revision"]})
        assert response.status == 200
        name_input.fill("本地冲突编辑者")
        expect(page.get_by_role("status", name="简历保存状态")).to_have_text("版本冲突，修改已保留", timeout=20000)
        page.get_by_role("button", name="保留副本并更新", exact=True).click()
        until(lambda: len(cloud()["data"]["resumes"]) == 2)
        assert {r["basic"]["name"] for r in cloud()["data"]["resumes"]} == {"远端编辑者", "本地冲突编辑者"}
        passed("a real stale revision returns 409 and visible recovery preserves both remote and local versions")

        fail_resume_save = True
        name_input.fill("仅本地落盘不能显示绿色")
        expect(page.get_by_role("status", name="简历保存状态")).to_have_text("同步失败，修改已保留", timeout=20000)
        until(lambda: any(r["basic"]["name"] == "仅本地落盘不能显示绿色" for r in json.loads(disk()[resume_path])["data"]["resumes"]))
        assert json.loads(disk()[resume_path])["cloudConfirmed"] is False
        assert all(r["basic"]["name"] != "仅本地落盘不能显示绿色" for r in cloud()["data"]["resumes"])
        expect(page.get_by_role("status", name="简历保存状态")).to_have_attribute("data-save-tone", "warning")
        passed("real local writes with a failed server save never display green success")
        fail_resume_save = False
        page.get_by_role("button", name="重试同步", exact=True).click()
        until(lambda: any(r["basic"]["name"] == "仅本地落盘不能显示绿色" for r in cloud()["data"]["resumes"]))
        expect(page.get_by_role("status", name="简历保存状态")).to_have_text("已保存到本地文件夹", timeout=20000)

        # Existing local files must survive manual modification.
        page.evaluate("""async uid => {
          let folder = await (await navigator.storage.getDirectory()).getDirectoryHandle('验收个人目录');
          for (const name of ['KNOWVIA', 'user-' + uid, '简历']) folder = await folder.getDirectoryHandle(name);
          const file = await folder.getFileHandle('resumes.json');
          const stream = await file.createWritable(); await stream.write('用户手工修改，禁止覆盖'); await stream.close();
        }""", fixture["userId"])
        page.get_by_role("textbox", name="简历名称", exact=True).fill("触发电脑文件保护")
        settings()
        expect(page.get_by_text("原文件已保留，已另存平台副本", exact=False)).to_be_visible(timeout=20000)
        assert disk()[resume_path] == "用户手工修改，禁止覆盖"
        assert any(name.endswith("resumes--平台副本.json") for name in disk())
        close_settings()
        passed("manual computer-file changes survive and platform writes a separate sibling copy")

        page.set_viewport_size({"width": 1024, "height": 800})
        settings()
        expect(page.get_by_role("button", name="更换电脑目录", exact=True)).to_be_visible()
        box = page.get_by_role("region", name="路径配置").bounding_box()
        assert box["x"] >= 0 and box["x"] + box["width"] <= 1024
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.screenshot(path=str(artifacts / "directory-protection.png"), animations="disabled")
        close_settings()
        expect(page.get_by_role("status", name="简历保存状态")).to_have_text("原文件已保留，已另存副本", timeout=20000)
        expect(page.get_by_role("status", name="简历保存状态")).to_have_attribute("data-save-tone", "warning")
        page.goto(frontend + "/resume")
        page.wait_for_load_state("networkidle")
        expect(page.get_by_role("button", name="个人资料存储", exact=True)).to_have_count(0)
        passed("the inline settings panel fits a 1024px viewport and both resume views omit directory buttons")
        assert not errors, errors
        output = {"status": "passed", "scenarios": results, "pageErrors": errors, "nativePicker": "simulated", "filesystem": "real Chromium OPFS directory and streams", "database": "isolated real MySQL"}
        (artifacts / "personal-storage-browser.json").write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        print(json.dumps({"status": "failed", "errors": errors, "url": page.url, "body": page.locator("body").inner_text()[:2500]}, ensure_ascii=False), flush=True)
        page.screenshot(path=str(artifacts / "personal-storage-failure.png"))
        raise
    finally:
        context.close()
        browser.close()
