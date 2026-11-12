import type { FixtureWindow } from './fixtures/window'
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { fillOfficialApplication } from '../../extensions/jobApplication/autofill-form.js'
import { matchesOfficialDestination } from '../../extensions/jobApplication/autofill-contract.js'

const profile = { name: '合成小橙', phone: '13800138000', email: 'synthetic@example.test', age: '', birthDate: '',
  education: [{ id: 'first', school: '合成大学', major: '金融科技', degree: '本科', startDate: '2023-09', endDate: '2027-06' }] }
const targets = {
  feishu: { system: 'feishu', origin: 'https://synthetic.jobs.feishu.cn', site: 'Campus_test', jobId: '7700813619571362098',
    pathname: '/Campus_test/resume/7700813619571362098/apply', url: 'https://synthetic.jobs.feishu.cn/Campus_test/resume/7700813619571362098/apply' },
  beisen: { system: 'beisen', origin: 'https://synthetic.zhiye.com', jobId: 'a2c5c700-1007-4b73-bc09-f350490d2d40',
    pathname: '/form', url: 'https://synthetic.zhiye.com/form?fromPage=job&jobAdId=a2c5c700-1007-4b73-bc09-f350490d2d40' },
}
type System = keyof typeof targets
const request = (system: System) => ({ taskId: `synthetic-${system}`, target: targets[system], profile: structuredClone(profile) })
const field = (system: System, key: string) => system === 'beisen' ? `[data-key="${key}"]`
  : `[data-form-field-name="${({ phone: 'mobile', major: 'field_of_study' } as Record<string, string>)[key] || key}"]`
const record = (system: System) => system === 'beisen' ? '#education .ux-standard-form' : '[class^="apply-form-array-card__"]'
async function open(page: Page, system: System) {
  const body = await readFile(new URL(`./fixtures/${system}-application.html`, import.meta.url), 'utf8')
  await page.route(`${targets[system].origin}/**`, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body }))
  await page.goto(targets[system].url)
  await page.locator('.unknown').evaluateAll(nodes => nodes.forEach(node => node.remove()))
}

test('飞书字段容器自身校验失败会阻止成功回执', async ({ page }) => {
  await open(page, 'feishu')
  await page.locator('[data-form-field-name="email"] input').evaluate(input => input.addEventListener('input', () => {
    input.closest('.ud-formily-item')!.classList.add('ud-formily-item-error')
  }, { once: true }))
  const result = await page.evaluate(fillOfficialApplication, request('feishu'))
  expect(result.state).toBe('needs_attention')
  expect(result.fields).toContainEqual(expect.objectContaining({ field: 'email', status: 'invalid' }))
})

test('飞书已有同值日期仍确认组件状态并在失焦后回读，保留不同值冲突', async ({ page }) => {
  await open(page, 'feishu')
  const dates = page.locator('.throne-biz-date-range-picker-input input')
  await dates.evaluateAll((inputs, values) => inputs.forEach((input, index) => { (input as HTMLInputElement).value = values[index] }),
    [profile.education[0].startDate, profile.education[0].endDate])
  const result = await page.evaluate(fillOfficialApplication, request('feishu'))
  expect(result.state).toBe('filled')
  await dates.evaluateAll(inputs => inputs.forEach(input => input.dispatchEvent(new Event('blur'))))
  await expect(dates.nth(0)).toHaveValue(profile.education[0].startDate)
  await expect(dates.nth(1)).toHaveValue(profile.education[0].endDate)
  await dates.nth(0).evaluate((input: HTMLInputElement) => { input.value = '2022-09' })
  const conflict = await page.evaluate(fillOfficialApplication, { ...request('feishu'), taskId: 'different-date' })
  expect(conflict.fields).toContainEqual(expect.objectContaining({ field: 'education.0.startDate', status: 'conflict' }))
  await expect(dates.nth(0)).toHaveValue('2022-09')
})

for (const system of ['feishu', 'beisen'] as const) {
  test(`${system} 契约认可的尾斜杠及岗位ID大小写在表单校验中保持一致`, async ({ page }) => {
    await open(page, system)
    const address = new URL(targets[system].url)
    address.pathname += '/'
    if (system === 'beisen') address.searchParams.set('jobAdId', targets.beisen.jobId.toUpperCase())
    expect(matchesOfficialDestination(address.href, targets[system])).toBe(true)
    await page.evaluate(url => history.replaceState(null, '', url), address.href)
    const result = await page.evaluate(fillOfficialApplication, request(system))
    expect(result.state, JSON.stringify(result)).toBe('filled')
  })

  test(`${system} 按真实字段范围填写基本信息、学校、专业和学历并保持最终操作由用户完成`, async ({ page }) => {
    await open(page, system)
    const result = await page.evaluate(fillOfficialApplication, request(system))
    expect(result.state, JSON.stringify(result)).toBe('filled')
    expect(result.fields).toEqual(expect.arrayContaining(['name', 'phone', 'email', 'education.0.school', 'education.0.major', 'education.0.degree']
      .map(key => expect.objectContaining({ field: key, status: 'filled' }))))
    await expect(page.locator(`${field(system, 'name')} input`)).toHaveValue(profile.name)
    await expect(page.locator(`${field(system, 'school')} input`)).toHaveValue(profile.education[0].school)
    expect(JSON.stringify(result)).not.toContain(profile.name)
    expect(JSON.stringify(result)).not.toContain(profile.education[0].school)
    expect(JSON.stringify(result)).not.toContain(profile.email)
    await expect(page.locator('#consent')).not.toBeChecked()
    expect(await page.evaluate(() => Boolean((window as FixtureWindow).fixtureSubmitted || (window as FixtureWindow).fixtureSaved))).toBe(false)
  })

  test(`${system} 多教育以现有学校专业反序关联，空的多条教育请求人工确认`, async ({ page }) => {
    await open(page, system)
    const input = request(system)
    input.profile.education.push({ id: 'second', school: '合成研究院', major: '数据科学', degree: '硕士', startDate: '2027-09', endDate: '2030-06' })
    await page.locator(record(system)).evaluate(node => node.parentElement!.append(node.cloneNode(true)))
    for (const [index, row] of [...input.profile.education].reverse().entries()) {
      const block = page.locator(record(system)).nth(index)
      await block.locator(`${field(system, 'school')} input`).fill(row.school)
      await block.locator(`${field(system, 'major')} input`).fill(row.major)
    }
    await page.evaluate(system => (window as FixtureWindow)[system === 'feishu' ? 'setupFeishu' : 'setupBeisen'](), system)
    const result = await page.evaluate(fillOfficialApplication, input)
    expect(result.fields.filter(item => item.field.endsWith('.degree')).map(item => item.status)).toEqual(['filled', 'filled'])
    await expect(page.locator(record(system)).nth(0).locator(field(system, 'degree')).locator(system === 'feishu' ? '.ud__select__selector__selectItem' : '.phoenix-select__tagItem')).toHaveText(system === 'feishu' ? '硕士' : '硕士研究生')
    await open(page, system)
    await page.locator(record(system)).evaluate(node => node.parentElement!.append(node.cloneNode(true)))
    const ambiguous = await page.evaluate(fillOfficialApplication, input)
    expect(ambiguous.fields).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'education.0', status: 'ambiguous' }), expect.objectContaining({ field: 'education.1', status: 'ambiguous' })]))
    await expect(page.locator(`${field(system, 'school')} input`).nth(0)).toHaveValue('')
  })

  test(`${system} 登录遮挡会等待登录，隐藏、只读及禁用字段保持原值`, async ({ page }) => {
    await open(page, system)
    await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<div role="dialog">登录<input placeholder="手机号"><input type="password"></div>'))
    expect((await page.evaluate(fillOfficialApplication, request(system))).state).toBe('waiting_login')
    await expect(page.locator(`${field(system, 'name')} input`)).toHaveValue('')
    await page.locator('[role="dialog"]').evaluate(node => node.remove())
    await page.locator(`${field(system, 'phone')} input`).evaluate((node: HTMLInputElement) => { node.disabled = true })
    await page.locator(`${field(system, 'email')} input`).evaluate((node: HTMLInputElement) => { node.readOnly = true })
    await page.locator(field(system, 'name')).evaluate(node => { const copy = node.cloneNode(true) as HTMLElement; copy.hidden = true; node.parentElement!.append(copy) })
    const result = await page.evaluate(fillOfficialApplication, request(system))
    expect(result.fields).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'phone', status: 'unsupported' }), expect.objectContaining({ field: 'email', status: 'unsupported' }), expect.objectContaining({ field: 'name', status: 'filled' })]))
    await expect(page.locator(`${field(system, 'email')} input`)).toHaveValue('')
  })

  test(`${system} 未知CSS必填逐项报告，不向其他业务同名字段写入`, async ({ page }) => {
    await open(page, system)
    await page.evaluate(system => {
      const wrapper = document.querySelector(system === 'feishu' ? '.applyFormModuleWrapper__fixture' : '.ux-standard-form')!
      const original = wrapper.querySelector(system === 'feishu' ? '[data-form-field-name="name"]' : '[data-key="name"]')!
      const outside = document.createElement('section')
      if (system === 'beisen') { const column = document.createElement('div'); column.className = 'fields-col'; column.append(original.cloneNode(true)); outside.append(column) }
      else outside.append(original.cloneNode(true))
      document.body.append(outside)
      for (let index = 0; index < 2; index++) {
        const item = document.createElement('div')
        item.innerHTML = system === 'feishu'
          ? '<div class="ud-formily-item" data-form-field-name="custom_' + index + '"><div class="ud-formily-item-label-content"><label>其他信息</label><i class="ud-formily-item-asterisk">*</i></div><input></div>'
          : '<div class="fields-col"><div class="form-item"><div class="form-item__title"><label>其他信息</label><i class="form-item__required">*</i></div><input></div></div>'
        document.body.append(item)
      }
    }, system)
    const result = await page.evaluate(fillOfficialApplication, request(system))
    expect(result.fields.filter(item => /^required\./.test(item.field))).toHaveLength(3)
    await expect(page.locator(`body > section ${field(system, 'name')} input`)).toHaveValue('')
  })

  test(`${system} 重绘后逐字段重定位并最终全量回读早先字段`, async ({ page }) => {
    await open(page, system)
    await page.locator(`${field(system, 'name')} input`).evaluate(node => node.addEventListener('input', () => {
      const replacement = node.cloneNode(true) as HTMLInputElement
      replacement.value = (node as HTMLInputElement).value
      node.replaceWith(replacement)
    }, { once: true }))
    await page.locator(`${field(system, 'email')} input`).evaluate((node, selector) => node.addEventListener('input', () => {
      (document.querySelector(selector) as HTMLInputElement).value = ''
    }, { once: true }), `${field(system, 'name')} input`)
    const result = await page.evaluate(fillOfficialApplication, request(system))
    expect(result.fields).toContainEqual(expect.objectContaining({ field: 'name', status: 'invalid', message: '最终回读发现字段已变化或校验未通过。' }))
  })

  test(`${system} 错误岗位、取消及TTL阻止写入，相同task复用进行中结果`, async ({ page }) => {
    await open(page, system)
    const wrong = request(system)
    wrong.target = { ...wrong.target, jobId: system === 'feishu' ? '7700813619571362099' : 'b2c5c700-1007-4b73-bc09-f350490d2d40' }
    expect((await page.evaluate(fillOfficialApplication, wrong)).state).toBe('needs_attention')
    await expect(page.locator(`${field(system, 'name')} input`)).toHaveValue('')
    expect((await page.evaluate(fillOfficialApplication, { ...request(system), expiresAt: Date.now() - 1 })).state).toBe('cancelled')
    await page.evaluate(id => { (window as FixtureWindow).__knowviaAutofillCancelled = id }, request(system).taskId)
    expect((await page.evaluate(fillOfficialApplication, request(system))).state).toBe('cancelled')
    await page.evaluate(() => { delete (window as FixtureWindow).__knowviaAutofillCancelled })
    const first = page.evaluate(fillOfficialApplication, request(system))
    const second = page.evaluate(fillOfficialApplication, request(system))
    expect(await first).toEqual(await second)
  })

  test(`${system} 有歧义的菜单归属需要人工确认`, async ({ page }) => {
    await open(page, system)
    if (system === 'feishu') await page.locator('.ud__select__selector').evaluateAll(nodes => nodes.forEach(node => node.removeAttribute('aria-controls')))
    else await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<div class="phoenix-select__placeHolder--active">其他打开字段</div>'))
    const result = await page.evaluate(fillOfficialApplication, request(system))
    expect(result.fields).toContainEqual(expect.objectContaining({ field: 'education.0.degree', status: 'ambiguous' }))
    expect(await page.locator(system === 'feishu' ? '.ud__select__selector__selectItem' : '.phoenix-select__tagItem').allTextContents()).toEqual(system === 'feishu' ? [''] : [])
  })
}

test('飞书年月使用Enter提交且可重复回读，年月与日精度不会补全或截断', async ({ page }) => {
  await open(page, 'feishu')
  const result = await page.evaluate(fillOfficialApplication, request('feishu'))
  expect(result.state, JSON.stringify(result)).toBe('filled')
  const dates = page.locator('.throne-biz-date-range-picker-input input')
  await expect(dates.nth(0)).toHaveValue('2023-09')
  await expect(dates.nth(1)).toHaveValue('2027-06')
  expect(await dates.nth(0).getAttribute('data-committed')).toBe('2023-09')
  const repeated = await page.evaluate(fillOfficialApplication, request('feishu'))
  expect(repeated.state).toBe('filled')
  expect(repeated.fields.every(item => item.status === (/\.(startDate|endDate)$/.test(item.field) ? 'filled' : 'existing'))).toBe(true)
  await open(page, 'feishu')
  const input = request('feishu')
  input.profile.education[0].startDate = '2023'
  input.profile.education[0].endDate = '2027-06-30'
  const precise = await page.evaluate(fillOfficialApplication, input)
  expect(precise.fields).toEqual(expect.arrayContaining(['startDate', 'endDate'].map(key => expect.objectContaining({ field: `education.0.${key}`, status: 'unsupported' }))))
  await expect(dates.nth(0)).toHaveValue('')
  await expect(dates.nth(1)).toHaveValue('')
})

test('北森学位不代替学历，开始结束时间字段不跨到实习组', async ({ page }) => {
  await open(page, 'beisen')
  await page.locator('#education .ux-standard-form').evaluate(node => {
    const copy = node.cloneNode(true) as HTMLElement
    copy.querySelector('[data-key="school"] label')!.textContent = '单位名称'
    document.body.append(copy)
  })
  const input = request('beisen'); input.profile.education[0].degree = '学士'
  const result = await page.evaluate(fillOfficialApplication, input)
  expect(result.fields).toContainEqual(expect.objectContaining({ field: 'education.0.degree', status: 'unsupported' }))
  await expect(page.locator('body > .ux-standard-form [data-key="major"] input')).toHaveValue('')
})


test('北森年月菜单按精确年份和月份选择、十年导航及最终回读，不把搜索框作为日期值', async ({ page }) => {
  await open(page, 'beisen')
  const input = request('beisen')
  input.profile.education[0].startDate = '1998-09'
  input.profile.education[0].endDate = '2002-06'
  const result = await page.evaluate(fillOfficialApplication, input)
  expect(result.state, JSON.stringify(result)).toBe('filled')
  await expect(page.locator('[data-key="startDate"] .phoenix-select__tagItem')).toHaveText('1998/09')
  await expect(page.locator('[data-key="endDate"] .phoenix-select__tagItem')).toHaveText('2002/06')
  await expect(page.locator('[data-key="startDate"] input')).toHaveValue('')
  expect((await page.evaluate(fillOfficialApplication, input)).fields.every(item => item.status === 'existing')).toBe(true)
  await open(page, 'beisen')
  input.profile.education[0].startDate = '2023'
  input.profile.education[0].endDate = '2027-06-30'
  const precise = await page.evaluate(fillOfficialApplication, input)
  expect(precise.fields).toEqual(expect.arrayContaining(['startDate', 'endDate'].map(key => expect.objectContaining({ field: `education.0.${key}`, status: 'unsupported' }))))
  await expect(page.locator('[data-key="startDate"] .phoenix-select__tagItem')).toHaveCount(0)
})

for (const system of ['feishu', 'beisen'] as const) {
  test(`${system} 逐次写入重新核对岗位和取消，菜单选项重复不作选择`, async ({ page }) => {
    await open(page, system)
    await page.locator(`${field(system, 'name')} input`).evaluate((node, taskId) => node.addEventListener('input', () => {
      (window as FixtureWindow).__knowviaAutofillCancelled = taskId
    }, { once: true }), request(system).taskId)
    expect((await page.evaluate(fillOfficialApplication, request(system))).state).toBe('cancelled')
    await expect(page.locator(`${field(system, 'phone')} input`)).toHaveValue('')
    await open(page, system)
    await page.locator(`${field(system, 'name')} input`).evaluate(node => node.addEventListener('input', () => {
      history.replaceState({}, '', location.href.replace(/7700813619571362098|a2c5c700-1007-4b73-bc09-f350490d2d40/, 'incorrect'))
    }, { once: true }))
    expect((await page.evaluate(fillOfficialApplication, request(system))).state).toBe('needs_attention')
    await expect(page.locator(`${field(system, 'phone')} input`)).toHaveValue('')
    await open(page, system)
    await page.evaluate(system => {
      const optionSelector = system === 'feishu' ? '.ud__select__list__item' : '.phoenix-selectList__listItem'
      const observer = new MutationObserver(() => {
        const option = document.querySelector(optionSelector)
        if (option) { observer.disconnect(); option.parentElement!.append(option.cloneNode(true)) }
      })
      observer.observe(document.body, { childList: true, subtree: true })
    }, system)
    const result = await page.evaluate(fillOfficialApplication, request(system))
    expect(result.fields).toContainEqual(expect.objectContaining({ field: 'education.0.degree', status: 'ambiguous' }))
  })
}


for (const system of ['feishu', 'beisen'] as const) {
  test(`${system} 自定义菜单空搜索框的required校验允许正常选择，菜单打开后禁用则停止`, async ({ page }) => {
    await open(page, system)
    await page.locator(`${field(system, 'degree')} input`).evaluate((node: HTMLInputElement) => { node.required = true })
    const result = await page.evaluate(fillOfficialApplication, request(system))
    // The empty search input remains invalid after a selection, so readback must report it.
    expect(result.fields).toContainEqual(expect.objectContaining({ field: 'education.0.degree', status: 'invalid' }))
    await expect(page.locator(field(system, 'degree')).locator(system === 'feishu' ? '.ud__select__selector__selectItem' : '.phoenix-select__tagItem')).toHaveText('本科')
    await open(page, system)
    await page.locator(field(system, 'degree')).evaluate(node => node.addEventListener('click', () => {
      (node.querySelector('input') as HTMLInputElement).disabled = true
    }, { once: true }))
    const disabled = await page.evaluate(fillOfficialApplication, request(system))
    expect(disabled.fields).toContainEqual(expect.objectContaining({ field: 'education.0.degree', status: 'invalid' }))
    expect(await page.locator(field(system, 'degree')).locator(system === 'feishu' ? '.ud__select__selector__selectItem' : '.phoenix-select__tagItem').allTextContents()).toEqual(system === 'feishu' ? [''] : [])
  })
}


for (const system of ['feishu', 'beisen'] as const) {
  test(`${system} 字段容器声明禁用时保留输入为空`, async ({ page }) => {
    await open(page, system)
    await page.locator(field(system, 'name')).evaluate(node => node.setAttribute('aria-disabled', 'true'))
    const result = await page.evaluate(fillOfficialApplication, request(system))
    expect(result.fields).toContainEqual(expect.objectContaining({ field: 'name', status: 'unsupported' }))
    await expect(page.locator(`${field(system, 'name')} input`)).toHaveValue('')
  })
}
