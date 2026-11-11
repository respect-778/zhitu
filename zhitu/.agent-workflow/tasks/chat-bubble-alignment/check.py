import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).parent
TEXTS = ['你好', '是不是因为加了一个 # 号，所以 useLocation 能够识别到这是 hash 呢', '这是一条用于检查自动换行的长消息。' * 30, '第一行\n第二行', 'x' * 500]

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe')
        page = await browser.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.add_init_script("localStorage.setItem('token','test-only');localStorage.setItem('userId','100');")
        async def mock(route):
            url = route.request.url
            data = {}
            if '/user/info' in url: data = {'id':100, 'username':'test'}
            elif '/chat/history' in url: data = [{'uuid':'alignment-test','session_title':'气泡对齐检查','created_at':'2026-11-09T00:00:00Z'}]
            elif '/chat/getMessage' in url: data = [{'id':i+1, 'role':'user', 'content':v} for i,v in enumerate(TEXTS)] + [{'id':9,'role':'ai','content':'用于检查 AI 回复边界的长段落。' * 100}]
            elif '/chat/getAiModel' in url: data = {'ai_name':'', 'model_version':''}
            await route.fulfill(json={'code':200,'data':data})
        await page.route('http://localhost:5174/api/**', mock)
        await page.goto('http://localhost:5174/chat/alignment-test')
        await page.wait_for_timeout(2000)
        await page.locator('[class*="userQuestion"]').first.wait_for()
        results = []
        for width in [2543, 1920, 1440, 768, 390]:
            await page.set_viewport_size({'width':width,'height':1000})
            await page.wait_for_timeout(150)
            result = await page.evaluate('''() => {
                const rect = e => { const r=e.getBoundingClientRect(); return {left:r.left,right:r.right,width:r.width,height:r.height,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,boxSizing:getComputedStyle(e).boxSizing}; };
                return {users:[...document.querySelectorAll('[class*="userQuestion"]')].map(rect), ai:rect(document.querySelector('[class*="aiReply"]')), conversation:rect(document.querySelector('[class*="chatConversation"]'))};
            }''')
            results.append({'viewport':width, **result})
            for bubble in result['users']:
                assert abs(bubble['right'] - result['ai']['right']) < 1, (width, bubble)
                assert bubble['left'] >= result['conversation']['left'], (width, bubble)
                assert bubble['scrollWidth'] <= bubble['clientWidth'] + 1, (width, bubble)
            assert result['conversation']['scrollWidth'] <= result['conversation']['clientWidth'] + 1
            assert result['users'][0]['width'] < result['users'][2]['width']
            assert result['users'][0]['height'] < result['users'][2]['height']
            print(f'PASS viewport={width}: all five bubble right edges aligned; no horizontal overflow')
        assert not errors, errors
        (ROOT / 'runs').mkdir(exist_ok=True)
        (ROOT / 'runs' / 'measurements.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
        await page.set_viewport_size({'width':1440,'height':1000})
        await page.locator('[class*="userQuestion"]').first.scroll_into_view_if_needed()
        await page.screenshot(path=str(ROOT / 'runs' / 'alignment-1440.png'))
        await browser.close()

asyncio.run(main())
