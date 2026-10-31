"""Real Chromium OPFS/IndexedDB, mocked picker and APIs; never touches OS documents."""

import copy
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
BASE_URL = os.environ.get("PATH_UI_BASE_URL", "http://127.0.0.1:5175")
RUNS = Path(__file__).parents[1] / ".agent-workflow/tasks/storage-settings-status/runs"
WORKSPACE = {"revision": 8, "data": {
    "files": [{"id": "note", "name": "测试笔记", "type": "file", "parentId": None,
               "order": 0, "content": "# 隔离测试\n", "agentPermission": "read", "createdByKind": "user"}],
    "openTabs": ["note"], "activeTabId": "note", "expandedFolderIds": [],
    "activePlan": None, "mentorId": None, "wikiTemplateVersion": 1,
    "wikiInitializedAt": "2026-10-24T00:00:00.000Z",
}}
INIT = """(() => {
  localStorage.setItem('userId','2'); localStorage.setItem('token','directory-test');
  localStorage.setItem('data-theme','default');
  FileSystemDirectoryHandle.prototype.queryPermission=async ()=>'granted';
  FileSystemDirectoryHandle.prototype.requestPermission=async ()=>'granted';
  window.__pickerLevel='Documents'; window.__cancelPicker=false;
  window.__fixtureRoot=async ()=>(await navigator.storage.getDirectory()).getDirectoryHandle('Documents',{create:true});
  window.showDirectoryPicker=async () => {
    if(window.__cancelPicker) throw new DOMException('cancelled','AbortError');
    let root=await window.__fixtureRoot();
    if(window.__pickerLevel==='Documents') return root;
    root=await root.getDirectoryHandle('KNOWVIA',{create:true});
    if(window.__pickerLevel==='KNOWVIA') return root;
    return root.getDirectoryHandle(window.__pickerLevel,{create:true});
  };
  window.__readFixture=async () => {
    const files={};
    const walk=async (dir,prefix='')=>{
      for await(const [name,handle] of dir.entries()) {
        if(handle.kind==='directory') await walk(handle,prefix+name+'/');
        else files[prefix+name]=await (await handle.getFile()).text();
      }
    };
    await walk(await window.__fixtureRoot()); return files;
  };
  window.__editFixture=async (path,text)=>{
    const parts=path.split('/'),name=parts.pop();let dir=await window.__fixtureRoot();
    for(const part of parts) dir=await dir.getDirectoryHandle(part);
    const stream=await (await dir.getFileHandle(name)).createWritable();
    await stream.write(text);await stream.close();
  };
})();"""

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    context.add_init_script(INIT)
    model = {"growth": copy.deepcopy(WORKSPACE), "resume": {"revision": 1, "data": {"resumes": []}}}
    errors, checks = [], []

    def intercept(route):
        request, endpoint = route.request, urlparse(route.request.url).path
        if endpoint.endswith("/growth/workspace") or endpoint.endswith("/resume/workspace"):
            kind = "growth" if endpoint.endswith("/growth/workspace") else "resume"
            if request.method == "PUT":
                model[kind]["data"] = copy.deepcopy(request.post_data_json["data"])
                model[kind]["revision"] += 1
            route.fulfill(json=copy.deepcopy(model[kind]))
        elif endpoint.endswith("/user/info"):
            route.fulfill(json={"data": {"id": "2", "username": "directory-test", "email": "directory@example.invalid", "avatar": ""}, "message": "ok"})
        elif endpoint.endswith("/chat/getAiModel"):
            route.fulfill(json={"data": {"ai_name": "", "model_version": ""}, "message": "ok"})
        else:
            route.fulfill(json={"data": [], "list": [], "total": 0, "message": "ok"})

    context.route(f"{BASE_URL}/api/**", intercept)
    page = context.new_page()
    page.on("pageerror", lambda error: errors.append(str(error)))
    RUNS.mkdir(parents=True, exist_ok=True)
    try:
        page.goto(f"{BASE_URL}/setting#personal-directory", wait_until="networkidle")
        region = page.get_by_role("region", name="路径配置", exact=True)
        expect(region).to_be_visible()

        def choose(level):
            page.evaluate("level=>window.__pickerLevel=level", level)
            name = "选择电脑目录" if page.get_by_test_id("personal-directory-name").inner_text() == "未选择" else "更换电脑目录"
            region.get_by_role("button", name=name, exact=True).click()

        def read_disk():
            return page.evaluate("window.__readFixture()")

        expected_prefix = {"Documents": "Documents/KNOWVIA/user-2", "KNOWVIA": "KNOWVIA/user-2", "user-2": "user-2"}
        original_paths = None
        for level in ("Documents", "KNOWVIA", "user-2", "Documents"):
            choose(level)
            expect(page.get_by_test_id("personal-directory-name")).to_have_text(level)
            expect(region.get_by_role("status")).to_contain_text("本地副本已保存", timeout=15000)
            assert region.locator("code").all_text_contents() == [expected_prefix[level]+"/学习规划/", expected_prefix[level]+"/简历/"]
            files = read_disk()
            assert "KNOWVIA/user-2/学习规划/workspace.json" in files
            assert "KNOWVIA/user-2/简历/resumes.json" in files
            assert all(path.startswith("KNOWVIA/user-2/") for path in files), list(files)
            if original_paths is None:
                original_paths = sorted(files)
            else:
                assert sorted(files) == original_paths, "Selecting a different entry level duplicated files or manifests"
            checks.append(f"{level}: preview and existing account files reused")

        choose("user-2")
        expect(page.get_by_test_id("personal-directory-name")).to_have_text("user-2")
        expect(region.get_by_role("status")).to_contain_text("本地副本已保存")
        page.reload(wait_until="networkidle")
        expect(page.get_by_test_id("personal-directory-name")).to_have_text("user-2")
        expect(region.get_by_role("status")).to_contain_text("本地副本已保存", timeout=15000)
        assert region.locator("code").all_text_contents() == ["user-2/学习规划/", "user-2/简历/"]
        assert sorted(read_disk()) == original_paths
        checks.append("refresh restores the account-level IndexedDB binding without nesting")

        page.evaluate("window.__cancelPicker=true")
        region.get_by_role("button", name="更换电脑目录", exact=True).click()
        expect(page.get_by_test_id("personal-directory-name")).to_have_text("user-2")
        page.evaluate("window.__cancelPicker=false")
        checks.append("cancel keeps the previous account-level binding")

        choose("user-3")
        expect(region.get_by_role("alert")).to_contain_text("其他账号")
        expect(page.get_by_test_id("personal-directory-name")).to_have_text("user-2")
        assert sorted(read_disk()) == original_paths
        checks.append("foreign-account selection is rejected before rebinding or writing")

        collection = "KNOWVIA/user-2/学习规划/workspace.json"
        page.evaluate("([path,text])=>window.__editFixture(path,text)", [collection, "用户的手工修改：必须保留"])
        choose("KNOWVIA")
        expect(page.get_by_test_id("personal-directory-name")).to_have_text("KNOWVIA")
        expect(region.get_by_role("status")).to_contain_text("原文件已保留", timeout=15000)
        files = read_disk()
        assert files[collection] == "用户的手工修改：必须保留"
        assert "KNOWVIA/user-2/学习规划/workspace--平台副本.json" in files
        assert all(path.startswith("KNOWVIA/user-2/") for path in files)
        checks.append("manual edits survive entry-level changes; platform copy stays in the existing folder")

        region.get_by_role("button", name="立即保存副本", exact=True).click()
        expect(region.get_by_role("status")).to_contain_text("原文件已保留")
        region.get_by_role("button", name="处理本地差异", exact=True).click()
        dialog = page.get_by_role("dialog", name="处理本地文件差异", exact=True)
        expect(dialog).to_contain_text("不一定是你手工修改过")
        dialog.locator(".ant-btn-default").click()
        assert read_disk()[collection] == "用户的手工修改：必须保留"
        checks.append("rechecking cannot hide a real difference; cancelling recovery preserves the file")

        region.get_by_role("button", name="处理本地差异", exact=True).click()
        expect(dialog).to_be_visible()
        page.screenshot(path=str(RUNS / "directory-conflict-dialog.png"))
        dialog.get_by_role("button", name="保留原件并恢复备份", exact=True).click()
        expect(dialog).not_to_be_visible()
        expect(region.get_by_role("status")).to_contain_text("本地副本已保存", timeout=15000)
        expect(region.get_by_role("alert")).to_have_count(0)
        expect(region.get_by_role("button", name="处理本地差异", exact=True)).to_have_count(0)
        files = read_disk()
        preserved = [key for key in files if "--电脑原件-" in key]
        assert len(preserved) == 1 and files[preserved[0]] == "用户的手工修改：必须保留"
        assert json.loads(files[collection])["userId"] == "2"
        assert "KNOWVIA/user-2/学习规划/workspace--平台副本.json" in files
        checks.append("confirmed recovery preserves the original, restores canonical backup and clears the warning")
        page.reload(wait_until="networkidle")
        expect(region.get_by_role("status")).to_contain_text("本地副本已保存", timeout=15000)
        expect(region.get_by_role("alert")).to_have_count(0)
        assert read_disk()[preserved[0]] == "用户的手工修改：必须保留"
        checks.append("warning stays resolved after refreshing and restoring the directory binding")

        for width in (1440, 1024):
            page.set_viewport_size({"width": width, "height": 1000})
            region.scroll_into_view_if_needed()
            assert region.evaluate("el=>el.scrollWidth<=el.clientWidth+1"), "Directory hints overflow the panel"
            region.screenshot(path=str(RUNS / f"directory-reuse-{width}.png"))
        assert not errors, errors
        (RUNS / "directory-reuse-browser.json").write_text(json.dumps({"checks": checks, "files": sorted(files), "pageErrors": errors}, ensure_ascii=False, indent=2), encoding="utf-8")
        for check in checks:
            print("PASS: " + check, flush=True)
    except Exception:
        page.screenshot(path=str(RUNS / "directory-reuse-failure.png"), full_page=True)
        print("Browser errors:", errors, flush=True)
        raise
    finally:
        context.close()
        browser.close()
