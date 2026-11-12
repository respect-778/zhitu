import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { authorizedSender } from '../../extensions/jobApplication/protocol.js'
import { DEFAULT_RESUME_DATA } from '../../src/types/resume'

test('5174 的连接桥可收发合成命令，其他来源仍被拒绝', async ({ page }) => {
  const extensionId = 'synthetic-extension'
  for (const host of ['localhost', '127.0.0.1']) {
    const url = `http://${host}:5174/applications`
    expect(authorizedSender({ id: extensionId, frameId: 0, url, tab: { id: 1, url } }, extensionId)).toBe(true)
  }
  expect(authorizedSender({ id: extensionId, frameId: 0, url: 'https://evil.test', tab: { id: 1, url: 'http://localhost:5174' } }, extensionId)).toBe(false)
  expect(authorizedSender({ id: extensionId, frameId: 1, url: 'http://localhost:5174', tab: { id: 1, url: 'http://localhost:5174' } }, extensionId)).toBe(false)
  await page.route('http://localhost:5174/**', route => route.fulfill({ contentType: 'text/html', body: '<main>合成连接页面</main>' }))
  await page.goto('http://localhost:5174/applications')
  await page.evaluate(() => {
    Object.assign(window, { chrome: { runtime: {
      sendMessage: async () => ({ ok: true, data: { connected: true } }),
      onMessage: { addListener() {}, removeListener() {} },
    } } })
  })
  await page.addScriptTag({ content: await readFile(new URL('../../extensions/jobApplication/content.js', import.meta.url), 'utf8') })
  const response = await page.evaluate(() => new Promise(resolve => {
    const id = crypto.randomUUID()
    window.addEventListener('message', function receive(event) {
      if (event.data?.channel === 'knowvia-jobs-response' && event.data.id === id) {
        window.removeEventListener('message', receive)
        resolve(event.data)
      }
    })
    window.postMessage({ channel: 'knowvia-jobs-request', version: 1, id, command: 'PING' }, location.origin)
  }))
  expect(response).toMatchObject({ ok: true, data: { connected: true } })
})

test('云端简历完成加载才可读取，账号切换立即隔离旧资料', async ({ page }) => {
  const cloudResume = { ...structuredClone(DEFAULT_RESUME_DATA), id: 'cloud-resume', title: '云端合成简历', createdAt: '2026-01-01', updatedAt: '2026-01-01' }
  cloudResume.basic.name = '云端合成人员'
  await page.addInitScript(() => {
    localStorage.setItem('token', 'synthetic-module-test')
    localStorage.setItem('userId', 'synthetic-user')
    localStorage.setItem('zhitu_resume_migrated_synthetic-user', '1')
  })
  await page.route('**/api/user/info', route => route.fulfill({ json: { message: 'ok', data: { id: 'synthetic-user', username: '合成用户' } } }))
  await page.route('**/api/catalog/**', route => route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } }))
  let release: () => void = () => {}
  const pending = new Promise<void>(resolve => { release = resolve })
  let reads = 0
  const writes: string[] = []
  await page.route('**/api/resume/workspace', async route => {
    if (route.request().method() !== 'GET') { writes.push(route.request().method()); return route.fulfill({ status: 409, json: {} }) }
    reads++
    await pending
    await route.fulfill({ json: { revision: 4, data: { resumes: [cloudResume] } } })
  })
  await page.goto('/applications')
  await expect.poll(() => reads).toBe(1)
  const choices = () => page.evaluate(async () => (await import('/src/utils/jobApplication/autofillProfiles.ts')).autofillProfiles().choices())
  expect((await choices()).resumes).toEqual([])
  release()
  await expect.poll(async () => (await choices()).resumes.map(item => item.id)).toEqual(['cloud-resume'])
  const selected = await page.evaluate(async () => (await import('/src/utils/jobApplication/autofillProfiles.ts')).autofillProfiles().read('cloud-resume'))
  expect(selected.profile.name).toBe('云端合成人员')
  const switched = await page.evaluate(async () => {
    const { default: store } = await import('/src/store/index.ts')
    const { setUserId } = await import('/src/store/modules/userStore.ts')
    const { autofillProfiles } = await import('/src/utils/jobApplication/autofillProfiles.ts')
    store.dispatch(setUserId('other-synthetic-user'))
    return autofillProfiles().choices()
  })
  expect(switched.resumes).toEqual([])
  expect(writes).toEqual([])
})

test('网申页面沿用新版深色主题', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('token', 'synthetic-module-test'); localStorage.setItem('data-theme', 'dark') })
  await page.route('**/api/user/info', route => route.fulfill({ json: { message: 'ok', data: { id: 'synthetic-user', username: '合成用户' } } }))
  await page.route('**/api/resume/workspace', route => route.fulfill({ json: { revision: 0, data: { resumes: [] } } }))
  await page.route('**/api/catalog/**', route => route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } }))
  await page.goto('/applications')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('region', { name: '岗位搜索与筛选' })).toHaveCSS('background-color', 'rgb(15, 23, 42)')
})
