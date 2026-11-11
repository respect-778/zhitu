import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get('PROFILE_UI_URL', 'http://127.0.0.1:5179')
OUTPUT_DIR = Path(os.environ.get('PROFILE_UI_OUTPUT', Path(__file__).parent / 'profile-ui-output'))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


profile = {
    'id': 1,
    'username': 'Knowvia 学习者',
    'avatar': '',
    'bio': '正在把学习记录变成真正能使用的能力。',
    'art_count': 4,
    'fans_count': 12,
    'follow_count': 8,
    'like_count': 36,
    'isFollowed': False,
}

user_info = {
    'id': '1',
    'username': profile['username'],
    'avatar': '',
    'email': 'learner@example.com',
    'mobile': '',
    'gender': 0,
    'birthday': '',
    'degree': '本科',
    'bio': profile['bio'],
    'art_count': 4,
    'fans_count': 12,
    'follow_count': 8,
    'like_count': 36,
    'community_count': 6,
    'favorites_count': 18,
}

preferences = {
    'direction': '软件工程',
    'stage': '准备实习',
    'goal': '完成一个可展示的全栈项目并准备技术面试',
    'keywords': ['React 工程化', 'TypeScript', 'Node.js', '数据库设计', '技术面试'],
}

history = [
    {
        'id': index,
        'post_id': 100 + index,
        'title': title,
        'abstract': '',
        'cover': '',
        'username': 'Knowvia',
        'avatar': '',
        'last_read_at': f'2026-10-{30 - index:02d}T10:00:00.000Z',
        'read_count': 12 - index,
    }
    for index, title in enumerate([
        '从需求到上线：全栈项目的完整开发流程',
        'TypeScript 类型设计的常见误区',
        '如何为 Express API 编写可靠的集成测试',
        '数据库索引为什么会失效',
        '前端性能优化的真实边界',
    ], start=1)
]


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1500}, device_scale_factor=1)
    console_errors = []
    saved_preferences = []
    page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' else None)
    page.add_init_script("""
        localStorage.setItem('token', 'profile-ui-test-token');
        localStorage.setItem('userId', '1');
        localStorage.setItem('username', 'Knowvia 学习者');
        localStorage.setItem('data-theme', 'default');
    """)

    def fulfill(route, data):
        route.fulfill(status=200, content_type='application/json', body=json.dumps(data, ensure_ascii=False))

    page.route('**/user/profile/1', lambda route: fulfill(route, {'message': '获取成功', 'data': profile}))
    page.route('**/user/info', lambda route: fulfill(route, {'message': '获取成功', 'data': user_info}))

    def handle_preferences(route):
        if route.request.method == 'PUT':
            payload = route.request.post_data_json
            saved_preferences.append(payload)
            fulfill(route, {'message': '保存成功', 'data': payload})
            return
        fulfill(route, {'message': '获取成功', 'data': preferences})

    page.route('**/user/learning-preferences', handle_preferences)
    page.route(
        '**/community/history**',
        lambda route: fulfill(route, {'message': '获取成功', 'data': {'list': history, 'total': len(history), 'count': len(history)}}),
    )

    page.goto(f'{BASE_URL}/user/1')
    page.wait_for_load_state('networkidle')
    page.screenshot(path=str(OUTPUT_DIR / 'profile-sync-inspect.png'), full_page=True)
    direction_input = page.locator('input[maxlength="80"]')
    direction_input.wait_for()
    direction_input.fill('full-stack engineering')
    page.wait_for_timeout(900)
    assert saved_preferences and saved_preferences[-1]['direction'] == 'full-stack engineering'
    page.screenshot(path=str(OUTPUT_DIR / 'profile-sync-light.png'), full_page=True)

    page.locator('header button').first.click()
    page.locator('.ant-dropdown-menu-item').nth(1).click()
    page.locator('html[data-theme="dark"]').wait_for(state='attached')
    page.wait_for_timeout(700)
    page.keyboard.press('Escape')
    assert page.get_by_text('Knowvia 学习者', exact=True).is_visible()
    assert page.get_by_text('内容偏好', exact=True).is_visible()
    page.screenshot(path=str(OUTPUT_DIR / 'profile-sync-dark.png'), full_page=True, animations='disabled')

    assert not console_errors, '\n'.join(console_errors)
    browser.close()
