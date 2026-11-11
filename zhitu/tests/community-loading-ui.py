import asyncio
import json
import os
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright, expect

BASE = os.environ.get('COMMUNITY_UI_URL', 'http://localhost:5174')
RUNS = Path(__file__).parents[1] / '.agent-workflow/tasks/community-loading/runs'

async def main():
    RUNS.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe')
        for width, theme in [(1440, 'default'), (768, 'dark'), (390, 'default')]:
            context = await browser.new_context(viewport={'width': width, 'height': 1000})
            await context.add_init_script("localStorage.setItem('userId','100');localStorage.setItem('token','test-only');localStorage.setItem('data-theme'," + json.dumps(theme) + ");")
            state = {'fail': False}
            errors = []
            async def mock(route):
                path = urlparse(route.request.url).path
                if path.endswith('/user/info'):
                    return await route.fulfill(json={'data': {'id': 100, 'username': 'test', 'avatar': ''}})
                if path.endswith('/earlyReport'):
                    return await route.fulfill(json={'data': {}})
                query = parse_qs(urlparse(route.request.url).query).get('keyword', [''])[0]
                if query:
                    await asyncio.sleep(2 if query == 'old' else .4)
                    return await route.fulfill(json={'data': {'list': [{'id': 1, 'post_id': 1, 'title': query, 'username': 'Knowvia', 'created_at': '2026-11-09'}], 'count': 1}})
                await asyncio.sleep(1)
                if state['fail'] and path.endswith('/history'):
                    return await route.fulfill(status=500, json={'message': 'test failure'})
                data = [] if path.endswith(('/following', '/folders')) else {'list': [], 'count': 0, 'total': 0, 'pageNum': 1, 'pageSize': 10}
                await route.fulfill(json={'data': data})
            await context.route(BASE + '/api/**', mock)
            page = await context.new_page()
            page.on('pageerror', lambda e: errors.append(str(e)))
            await page.goto(BASE + '/community?tab=history')
            skeleton = page.get_by_test_id('content-skeleton')
            await expect(skeleton).to_be_visible()
            await expect(page.get_by_text('还没有浏览记录', exact=True)).to_have_count(0)
            await page.screenshot(path=str(RUNS / f'history-{width}-{theme}.png'))
            await skeleton.screenshot(path=str(RUNS / f'skeleton-{width}-{theme}.png'))
            await expect(skeleton).to_have_count(0)
            await expect(page.get_by_text('还没有浏览记录', exact=True)).to_be_visible()
            search = page.get_by_placeholder('搜索浏览过的文章...')
            await search.fill('old')
            await expect(skeleton).to_be_visible()
            await search.fill('new-result')
            await expect(page.get_by_text('new-result', exact=True)).to_be_visible()
            await page.wait_for_timeout(2100)
            await expect(page.get_by_text('old', exact=True)).to_have_count(0)
            await expect(page.get_by_text('new-result', exact=True)).to_be_visible()
            await search.fill('')
            await expect(page.get_by_text('还没有浏览记录', exact=True)).to_be_visible()
            for name, empty in [('我的收藏', '还没有收藏任何内容'), ('我的关注', '还没有关注任何人'), ('阅读历史', '还没有浏览记录'), ('我的收藏', '还没有收藏任何内容'), ('最新内容', None), ('为你推荐', None)]:
                await page.get_by_text(name, exact=True).first.click()
                await expect(skeleton).to_be_visible()
                if empty:
                    await expect(page.get_by_text(empty, exact=True)).to_have_count(0)
                if name == '我的关注':
                    await skeleton.screenshot(path=str(RUNS / f'following-{width}-{theme}.png'))
                await expect(skeleton).to_have_count(0)
                if empty:
                    await expect(page.get_by_text(empty, exact=True)).to_be_visible()
            await page.get_by_text('精选周刊', exact=True).first.click()
            await expect(page.locator('.ant-skeleton').first).to_be_visible()
            await expect(page.get_by_text('暂无精选周刊内容', exact=True)).to_be_visible()
            state['fail'] = True
            await page.get_by_text('阅读历史', exact=True).first.click()
            await expect(skeleton).to_be_visible()
            await expect(page.get_by_role('button', name='重新加载')).to_be_visible()
            state['fail'] = False
            await page.get_by_role('button', name='重新加载').click()
            await expect(skeleton).to_be_visible()
            await expect(page.get_by_text('还没有浏览记录', exact=True)).to_be_visible()
            assert not errors, errors
            print(f'PASS {width} {theme}: entry/re-entry, empty, failure/retry, other tabs')
            await context.close()
        await browser.close()

asyncio.run(main())
