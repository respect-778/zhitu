import copy
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

BASE_URL = os.environ.get('PATH_UI_BASE_URL', 'http://127.0.0.1:5175')
RUNS = Path(__file__).parents[1] / '.agent-workflow/tasks/path-search/runs'
RUNS.mkdir(parents=True, exist_ok=True)
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

INITIAL = {
    'revision': 1,
    'data': {
        'files': [
            {'id': 'notes', 'name': '学习笔记', 'type': 'folder', 'parentId': None, 'order': 0},
            {'id': 'frontend', 'name': '前端开发', 'type': 'folder', 'parentId': 'notes', 'order': 0},
            {'id': 'archive', 'name': '引用收藏', 'type': 'folder', 'parentId': None, 'order': 1},
            {'id': 'react', 'name': 'React 入门.md', 'type': 'file', 'parentId': 'frontend', 'order': 0, 'content': 'use server\nReact hooks\nuse server twice\n'},
            {'id': 'duplicate', 'name': 'React 入门.md', 'type': 'file', 'parentId': 'archive', 'order': 0, 'content': 'Other text\n'},
            {'id': 'empty', 'name': '空白笔记', 'type': 'file', 'parentId': 'frontend', 'order': 1, 'content': ''},
            {'id': 'root', 'name': '根目录', 'type': 'file', 'parentId': None, 'order': 2, 'content': '学习笔记 React use server\n'},
        ],
        'openTabs': [], 'activeTabId': None, 'expandedFolderIds': [],
        'activePlan': None, 'mentorId': None,
    },
}

# Match the workspace loader's defaults so the final equality check detects
# actual note edits, not metadata normalization on the first workspace save.
for fixture_file in INITIAL['data']['files']:
    fixture_file.update(createdByKind='user', agentPermission='read')


def result_ids(panel):
    return panel.get_by_test_id('search-file-result').evaluate_all('(nodes) => nodes.map(node => node.dataset.fileId)')


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe')
    try:
        for width, theme in [(1440, 'default'), (1024, 'dark'), (768, 'default')]:
            model = copy.deepcopy(INITIAL)
            account = {'id': '100'}
            writes, errors = [], []
            context = browser.new_context(viewport={'width': width, 'height': 1000})
            context.add_init_script("""if (!localStorage.getItem('userId')) localStorage.setItem('userId','100');
                localStorage.setItem('token','isolated-search-test-token');localStorage.setItem('username','test');"""
                + "localStorage.setItem('data-theme'," + json.dumps(theme) + ');')

            def intercept(route):
                request = route.request
                endpoint = urlparse(request.url).path
                if endpoint.endswith('/growth/workspace'):
                    if request.method == 'PUT':
                        writes.append(copy.deepcopy(request.post_data_json))
                        model['data'] = copy.deepcopy(request.post_data_json['data'])
                        model['revision'] += 1
                    route.fulfill(json=copy.deepcopy(model))
                elif endpoint.endswith('/user/info'):
                    route.fulfill(json={'data': {'id': account['id'], 'username': 'test', 'email': 'test@example.invalid', 'avatar': ''}, 'message': 'ok'})
                else:
                    route.fulfill(json={'data': [], 'list': [], 'total': 0})

            context.route(BASE_URL + '/api/**', intercept)
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            try:
                page.goto(BASE_URL + '/path')
                page.get_by_role('button', name='搜索', exact=True).click()
                panel = page.get_by_test_id('path-search-panel')
                field = panel.get_by_role('combobox', name='搜索笔记')
                expect(field).to_be_focused()
                expect(panel.get_by_role('option', name='path: 匹配文件路径')).to_be_visible()
                expect(panel.get_by_role('option', name='file: 匹配文件名')).to_be_visible()
                expect(panel.get_by_text('暂无搜索历史')).to_be_visible()

                # Mouse selection inserts the operator and keeps focus in the input.
                panel.get_by_role('option', name='path: 匹配文件路径').click()
                expect(field).to_have_value('path:')
                expect(field).to_be_focused()
                expect(panel.get_by_text('请在 path: 后输入匹配内容')).to_be_visible()
                field.fill('path:学习笔记/前端开发')
                expect(panel.get_by_test_id('search-file-result')).to_have_count(2)
                assert set(result_ids(panel)) == {'react', 'empty'}
                field.press('Enter')

                # Empty notes and duplicate filenames are included, content-only hits excluded.
                field.fill('file:"React 入门.md"')
                expect(panel.get_by_test_id('search-file-result')).to_have_count(2)
                assert set(result_ids(panel)) == {'react', 'duplicate'}
                expect(panel.get_by_text('引用收藏/React 入门.md', exact=True)).to_be_visible()
                field.press('Enter')
                field.fill('path:学习笔记 file:React use server')
                expect(panel.get_by_test_id('search-file-result')).to_have_count(1)
                expect(panel.get_by_role('status')).to_have_text('1 个文件 · 2 处匹配')
                field.press('Enter')

                field.fill('use server')
                expect(panel.get_by_test_id('search-file-result')).to_have_count(2)
                expect(panel.get_by_role('status')).to_have_text('2 个文件 · 3 处匹配')
                field.press('Enter')
                field.fill('file:空白')
                expect(panel.get_by_test_id('search-file-result')).to_have_count(1)
                assert result_ids(panel) == ['empty']

                # Case sensitivity is applied to filters and restored with history.
                field.fill('file:react')
                panel.get_by_role('button', name='区分大小写').click()
                expect(panel.get_by_test_id('search-file-result')).to_have_count(0)
                field.fill('file:React')
                field.press('Enter')
                expect(panel.get_by_test_id('search-file-result')).to_have_count(2)
                panel.get_by_role('button', name='区分大小写').click()
                panel.get_by_role('button', name='清空搜索').click()
                history = panel.get_by_role('group', name='搜索历史', exact=True)
                history.get_by_role('option', name='file:React Aa', exact=True).click()
                expect(field).to_have_value('file:React')
                expect(panel.get_by_role('button', name='区分大小写')).to_have_attribute('aria-pressed', 'true')
                panel.get_by_role('button', name='区分大小写').click()

                # Up/down selects suggestions reliably; Enter chooses, Escape dismisses.
                panel.get_by_role('button', name='清空搜索').click()
                field.press('ArrowDown')
                expect(panel.get_by_role('option', name='path: 匹配文件路径')).to_have_attribute('aria-selected', 'true')
                field.press('ArrowDown')
                expect(panel.get_by_role('option', name='file: 匹配文件名')).to_have_attribute('aria-selected', 'true')
                field.press('ArrowUp')
                field.press('ArrowDown')
                field.press('Enter')
                expect(field).to_have_value('file:')
                field.press('ArrowDown')
                field.press('Escape')
                expect(panel.get_by_role('listbox')).to_have_count(0)

                # IME confirmation must not choose an option or save a partial query.
                panel.get_by_role('button', name='清空搜索').click()
                field.press('ArrowDown')
                field.dispatch_event('keydown', {'key': 'Enter', 'code': 'Enter', 'isComposing': True})
                expect(field).to_have_value('')

                # Repeated searches are deduplicated; unconfirmed fragments are not persisted.
                field.fill('file:unfinished-fragment')
                field.fill('use server')
                field.press('Enter')
                field.press('Enter')
                stored = page.evaluate("JSON.parse(localStorage.getItem('knowvia:path-search-history:100'))")
                assert stored[0]['query'] == 'use server'
                assert sum(item['query'] == 'use server' for item in stored) == 1
                assert not any(item['query'] == 'file:unfinished-fragment' for item in stored)

                # Capture real search menu in the surrounding UI, using only fixture data.
                panel.get_by_role('button', name='清空搜索').click()
                page.screenshot(path=str(RUNS / f'search-{width}-{theme}.png'))
                panel.screenshot(path=str(RUNS / f'search-panel-{width}-{theme}.png'))
                assert panel.evaluate('(node) => node.scrollWidth <= node.clientWidth')

                # The same browser retains history on reload; another account does not inherit it.
                page.reload()
                page.get_by_role('button', name='搜索', exact=True).click()
                expect(panel.get_by_role('group', name='搜索历史', exact=True).get_by_role('option', name='use server', exact=True)).to_be_visible()
                account['id'] = '101'
                page.evaluate("localStorage.setItem('userId','101')")
                page.reload()
                page.get_by_role('button', name='搜索', exact=True).click()
                expect(panel.get_by_text('暂无搜索历史')).to_be_visible()
                account['id'] = '100'
                page.evaluate("localStorage.setItem('userId','100')")
                page.reload()
                page.get_by_role('button', name='搜索', exact=True).click()

                panel.get_by_role('button', name='清空搜索历史').click()
                expect(panel.get_by_text('暂无搜索历史')).to_be_visible()
                field.press('Escape')
                page.get_by_role('button', name='文件列表', exact=True).click()
                page.get_by_role('button', name='搜索', exact=True).click()
                expect(panel.get_by_text('暂无搜索历史')).to_be_visible()
                assert page.evaluate("localStorage.getItem('knowvia:path-search-history:100')") is None

                # Result activation opens the correct duplicate and remembers the search.
                field.fill('path:引用收藏 file:React')
                expect(panel.get_by_test_id('search-file-result')).to_have_count(1)
                panel.get_by_role('button', name='React 入门.md 引用收藏/React 入门.md', exact=True).click()
                expect(page.locator('.vditor-ir [contenteditable="true"]')).to_contain_text('Other text', timeout=30000)
                assert page.evaluate("JSON.parse(localStorage.getItem('knowvia:path-search-history:100'))[0].query") == 'path:引用收藏 file:React'
                assert not errors, errors
                # All requests were mocked. Search itself never edits note content.
                assert model['data']['files'] == INITIAL['data']['files'], json.dumps(model['data']['files'], ensure_ascii=False)
                print(f'PASS search filters/history/keyboard/account isolation: {width}px {theme}')
            except Exception:
                page.screenshot(path=str(RUNS / f'search-{width}-failure.png'))
                raise
            finally:
                context.close()
    finally:
        browser.close()
