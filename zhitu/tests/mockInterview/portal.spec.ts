import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('token', 'synthetic-module-test'))
  await page.route('**/user/info', route => route.fulfill({ json: { message: 'ok', data: { id: 'synthetic-user', username: '合成用户' } } }))
})

test('使用现有导航，健康检查成功后加载同源面试入口', async ({ page }) => {
  await page.route('**/mock-interview/api/health', route => route.fulfill({ json: { ok: true } }))
  await page.route('**/mock-interview/setup', route => route.fulfill({ contentType: 'text/html', body: '<h1>合成面试设置</h1>' }))
  await page.goto('/interview')
  await expect(page.getByTitle('模拟面试练习')).toHaveAttribute('src', '/mock-interview/setup')
  await expect(page.frameLocator('iframe').getByRole('heading', { name: '合成面试设置' })).toBeVisible()
  await expect(page.locator('header')).toHaveCount(1)
})

test('服务未启动时可重试，不显示损坏的嵌入页面', async ({ page }) => {
  let available = false
  await page.route('**/mock-interview/api/health', route => route.fulfill({ status: available ? 200 : 503, json: { ok: available } }))
  await page.route('**/mock-interview/setup', route => route.fulfill({ contentType: 'text/html', body: '<h1>合成面试设置</h1>' }))
  await page.goto('/interview')
  await expect(page.getByRole('alert')).toContainText('暂时无法连接模拟面试')
  await expect(page.locator('iframe')).toHaveCount(0)
  available = true
  await page.getByRole('button', { name: '重新连接' }).click()
  await expect(page.getByTitle('模拟面试练习')).toBeVisible()
})

test('保持目标仓库的登录保护', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('token'))
  await page.goto('/interview')
  await expect(page).toHaveURL(/\/login$/)
})
