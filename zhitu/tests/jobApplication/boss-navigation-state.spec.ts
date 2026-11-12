import { expect, test } from '@playwright/test'
import { createJobNavigation, destinationState, jobDestination } from '../../extensions/jobApplication/navigation.js'

const url = 'https://www.zhipin.com/job_detail/fixture.html?securityId=synthetic%7E&lid=fixture.1'
const pathname = '/job_detail/fixture.html'
const sender = { tab: { id: 1, windowId: 2, incognito: false } }
type TabInput = { url?: string; active?: boolean; windowId?: number }
type FixtureTab = TabInput & { id: number; status: string; pendingUrl?: string }
function harness() {
  let time = 0, sequence = 10, result = 'ready'
  const tabs = new Map<number, FixtureTab>()
  const writes: TabInput[] = []
  const browser = {
    tabs: {
      get: async (id: number) => { const tab = tabs.get(id); if (!tab) throw new Error('closed'); return tab },
      create: async (input: TabInput) => { const tab = { ...input, id: sequence++, status: 'loading' }; tabs.set(tab.id, tab); writes.push(input); return tab },
      update: async (id: number, input: TabInput) => { const tab = await browser.tabs.get(id); Object.assign(tab, input); writes.push(input); return tab },
    },
    scripting: { executeScript: async () => [{ result }] },
  }
  const nav = createJobNavigation(browser, { now: () => time, id: () => `navigation-${sequence++}` })
  return { nav, tabs, writes, advance: (ms: number) => { time += ms }, result: (value: string) => { result = value } }
}

test('岗位地址保留完整访问参数，拒绝首页、搜索页、其他域名与伪造来源', () => {
  expect(jobDestination({ url }).href).toBe(url)
  for (const invalid of ['https://www.zhipin.com/', 'https://www.zhipin.com/web/geek/job', 'http://www.zhipin.com' + pathname,
    'https://www.zhipin.com.evil.example' + pathname, 'https://user@www.zhipin.com' + pathname, '/job_detail/fixture.html'])
    expect(() => jobDestination({ url: invalid })).toThrow()
})

test('重试尚未提交导航时使用pendingUrl，不把旧首页误判为回到首页', () => {
  expect(destinationState({ url: 'https://www.zhipin.com/', pendingUrl: url, status: 'loading' }, pathname)).toBe('loading')
  expect(destinationState({ url, pendingUrl: 'https://www.zhipin.com/web/passport/zp/security.html', status: 'loading' }, pathname)).toBe('verification')
})

test('安全验证、登录、首页、其他岗位分别识别，不把跳转视为成功', () => {
  const states = [
    ['https://www.zhipin.com/web/passport/zp/security.html', 'verification'],
    ['https://www.zhipin.com/web/user/', 'login'], ['https://www.zhipin.com/', 'home'],
    ['https://www.zhipin.com/job_detail/other.html', 'redirected'], ['https://other.example/', 'redirected'],
    [url, 'loading'], ['about:blank', 'loading'],
  ]
  for (const [value, state] of states) expect(destinationState({ url: value }, pathname)).toBe(state)
})

test('加载超时不自动刷新；真实详情和失效状态只通过已打开页面核验', async () => {
  const h = harness(), task = await h.nav.open(sender, { url })
  h.advance(30_001)
  expect(await h.nav.status(sender, task)).toMatchObject({ state: 'timeout' })
  expect(h.writes).toHaveLength(1)
  const tab = [...h.tabs.values()][0]; tab.status = 'complete'
  expect(await h.nav.status(sender, task)).toMatchObject({ state: 'ready' })
  h.result('unavailable')
  expect(await h.nav.status(sender, task)).toMatchObject({ state: 'unavailable' })
  expect(h.writes).toHaveLength(1)
})

test('原标签页留在验证流程时重复点击仅聚焦，明确重试才重新访问原岗位', async () => {
  const h = harness(), task = await h.nav.open(sender, { url })
  const tab = [...h.tabs.values()][0]; tab.url = 'https://www.zhipin.com/web/passport/zp/security.html'
  expect(await h.nav.open(sender, { url })).toMatchObject({ ...task, state: 'verification' })
  expect(h.writes[1]).toEqual({ active: true })
  await h.nav.open(sender, { url, retry: true })
  expect(h.tabs.size).toBe(1); expect(h.writes[2]).toEqual({ url, active: true })
})

test('不读取其他官网会话的打开任务，不聚焦或覆盖用户已转去的无关页面', async () => {
  const h = harness(), task = await h.nav.open(sender, { url })
  expect(() => h.nav.status({ tab: { ...sender.tab, id: 2 } }, task)).toThrow()
  const tab = [...h.tabs.values()][0]; tab.url = 'https://other.example/'
  expect(await h.nav.focus(sender, task)).toMatchObject({ state: 'redirected' })
  expect(h.writes).toHaveLength(1)
  await h.nav.open(sender, { url, retry: true })
  expect(tab.url).toBe('https://other.example/'); expect(h.tabs.size).toBe(2)
})

test('用户关闭岗位页后允许显式重试；清理官网任务不关闭用户标签页', async () => {
  const h = harness(), task = await h.nav.open(sender, { url })
  h.tabs.clear()
  expect(await h.nav.status(sender, task)).toMatchObject({ state: 'closed' })
  await h.nav.open(sender, { url, retry: true })
  h.nav.forget(sender.tab.id)
  expect(h.tabs.size).toBe(1)
  expect(() => h.nav.status(sender, task)).toThrow()
})
