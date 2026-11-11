import base64
import json
import os

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get('COMMUNITY_UI_URL', 'http://127.0.0.1:5173')
ONE_PIXEL_PNG = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
)


def fulfill_json(route, data):
    route.fulfill(status=200, content_type='application/json', body=json.dumps(data, ensure_ascii=False))


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    requested_images = []

    article = {
        'id': 1,
        'authorId': 1,
        'avatar': '',
        'name': 'Knowvia',
        'time': '2026-11-09T10:00:00.000Z',
        'title': '历史文章封面兼容检查',
        'content': '正文',
        'cover': 'http://localhost:4000/uploads/community/images/legacy-cover.png',
        'abstract': '历史文章也应继续显示封面。',
        'likes': 0,
        'comments': 0,
        'collection': 0,
        'Pageviews': 0,
        'isLiked': False,
        'isCollected': False,
        'keywords': [],
    }

    page.route(
        '**/api/community/new**',
        lambda route: fulfill_json(route, {'message': '获取成功', 'data': {'list': [article], 'total': 1}}),
    )
    page.route(
        '**/api/community/earlyReport',
        lambda route: fulfill_json(route, {'message': '获取成功', 'data': article}),
    )
    page.route('http://localhost:4000/uploads/**', lambda route: route.abort())

    def serve_image(route):
        requested_images.append(route.request.url)
        route.fulfill(status=200, content_type='image/png', body=ONE_PIXEL_PNG)

    page.route('**/api/uploads/community/images/legacy-cover.png', serve_image)
    page.goto(f'{BASE_URL}/community', wait_until='networkidle')

    cover = page.locator('img[alt="封面"]')
    cover.wait_for()
    assert cover.evaluate('(image) => image.complete && image.naturalWidth > 0')
    assert requested_images and requested_images[-1].endswith('/api/uploads/community/images/legacy-cover.png')

    browser.close()
