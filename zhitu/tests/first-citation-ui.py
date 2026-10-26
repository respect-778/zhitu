import json
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
fixture = json.loads(os.environ["FIRST_CITATION_UI_FIXTURE"])
frontend_url = fixture["frontendUrl"].rstrip("/")
backend_url = fixture["baseUrl"].rstrip("/")
errors = []
citation_responses = []
artifact_dir = Path(__file__).parents[1] / ".agent-workflow/tasks/first-citation-initialization/runs"
artifact_dir.mkdir(parents=True, exist_ok=True)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True, executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    )
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    context.add_init_script(
        "localStorage.setItem('userId', %s);localStorage.setItem('token', %s);"
        "localStorage.setItem('username','ui-fresh');"
        % (json.dumps(str(fixture["userId"])), json.dumps(fixture["token"]))
    )

    def intercept(route):
        request = route.request
        endpoint = urlparse(request.url).path.removeprefix("/api")
        if endpoint in ("/growth/cite", "/growth/workspace"):
            # The actual controller, transaction and MySQL storage run in the isolated test server.
            response = route.fetch(url=backend_url + endpoint)
            if endpoint == "/growth/cite":
                citation_responses.append({"status": response.status, "body": response.json()})
            route.fulfill(response=response)
        elif endpoint == "/community/%s" % fixture["articleId"]:
            route.fulfill(json={"data": {
                "id": fixture["articleId"], "name": "测试作者", "avatar": "",
                "time": "2026-10-06T00:00:00Z", "title": fixture["title"],
                "content": fixture["articleContent"], "abstract": "首次引用验收文章",
                "art_count": 0, "likes": 0, "comments": 0, "collection": 0,
                "photo": [], "video": [], "isLiked": False, "isCollected": False,
            }})
        elif endpoint == "/community/hot":
            route.fulfill(json={"data": {"list": [], "total": 0}})
        elif endpoint == "/user/info":
            route.fulfill(json={"data": {"id": str(fixture["userId"]), "username": "ui-fresh", "email": "ui@example.invalid", "avatar": ""}, "message": "ok"})
        else:
            route.fulfill(json={"data": [], "message": "ok", "list": [], "total": 0})

    context.route(frontend_url + "/api/**", intercept)
    page = context.new_page()
    page.on("pageerror", lambda error: errors.append(str(error)))

    def snapshot():
        response = context.request.get(backend_url + "/growth/workspace", headers={"Authorization": "Bearer " + fixture["token"]})
        assert response.status == 200
        return response.json()

    def collect(text):
        paragraph = page.locator(".markdown-body p").filter(has_text=text).first
        expect(paragraph).to_be_visible(timeout=30000)
        paragraph.scroll_into_view_if_needed()
        paragraph.evaluate("""element => {
            const range = document.createRange();
            const textNode = element.firstChild;
            if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
                throw new Error('the fixture paragraph must contain plain text');
            }
            // A real mouse selection uses text-node offsets, which the toolbar reads.
            range.setStart(textNode, 0);
            range.setEnd(textNode, textNode.textContent.length);
            const selection = window.getSelection();
            selection.removeAllRanges(); selection.addRange(range);
            element.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
        }""")
        expect(page.get_by_role("button", name="添加引用")).to_be_visible()
        with page.expect_response(lambda response: urlparse(response.url).path.endswith("/growth/cite")) as response:
            page.get_by_role("button", name="添加引用").click()
        assert response.value.status == 200
        expect(page.get_by_text("已添加到引用收藏", exact=True).last).to_be_visible()

    def open_reference():
        expect(page.get_by_text("引用收藏", exact=True)).to_be_visible(timeout=30000)
        page.get_by_text("引用收藏", exact=True).click()
        expect(page.get_by_text(fixture["title"], exact=True).first).to_be_visible()
        page.get_by_text(fixture["title"], exact=True).first.click()
        editor = page.locator('.vditor-ir [contenteditable="true"]')
        expect(editor).to_be_visible(timeout=30000)
        return editor

    try:
        assert snapshot() == {"data": None, "revision": 0}
        page.goto(frontend_url + "/community/%s" % fixture["articleId"])
        page.wait_for_load_state("networkidle")
        assert snapshot() == {"data": None, "revision": 0}, "article reading must not initialize the planner"
        collect(fixture["paragraphs"][0])
        assert snapshot()["revision"] == 1
        print("PASS: a fresh user collects from the article page before visiting the planner", flush=True)

        page.goto(frontend_url + "/path")
        page.wait_for_load_state("networkidle")
        editor = open_reference()
        expect(editor).to_contain_text(fixture["paragraphs"][0])
        expect(page.get_by_role("status", name="学习规划保存状态")).to_have_text("未配置本地文件夹", timeout=15000)
        page.screenshot(path=str(artifact_dir / "first-reference-planner.png"), full_page=True)
        print("PASS: the planner displays the server-created folder and reference", flush=True)

        page.reload()
        page.wait_for_load_state("networkidle")
        editor = page.locator('.vditor-ir [contenteditable="true"]')
        expect(editor).to_contain_text(fixture["paragraphs"][0], timeout=30000)
        print("PASS: reloading restores the saved reference from MySQL", flush=True)

        page.goto(frontend_url + "/community/%s" % fixture["articleId"])
        page.wait_for_load_state("networkidle")
        collect(fixture["paragraphs"][0])
        assert citation_responses[-1]["body"]["data"]["duplicate"] is True
        collect(fixture["paragraphs"][1])
        files = [file for file in snapshot()["data"]["files"] if file.get("fileType") == "article_cite"]
        assert len(files) == 1
        assert len(files[0]["metadata"]["citations"]) == 2
        page.goto(frontend_url + "/path")
        page.wait_for_load_state("networkidle")
        editor = page.locator('.vditor-ir [contenteditable="true"]')
        expect(editor).to_contain_text(fixture["paragraphs"][0], timeout=30000)
        expect(editor).to_contain_text(fixture["paragraphs"][1])
        assert not errors, errors
        print("PASS: repeated excerpts are deduplicated and new excerpts append to the same source file", flush=True)
        print(json.dumps({"status": "passed", "page_errors": errors, "citation_statuses": [entry["status"] for entry in citation_responses]}, ensure_ascii=False), flush=True)
    except Exception:
        print(json.dumps({"status": "failed", "page_errors": errors, "url": page.url, "body": page.locator("body").inner_text()[:1500]}, ensure_ascii=False), flush=True)
        page.screenshot(path=str(artifact_dir / "first-reference-failure.png"), full_page=True)
        raise
    finally:
        context.close()
        browser.close()
