import { expect, test } from '@playwright/test'
import type { CatalogJobDetail, CatalogJobSummary } from '../../../backend/services/jobApplication/catalog/contracts/search'
import { catalogRow } from '../../src/utils/jobApplication/catalogViewModel'

const id = '33333333-3333-4333-8333-333333333333'
const summary: CatalogJobSummary = {
  id, sourceId: 'synthetic-enterprise', sourceKind: 'enterprise', company: '腾讯', title: '合成算法岗位',
  employmentType: 'full_time', recruitmentChannel: 'social', locationRaw: '深圳', cityCodes: ['440300'],
  educationRaw: '1.计算机、人工智能、自动化、应用数学、控制工程等相关专业，硕士及以上学历；', minimumDegree: 'master',
  salaryRaw: '20-30K', salary: null, publishedAt: null, deadlineAt: null, sourceUpdatedAt: null,
  recruitmentStatus: 'open', lastVerifiedAt: '2026-11-09T00:00:00Z',
}
const detail: CatalogJobDetail = {
  ...summary, sourceJobId: 'role-1', responsibilities: '合成职责', requirements: summary.educationRaw,
  applicationInstructions: null, sourceUrl: 'https://careers.example.test/jobs',
  detailUrl: 'https://careers.example.test/jobdesc.html?postId=role-1', applyUrl: null, applicationMethod: 'unknown',
}

test('学历列采用规范学历，原始专业与任职要求不进入单元格', () => {
  expect(catalogRow(summary).education).toBe('硕士')
  expect(catalogRow({ ...summary, minimumDegree: 'bachelor' }).education).toBe('本科')
  expect(catalogRow({ ...summary, minimumDegree: null, educationRaw: null }).education).toBe('未知')
})

test('缺失信息统一显示未知，已知届数范围和截止日期完整显示', () => {
  const reviewed: CatalogJobSummary = { ...summary, reviewedMetadata: {
    batchId: 'official100-2026-11-11', industry: '软件与信息技术', companyType: '未披露',
    graduateYear: '官网未明示毕业届数', graduateStatus: '正文未明示毕业届数',
    graduateQuote: null, graduateSourceUrl: null,
  } }
  expect(catalogRow(reviewed).deadline).toBe('未知')
  expect(catalogRow(reviewed).companyType).toBe('未知')
  expect(catalogRow(reviewed).graduateYearLabel).toBe('未知')
  expect(catalogRow({ ...reviewed, salaryRaw: '金额未披露', locationRaw: '未单列城市（总部）', educationRaw: '正文未限定学历层级' })).toMatchObject({ salary: '未知', city: '未知', education: '未知', educationRaw: '未知' })
  expect(catalogRow({ ...reviewed, reviewedMetadata: { ...reviewed.reviewedMetadata!, graduateYear: '2027届及之后' } }).graduateYearLabel).toBe('2027届及之后')
  expect(catalogRow({ ...reviewed, educationRaw: '本科及以上，专业未限定', reviewedMetadata: { ...reviewed.reviewedMetadata!, graduateYear: '2027届及以后，专业未限定' } })).toMatchObject({ education: '本科及以上，专业未限定', graduateYearLabel: '2027届及以后，专业未限定' })
  expect(catalogRow({ ...reviewed, educationRaw: '计算机等相关专业，本科及以上学历，专业方向未限定', reviewedMetadata: { ...reviewed.reviewedMetadata!, graduateYear: '面向2027/2028届（项目），其他专业条件未限定' } })).toMatchObject({ education: '计算机等相关专业，本科及以上学历，专业方向未限定', graduateYearLabel: '面向2027/2028届（项目），其他专业条件未限定' })
  expect(catalogRow({ ...reviewed, educationRaw: '正文未明示本科要求' }).education).toBe('未知')
  expect(catalogRow({ ...reviewed, educationRaw: '本科四年级及以上（含研究生）的在校学生，专业未限定' }).education).toBe('本科四年级及以上（含研究生）的在校学生，专业未限定')
  expect(catalogRow(summary).deadline).toBe('未知')
  const deadlineAt: NonNullable<CatalogJobSummary['deadlineAt']> = {
    raw: '2026-12-31', value: '2026-12-31', precision: 'day', timezone: 'Asia/Shanghai',
  }
  expect(catalogRow({ ...reviewed, deadlineAt }).deadline).toBe('2026-12-31')
  expect(catalogRow({ ...summary, deadlineAt }).deadline).toBe('2026-12-31')
})

test('数据库与BOSS共用职位列和手机卡片，官网直接跳转且不打开详情弹窗', async ({ page }) => {
  await page.route('**/api/catalog/v1/jobs**', route => {
    const url = new URL(route.request().url())
    return route.fulfill({ json: url.pathname.endsWith('/jobs')
      ? { items: [summary], total: 1, page: 1, pageSize: 20 } : { item: detail } })
  })
  await page.goto('/applications')
  await expect(page.getByRole('table')).toBeVisible()
  await expect(page.getByRole('table').getByRole('checkbox', { name: '全选本页岗位', exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader')).toHaveText(['', '职位', '薪资', '公司名称', '企业类别', '行业类别', '城市', '学历要求', '届数', '截止时间', '投递地址'])
  const cells = page.getByRole('table').locator('tbody tr td')
  await expect(cells.nth(7)).toHaveText('硕士')
  await expect(cells.nth(7)).not.toContainText('计算机')
  await expect(cells.nth(8)).toHaveText('未知')
  await expect(cells.nth(9)).toHaveText('未知')
  await expect(page.getByRole('table').getByRole('link', { name: '前往官网', exact: true })).toHaveAttribute('href', detail.detailUrl!)
  await expect(page.getByRole('button', { name: '查看详情', exact: true })).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.context().route('https://careers.example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<title>合成岗位网页</title>' }))
  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('table').getByRole('link', { name: '前往官网', exact: true }).click()
  const popup = await popupPromise
  await expect(popup).toHaveURL(detail.detailUrl!)
  await popup.close()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('article')).toContainText('硕士')
  await expect(page.getByRole('article').getByRole('link', { name: '前往官网', exact: true })).toHaveAttribute('href', detail.detailUrl!)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('链接读取保持单页四个并发，所有岗位各读取一次', async ({ page }) => {
  const jobs = Array.from({ length: 9 }, (_, index) => ({ ...summary, id: `${String(index + 1).padStart(8, '0')}-3333-4333-8333-333333333333` }))
  let active = 0, peak = 0, calls = 0, hold = true
  const waiting: (() => void)[] = []
  await page.route('**/api/catalog/v1/jobs**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/jobs')) {
      await route.fulfill({ json: { items: jobs, total: jobs.length, page: 1, pageSize: 20 } })
      return
    }
    active++; calls++; peak = Math.max(peak, active)
    if (hold) await new Promise<void>(resolve => waiting.push(resolve))
    await route.fulfill({ json: { item: { ...detail, id: url.pathname.split('/').pop() } } })
    active--
  })
  await page.goto('/applications')
  await expect.poll(() => waiting.length).toBe(4)
  expect(peak).toBe(4)
  hold = false; waiting.splice(0).forEach(resolve => resolve())
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(9)
  expect(calls).toBe(9)
  expect(peak).toBeLessThanOrEqual(4)
})

test('新查询取消旧链接读取，迟到链接不能覆盖新岗位', async ({ page }) => {
  const latestId = '44444444-4444-4444-8444-444444444444'
  let holding = false
  let release!: () => void, started!: () => void, finished!: () => void
  const wait = new Promise<void>(resolve => { release = resolve })
  const entered = new Promise<void>(resolve => { started = resolve })
  const completed = new Promise<void>(resolve => { finished = resolve })
  await page.route('**/api/catalog/v1/jobs**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/jobs')) {
      const q = url.searchParams.get('q')
      const job = q === '最新查询' ? { ...summary, id: latestId, title: '最新查询岗位' } : summary
      await route.fulfill({ json: { items: [job], total: 1, page: 1, pageSize: 20 } })
      return
    }
    const currentId = url.pathname.split('/').pop()
    const delayed = holding && currentId === id
    if (delayed) { started(); await wait }
    try { await route.fulfill({ json: { item: { ...detail, id: currentId, detailUrl: `https://careers.example.test/job/${currentId}` } } }) }
    catch { /* The cancelled query no longer has a recipient. */ }
    finally { if (delayed) finished() }
  })
  await page.goto('/applications'); await expect(page.getByRole('table')).toBeVisible()
  holding = true
  await page.getByLabel('岗位或公司关键词').fill('慢链接')
  await page.getByRole('button', { name: '搜索岗位', exact: true }).click(); await entered
  await page.getByLabel('岗位或公司关键词').fill('最新查询')
  await page.getByRole('button', { name: '搜索岗位', exact: true }).click()
  await expect(page.getByRole('table')).toContainText('最新查询岗位')
  release(); await completed
  await expect(page.getByRole('table')).toContainText('最新查询岗位')
  await expect(page.getByRole('table').getByRole('link', { name: '前往官网', exact: true })).toHaveAttribute('href', `https://careers.example.test/job/${latestId}`)
})

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('token', 'synthetic-module-test'))
  await page.route('**/resume/workspace', route => route.fulfill({ json: { data: { resumes: [] }, revision: 0 } }))
  await page.route('**/user/info', route => route.fulfill({ json: { message: 'ok', data: { id: 'synthetic-user', username: '合成用户' } } }))
})
