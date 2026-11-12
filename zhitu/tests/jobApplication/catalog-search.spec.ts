import { expect, test, type Page } from '@playwright/test'
import type { CatalogJobDetail, CatalogJobSummary } from '../../../backend/services/jobApplication/catalog/contracts/search'

const firstId = '11111111-1111-4111-8111-111111111111'
const secondId = '22222222-2222-4222-8222-222222222222'
const summary: CatalogJobSummary = {
  id: firstId, sourceId: 'synthetic-enterprise', sourceKind: 'enterprise', company: '合成官网公司', title: '官网产品经理',
  employmentType: 'unknown', recruitmentChannel: 'social', locationRaw: '深圳', cityCodes: ['440300'], educationRaw: null,
  minimumDegree: null, salaryRaw: null, salary: null, publishedAt: null, deadlineAt: null,
  sourceUpdatedAt: { raw: '2026年11月8日', value: '2026-11-08', precision: 'day', timezone: null },
  recruitmentStatus: 'open', lastVerifiedAt: '2026-11-09T00:00:00Z',
}
const detail: CatalogJobDetail = {
  ...summary, sourceJobId: 'official-123', responsibilities: '产品需求分析\n<script>window.catalogInjected = true</script>',
  requirements: '熟悉产品设计。\n<img src=x onerror="window.catalogInjected = true">', applicationInstructions: null,
  sourceUrl: 'https://careers.example.test/jobs', detailUrl: 'https://careers.example.test/jobdesc.html?postId=official-123&lang=zh-cn',
  applyUrl: null, applicationMethod: 'unknown',
}
async function fixture(page: Page, options: { total?: number; detail?: CatalogJobDetail } = {}) {
  const requests: URL[] = []
  await page.addInitScript(() => {
    const win = window as unknown as { bossCommands: string[] }
    win.bossCommands = []
    window.addEventListener('message', event => { if (event.data?.channel === 'knowvia-jobs-request') win.bossCommands.push(event.data.command) })
  })
  await page.route('**/api/catalog/v1/jobs**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/jobs')) {
      requests.push(url)
      const pageNo = Number(url.searchParams.get('page'))
      await route.fulfill({ json: { items: [{ ...summary, ...(pageNo === 2 ? { id: secondId, title: '第二页官网岗位' } : {}) }], total: options.total ?? 1, page: pageNo, pageSize: 20 } })
    } else await route.fulfill({ json: { item: { ...(options.detail ?? detail), id: url.pathname.split('/').pop() } } })
  })
  return requests
}
const bossCommands = (page: Page) => page.evaluate(() => (window as unknown as { bossCommands: string[] }).bossCommands)

test('默认勾选全部，未读取平台时直接查询数据库且没有浏览器命令', async ({ page }) => {
  const requests = await fixture(page)
  await page.goto('/applications')
  await expect(page.getByRole('button', { name:'全部', exact:true })).toHaveAttribute('aria-pressed','true')
  await expect(page.getByRole('table')).toContainText('官网产品经理')
  await expect(page.getByText('找到 1 个岗位 · 数据库 1 个 · 本次 BOSS 读取 0 个')).toBeVisible()
  expect(Object.fromEntries(requests[0].searchParams)).toEqual({page:'1',pageSize:'20'})
  await page.getByLabel('岗位或公司关键词').fill('产品')
  await page.getByRole('button', { name:'搜索岗位',exact:true }).click()
  await page.getByLabel('工作城市').selectOption('440300')
  await expect.poll(()=>requests.at(-1)!.searchParams.get('city')).toBe('440300')
  expect(requests.at(-1)!.searchParams.get('q')).toBe('产品')
  expect(await bossCommands(page)).toEqual([])
  await page.setViewportSize({width:390,height:844})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:test.info().outputPath('all-sources-mobile.png'),fullPage:true})
})

test('全部、企业官网和人社按数据库来源检索，保留城市与关键词且重置页码', async ({ page }) => {
  const requests = await fixture(page,{total:21})
  await page.goto('/applications')
  await page.getByLabel('岗位或公司关键词').fill('产品')
  await page.getByLabel('工作城市').selectOption('440300')
  await page.getByRole('button',{name:'下一页',exact:true}).click()
  await expect(page.getByText('结果页 2 / 2')).toBeVisible()
  await page.getByRole('button',{name:'企业官网',exact:true}).click()
  await expect.poll(()=>Object.fromEntries(requests.at(-1)!.searchParams)).toEqual({q:'产品',city:'440300',sourceKind:'enterprise',page:'1',pageSize:'20'})
  await page.getByRole('button',{name:'人社',exact:true}).click()
  await expect.poll(()=>requests.at(-1)!.searchParams.get('sourceKind')).toBe('announcement')
  await page.getByRole('button',{name:'全部',exact:true}).click()
  await expect.poll(()=>requests.at(-1)!.searchParams.has('sourceKind')).toBe(false)
  await expect(page.getByLabel('岗位或公司关键词')).toHaveValue('产品')
  expect(await bossCommands(page)).toEqual([])
})


test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('token', 'synthetic-module-test'))
  await page.route('**/resume/workspace', route => route.fulfill({ json: { data: { resumes: [] }, revision: 0 } }))
  await page.route('**/user/info', route => route.fulfill({ json: { message: 'ok', data: { id: 'synthetic-user', username: '合成用户' } } }))
})
