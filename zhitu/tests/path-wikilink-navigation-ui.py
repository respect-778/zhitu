"""Wiki-note navigation uses real editor DOM and isolated, mocked workspaces."""

import copy
import os
import sys
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
BASE_URL = os.environ.get("PATH_UI_BASE_URL", "http://127.0.0.1:5175")
TITLE = "Obsidian 日常归档 Skill"
RAW = f"[[{TITLE}]]"
CONTENT = f"正文 {RAW} 继续编辑\n\n[[Skills/{TITLE}|归档入口]]\n\n`{RAW}`\n\n[[不存在的笔记]]\n\n[[重复笔记]]\n"
INITIAL = {"revision": 1, "data": {
    "files": [
        {"id": "skills", "name": "Skills", "type": "folder", "parentId": None, "order": 0},
        {"id": "source", "name": "测试来源", "type": "file", "parentId": None, "order": 1, "content": CONTENT},
        {"id": "target", "name": TITLE, "type": "file", "parentId": "skills", "order": 0, "content": "# 归档流程\n\n这是目标笔记。\n"},
        {"id": "other", "name": "其他目录", "type": "folder", "parentId": None, "order": 2},
        {"id": "duplicate-a", "name": "重复笔记", "type": "file", "parentId": "skills", "order": 1, "content": "第一份\n"},
        {"id": "duplicate-b", "name": "重复笔记", "type": "file", "parentId": "other", "order": 0, "content": "第二份\n"},
    ], "openTabs": ["source"], "activeTabId": "source", "expandedFolderIds": ["skills"],
    "activePlan": None, "mentorId": None, "wikiTemplateVersion": 1, "wikiInitializedAt": "2026-10-26T00:00:00Z",
}}


def text_point(editor, text, in_code=False):
    return editor.evaluate("""(root,{text,inCode})=>{
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
      let node;
      while(node=walker.nextNode()) {
        const marker=node.parentElement.closest('code,[data-type="code"],[data-type="code-block"]');
        const pre=node.parentElement.closest('pre');
        const code=!!((marker&&root.contains(marker))||(pre&&pre!==root&&root.contains(pre)));
        const start=node.data.replace(/\u00a0/g,' ').indexOf(text);
        if(start<0 || code!==inCode)continue;
        const range=document.createRange();range.setStart(node,start);range.setEnd(node,start+Math.min(text.length,7));
        const box=range.getBoundingClientRect();return{x:box.x+box.width/2,y:box.y+box.height/2};
      }
      throw new Error('Wiki text not found: '+root.innerHTML.slice(0,2400));
    }""", {"text": text, "inCode": in_code})


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    try:
        model, errors = copy.deepcopy(INITIAL), []
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        context.add_init_script("localStorage.setItem('userId','112');localStorage.setItem('token','wiki-test')")

        def intercept(route):
            endpoint = urlparse(route.request.url).path
            if endpoint.endswith("/growth/workspace"):
                if route.request.method == "PUT":
                    model["data"] = copy.deepcopy(route.request.post_data_json["data"])
                    model["revision"] += 1
                route.fulfill(json=copy.deepcopy(model))
            elif endpoint.endswith("/user/info"):
                route.fulfill(json={"data": {"id": "112", "username": "wiki-test", "email": "test@example.invalid", "avatar": ""}})
            else:
                route.fulfill(json={"data": [], "list": [], "total": 0, "message": "ok"})

        context.route(f"{BASE_URL}/api/**", intercept)
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(f"{BASE_URL}/path", wait_until="networkidle")
        editor = page.locator('.vditor-ir [contenteditable="true"]')
        expect(editor).to_contain_text(RAW)
        page.get_by_role("button", name="切换到阅读模式", exact=True).click()
        reading = page.get_by_test_id("path-reading-view")
        reading.get_by_role("link", name=TITLE, exact=True).click()
        expect(page.get_by_role("tab", name=TITLE, exact=True)).to_have_attribute("aria-selected", "true")
        print("PASS: existing reading-mode Wiki navigation", flush=True)

        page.get_by_role("tab", name="测试来源", exact=True).click()
        page.get_by_role("button", name="切换到编辑模式", exact=True).click()
        expect(editor).to_contain_text(RAW)
        editor.locator('[data-wiki-link-target-id="target"]').first.click()
        expect(page.get_by_role("tab", name=TITLE, exact=True)).to_have_attribute("aria-selected", "true")
        page.get_by_role("tab", name="测试来源", exact=True).click()
        page.keyboard.down("Control")
        editor.locator('[data-wiki-link-target-id="target"]').first.click()
        page.keyboard.up("Control")
        expect(page.get_by_role("tab", name=TITLE, exact=True)).to_have_attribute("aria-selected", "true")
        print("PASS: editing single click and Ctrl+click open the styled target", flush=True)
        page.get_by_role("tab", name="测试来源", exact=True).click()
        page.keyboard.down("Meta")
        editor.locator('[data-wiki-link-target-id="target"]').last.click()
        page.keyboard.up("Meta")
        expect(page.get_by_role("tab", name=TITLE, exact=True)).to_have_attribute("aria-selected", "true")
        page.get_by_role("tab", name="测试来源", exact=True).click()
        expect(editor).to_contain_text(RAW)
        point = text_point(editor, TITLE, in_code=True)
        page.keyboard.down("Control")
        page.mouse.click(point["x"], point["y"])
        page.keyboard.up("Control")
        expect(page.get_by_role("tab", name="测试来源", exact=True)).to_have_attribute("aria-selected", "true")
        for text, notice in (("不存在的笔记", "未找到对应笔记"), ("重复笔记", "此处有同名")):
            page.keyboard.down("Control")
            editor.locator(f'[data-wiki-link-label="{text}"]').click()
            page.keyboard.up("Control")
            expect(page.get_by_text(notice, exact=False)).to_be_visible()
            expect(page.get_by_role("tab", name="测试来源", exact=True)).to_have_attribute("aria-selected", "true")
        assert {f["id"] for f in model["data"]["files"]} == {f["id"] for f in INITIAL["data"]["files"]}
        print("PASS: aliases/Meta click; missing or ambiguous targets do not create or guess notes", flush=True)

        row = page.locator('[data-file-id="target"]')
        row.click(button="right")
        page.get_by_text("重命名", exact=True).last.click()
        rename = row.locator("input")
        rename.fill("归档流程（已改名）")
        rename.press("Enter")
        expect(row).to_contain_text("归档流程（已改名）")
        page.keyboard.down("Control")
        editor.locator('[data-wiki-link-target-id="target"]').first.click()
        page.keyboard.up("Control")
        expect(page.get_by_role("tab", name="归档流程（已改名）", exact=True)).to_have_attribute("aria-selected", "true")
        page.get_by_role("button", name="Markdown 说明", exact=True).click()
        page.get_by_role("textbox", name="搜索 Markdown 说明").fill("双链")
        guide = page.get_by_test_id("markdown-guide-panel")
        expect(guide.get_by_role("heading", name="笔记关联（双链）")).to_be_visible()
        expect(guide).to_contain_text("单击即可打开")
        expect(guide).to_contain_text("用上下键选择")
        expect(guide).to_contain_text(RAW)
        print("PASS: persisted target survives renaming; dedicated Wiki-link guide is searchable", flush=True)
        assert not errors, errors
        context.close()
    finally:
        browser.close()
print("Wiki navigation checks passed")
