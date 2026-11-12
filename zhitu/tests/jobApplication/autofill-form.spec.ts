import type { FixtureWindow } from './fixtures/window'
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { fillMokaApplication } from '../../extensions/jobApplication/autofill-form.js'

const jobId = '3c5fff11-24b7-40c8-b9fa-9252bca9f88e'
const target = { origin: 'https://app.mokahr.com', pathname: '/campus_apply/synthetic/123', jobId,
  url: `https://app.mokahr.com/campus_apply/synthetic/123#/job/${jobId}/apply?pure=1` }
const profile = { name: '合成小橙', phone: '13800138000', email: 'synthetic@example.test', age: '', birthDate: '',
  education: [{ id: 'first', school: '合成大学', major: '金融科技', degree: '本科', startDate: '2023-09', endDate: '2027-06' }] }
const request = () => ({ taskId: 'synthetic-task', target, profile: structuredClone(profile) })
async function open(page: Page) {
  await page.goto('about:blank')
  const fixture = await readFile(new URL('./fixtures/moka-application.html', import.meta.url), 'utf8')
  await page.route('https://app.mokahr.com/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture }))
  await page.goto(target.url)
  await page.locator('[data-key="unknown"]').evaluate(node => node.remove())
}
const value = (page: Page, key: string) => page.locator(`[data-key="${key}"] input,[data-key="${key}"] select`)
test('标准字段使用原生setter、事件和回读，重复运行保留相同值，保持最终操作未触发', async ({ page }) => {
  await open(page)
  await page.evaluate(() => {
    (window as FixtureWindow).fixtureEvents = []
    for (const event of ['input', 'change', 'blur']) document.addEventListener(event, () => (window as FixtureWindow).fixtureEvents.push(event), true)
  })
  const result = await page.evaluate(fillMokaApplication, request())
  expect(result.state).toBe('filled')
  expect(result.fields).toHaveLength(8)
  await expect(value(page, 'name')).toHaveValue(profile.name)
  await expect(value(page, 'degree')).toHaveValue('bachelor')
  await expect(value(page, 'endDate')).toHaveValue('2027-06')
  const repeated = await page.evaluate(fillMokaApplication, request())
  expect(repeated.state).toBe('filled')
  expect(repeated.fields.every(field => field.status === 'existing')).toBe(true)
  expect(await page.evaluate(() => (window as FixtureWindow).fixtureEvents)).toEqual(expect.arrayContaining(['input', 'change', 'blur']))
  expect(await page.locator('#consent').isChecked()).toBe(false)
  expect(await page.evaluate(() => Boolean((window as FixtureWindow).fixtureSubmitted))).toBe(false)
  expect(JSON.stringify(result)).not.toContain(profile.name)
  expect(JSON.stringify(result)).not.toContain(profile.education[0].school)
})

test('两条教育按学校专业学历匹配反序条目，回读每条日期', async ({ page }) => {
  await open(page)
  const input = request()
  input.profile.education.push({ id: 'second', school: '合成研究院', major: '数据科学', degree: '硕士', startDate: '2027-09', endDate: '2030-06' })
  await page.evaluate(rows => {
    const section = document.querySelector('[data-nav-id="block-educationInfo"]')!
    const first = section.querySelector('.multi-fixture')!
    section.append(first.cloneNode(true))
    for (const [index, block] of [...section.querySelectorAll('.multi-fixture')].entries()) {
      const row = rows[1 - index]
      for (const key of ['school', 'major']) (block.querySelector(`[data-key="${key}"] input`) as HTMLInputElement).value = row[key]
      ;(block.querySelector('select') as HTMLSelectElement).value = index ? 'bachelor' : 'master'
    }
  }, input.profile.education)
  const result = await page.evaluate(fillMokaApplication, input)
  expect(result.state).toBe('filled')
  await expect(value(page, 'startDate').nth(0)).toHaveValue('2027-09')
  await expect(value(page, 'startDate').nth(1)).toHaveValue('2023-09')
})

test('多个空教育条目无法逐条绑定，已有字段冲突保持原值，重复标题要求确认', async ({ page }) => {
  await open(page)
  const input = request()
  input.profile.education.push({ ...input.profile.education[0], id: 'second', school: '第二合成大学' })
  await page.evaluate(() => {
    const block = document.querySelector('.multi-fixture')!
    block.parentElement!.append(block.cloneNode(true))
    const name = document.querySelector('[data-key="name"]')!
    name.parentElement!.append(name.cloneNode(true))
    ;(document.querySelector('[data-key="phone"] input') as HTMLInputElement).value = '13900139000'
  })
  const result = await page.evaluate(fillMokaApplication, input)
  expect(result.fields).toEqual(expect.arrayContaining([
    expect.objectContaining({ field: 'name', status: 'ambiguous' }), expect.objectContaining({ field: 'phone', status: 'conflict' }),
    expect.objectContaining({ field: 'education.0', status: 'ambiguous' }), expect.objectContaining({ field: 'education.1', status: 'ambiguous' }),
  ]))
  await expect(value(page, 'school').nth(0)).toHaveValue('')
  await expect(value(page, 'phone')).toHaveValue('13900139000')
})

test('登录浮层及相同placeholder不接收资料，隐藏及禁用字段不写', async ({ page }) => {
  await open(page)
  await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<div role="dialog">登录<input placeholder="请输入手机号"><input type="password"><input placeholder="验证码"></div>'))
  expect((await page.evaluate(fillMokaApplication, request())).state).toBe('waiting_login')
  await expect(value(page, 'name')).toHaveValue('')
  await page.locator('[role="dialog"]').evaluate(node => node.remove())
  await page.evaluate(() => {
    const email = document.querySelector('[data-key="email"]')!
    const hidden = email.cloneNode(true) as HTMLElement
    hidden.hidden = true; email.parentElement!.append(hidden)
    ;(document.querySelector('[data-key="phone"] input') as HTMLInputElement).disabled = true
  })
  const result = await page.evaluate(fillMokaApplication, request())
  expect(result.fields).toContainEqual(expect.objectContaining({ field: 'phone', status: 'unsupported' }))
  await expect(value(page, 'email').nth(0)).toHaveValue(profile.email)
  await expect(value(page, 'email').nth(1)).toHaveValue('')
})

test('React式替换节点会重新定位，值回弹及页面invalid返回校验失败', async ({ page }) => {
  await open(page)
  await page.evaluate(() => {
    document.querySelector('[data-key="name"] input')!.addEventListener('change', event => {
      const old = event.target as HTMLInputElement
      const replacement = old.cloneNode(true) as HTMLInputElement
      replacement.value = old.value; old.replaceWith(replacement)
    })
    document.querySelector('[data-key="phone"] input')!.addEventListener('change', event => setTimeout(() => { (event.target as HTMLInputElement).value = '' }, 30))
    document.querySelector('[data-key="email"] input')!.addEventListener('change', event => (event.target as HTMLElement).setAttribute('aria-invalid', 'true'))
  })
  const result = await page.evaluate(fillMokaApplication, request())
  expect(result.fields).toEqual(expect.arrayContaining([
    expect.objectContaining({ field: 'name', status: 'filled' }), expect.objectContaining({ field: 'phone', status: 'invalid' }), expect.objectContaining({ field: 'email', status: 'invalid' }),
  ]))
})

test('日期精度、未匹配学历与年龄出生日期冲突保留待处理，回执不包含页面原文', async ({ page }) => {
  await open(page)
  const input = request()
  input.profile.age = '18'; input.profile.birthDate = '1990-01-01'
  input.profile.education[0].endDate = '2027'; input.profile.education[0].degree = '学士'
  const result = await page.evaluate(fillMokaApplication, input)
  expect(result.fields).toEqual(expect.arrayContaining([
    expect.objectContaining({ field: 'age', status: 'conflict' }), expect.objectContaining({ field: 'birthDate', status: 'conflict' }),
    expect.objectContaining({ field: 'education.0.endDate', status: 'unsupported' }), expect.objectContaining({ field: 'education.0.degree', status: 'unsupported' }),
  ]))
  await expect(value(page, 'endDate')).toHaveValue('')
  await expect(value(page, 'birthDate')).toHaveValue('')
  expect(JSON.stringify(result)).not.toContain('学士')
})

test('自定义Select按精确唯一选项提交，并回读display而非搜索input', async ({ page }) => {
  await open(page)
  await page.evaluate(row => {
    for (const key of ['school', 'major', 'degree']) (window as FixtureWindow).makeCustom(document.querySelector(`[data-key="${key}"]`), [row[key]])
  }, profile.education[0])
  const result = await page.evaluate(fillMokaApplication, request())
  expect(result.state).toBe('filled')
  await expect(page.locator('[data-key="school"] [class*="sd-Input-display-value-"]')).toHaveText(profile.education[0].school)
  await expect(value(page, 'school')).toHaveValue('')
})

test('自定义Select无精确选项与重复选项保持待处理，readonly日期不会强写', async ({ page }) => {
  await open(page)
  await page.evaluate(row => {
    (window as FixtureWindow).makeCustom(document.querySelector('[data-key="school"]'), [`${row.school}分校`])
    ;(window as FixtureWindow).makeCustom(document.querySelector('[data-key="major"]'), [row.major, row.major])
    ;(document.querySelector('[data-key="birthDate"] input') as HTMLInputElement).readOnly = true
  }, profile.education[0])
  const input = request(); input.profile.birthDate = '2003-04-20'
  const result = await page.evaluate(fillMokaApplication, input)
  expect(result.fields).toEqual(expect.arrayContaining([
    expect.objectContaining({ field: 'education.0.school', status: 'unsupported' }), expect.objectContaining({ field: 'education.0.major', status: 'ambiguous' }),
    expect.objectContaining({ field: 'birthDate', status: 'unsupported' }),
  ]))
  await expect(page.locator('[data-key="school"] [class*="sd-Input-display-value-"]')).toHaveText('')
})

test('每次写入校验岗位、取消与文档变化，后续字段保持空白', async ({ page }) => {
  for (const mode of ['navigation', 'cancel', 'document']) {
    await open(page)
    await page.evaluate(({ mode, taskId }) => {
      document.querySelector('[data-key="name"] input')!.addEventListener('change', () => {
        if (mode === 'cancel') (window as FixtureWindow).__knowviaAutofillCancelled = taskId
        if (mode === 'navigation') location.hash = '#/job/11111111-1111-4111-8111-111111111111/apply'
        if (mode === 'document') document.documentElement.replaceWith(document.documentElement.cloneNode(true))
      })
    }, { mode, taskId: request().taskId })
    const result = await page.evaluate(fillMokaApplication, request())
    expect(result.state).toBe(mode === 'cancel' ? 'cancelled' : 'needs_attention')
    await expect(value(page, 'phone')).toHaveValue('')
  }
})

test('未知必填项、缺失教育、错误源日期均报告待处理', async ({ page }) => {
  await open(page)
  await page.evaluate(() => {
    document.querySelector('[data-nav-id="block-basicInfo"]')!.insertAdjacentHTML('beforeend', '<div class="apply-field-fixture"><div class="title-fixture">不可泄露的企业问题</div><input required></div>')
  })
  const input = request(); input.profile.birthDate = '2003-02-30'
  expect((await page.evaluate(fillMokaApplication, input)).fields).toEqual(expect.arrayContaining([
    expect.objectContaining({ field: 'birthDate', status: 'invalid' }), expect.objectContaining({ field: 'required.0', status: 'missing' }),
  ]))
  await page.locator('[data-nav-id="block-educationInfo"]').evaluate(node => node.remove())
  const result = await page.evaluate(fillMokaApplication, request())
  expect(result.fields).toContainEqual(expect.objectContaining({ field: 'education.0', status: 'missing' }))
  expect(JSON.stringify(result)).not.toContain('不可泄露的企业问题')
})

test('同校不同专业学历的教育经历在整块反序重绘后按语义重新绑定', async ({ page }) => {
  await open(page)
  const input = request()
  input.profile.education.push({ id: 'second', school: '合成大学', major: '数据科学', degree: '硕士', startDate: '2027年9月', endDate: '2030/06' })
  await page.evaluate(rows => {
    const section = document.querySelector('[data-nav-id="block-educationInfo"]')!
    const template = section.querySelector('.multi-fixture')!
    section.append(template.cloneNode(true))
    for (const [index, block] of [...section.querySelectorAll('.multi-fixture')].entries()) {
      const row = rows[1 - index]
      for (const key of ['school', 'major']) (block.querySelector(`[data-key="${key}"] input`) as HTMLInputElement).value = row[key]
      ;(block.querySelector('select') as HTMLSelectElement).value = index ? 'bachelor' : 'master'
    }
    section.addEventListener('change', () => {
      const blocks = [...section.querySelectorAll('.multi-fixture')]
      for (const block of blocks.reverse()) {
        const replacement = block.cloneNode(true) as HTMLElement
        for (const [index, select] of [...replacement.querySelectorAll('select')].entries()) select.value = block.querySelectorAll('select')[index].value
        block.remove(); section.append(replacement)
      }
    })
  }, input.profile.education)
  const result = await page.evaluate(fillMokaApplication, input)
  expect(result.state).toBe('filled')
  for (const row of input.profile.education) {
    const actual = await page.locator('.multi-fixture').evaluateAll(nodes => nodes.map(node => ({
      major: (node.querySelector('[data-key="major"] input') as HTMLInputElement).value,
      date: (node.querySelector('[data-key="endDate"] input') as HTMLInputElement).value,
    })))
    expect(actual.find(item => item.major === row.major)?.date).toBe(row.major === '数据科学' ? '2030-06' : '2027-06')
  }
})

test('真实年月四Select保留年和年月精度，自定义只输入搜索值无法视为已填', async ({ page }) => {
  await open(page)
  await page.evaluate(() => {
    const block = document.querySelector('.multi-fixture')!
    block.querySelector('[data-key="startDate"]')!.remove(); block.querySelector('[data-key="endDate"]')!.remove()
    block.insertAdjacentHTML('beforeend', '<div class="apply-field-fixture" data-key="range"><div class="title-fixture">就读时间</div><div class="month-range-select"></div></div>')
    const range = block.querySelector('.month-range-select')!
    for (const [position, options] of [['年', ['2023', '2027']], ['月', ['9月', '6月']], ['年', ['2023', '2027']], ['月', ['9月', '6月']]].entries()) {
      const field = document.createElement('div'); field.innerHTML = '<div class="ctrl-fixture"><input></div>'
      range.append(field); (window as FixtureWindow).makeCustom(field, options[1])
      field.querySelector('input')!.placeholder = position % 2 ? '月' : '年'
    }
  })
  const input = request()
  input.profile.education[0].startDate = '2023.09'; input.profile.education[0].endDate = '2027年'
  const result = await page.evaluate(fillMokaApplication, input)
  expect(result.state).toBe('filled')
  await expect(page.locator('.month-range-select [class*="sd-Input-display-value-"]')).toHaveText(['2023', '9月', '2027', ''])
  await page.locator('.month-range-select input').nth(3).evaluate(node => node.setAttribute('aria-required', 'true'))
  const missingMonth = await page.evaluate(fillMokaApplication, input)
  expect(missingMonth.state).toBe('needs_attention')
  expect(missingMonth.fields.some(field => field.field.startsWith('required.') && field.status === 'missing')).toBe(true)
  await page.evaluate(() => {
    const field = document.querySelector('[data-key="school"]')!
    ;(window as FixtureWindow).makeCustom(field, ['另一所合成大学'])
    field.querySelector('input')!.value = '合成大学'
  })
  const failed = await page.evaluate(fillMokaApplication, input)
  expect(failed.fields).toContainEqual(expect.objectContaining({ field: 'education.0.school', status: 'unsupported' }))
})

test('已有相同值的无效控件和异常输入类型仍需要处理', async ({ page }) => {
  await open(page)
  await value(page, 'email').fill(profile.email)
  await value(page, 'email').evaluate(node => node.setAttribute('aria-invalid', 'true'))
  await value(page, 'name').evaluate(node => node.setAttribute('type', 'password'))
  const result = await page.evaluate(fillMokaApplication, request())
  expect(result.fields).toEqual(expect.arrayContaining([
    expect.objectContaining({ field: 'email', status: 'invalid' }), expect.objectContaining({ field: 'name', status: 'unsupported' }),
  ]))
  await expect(value(page, 'name')).toHaveValue('')
})

test('原生年月日与仅年份控件保持源精度，兼容中文日期', async ({ page }) => {
  await open(page)
  await value(page, 'startDate').evaluate(node => node.setAttribute('type', 'number'))
  await value(page, 'endDate').evaluate(node => node.setAttribute('type', 'text'))
  const input = request()
  input.profile.birthDate = '2000年1月1日'
  input.profile.age = await page.evaluate(() => String(new Date().getFullYear() - 2000))
  input.profile.education[0].startDate = '2023年'; input.profile.education[0].endDate = '2027'
  const result = await page.evaluate(fillMokaApplication, input)
  expect(result.state).toBe('filled')
  await expect(value(page, 'birthDate')).toHaveValue('2000-01-01')
  await expect(value(page, 'endDate')).toHaveValue('2027')
  await expect(value(page, 'startDate')).toHaveValue('2023')
})

test('学校选项不忽略空格、临时重复section停止后续字段、任务过期立即停止', async ({ page }) => {
  await open(page)
  await page.evaluate(() => (window as FixtureWindow).makeCustom(document.querySelector('[data-key="school"]'), ['合成 大学']))
  expect((await page.evaluate(fillMokaApplication, request())).fields).toContainEqual(expect.objectContaining({ field: 'education.0.school', status: 'unsupported' }))
  await open(page)
  await value(page, 'name').evaluate(node => node.addEventListener('change', () => {
    const section = document.querySelector('[data-nav-id="block-basicInfo"]')!
    section.after(section.cloneNode(true))
  }))
  expect((await page.evaluate(fillMokaApplication, request())).state).toBe('needs_attention')
  await expect(value(page, 'phone').nth(0)).toHaveValue('')
  await open(page)
  expect((await page.evaluate(fillMokaApplication, { ...request(), expiresAt: Date.now() - 1 })).state).toBe('cancelled')
  await expect(value(page, 'name')).toHaveValue('')
  await value(page, 'name').evaluate(node => node.addEventListener('change', () => { const started = Date.now(); while (Date.now() - started < 40) { /* Simulate a slow synchronous page handler. */ } }))
  expect((await page.evaluate(fillMokaApplication, { ...request(), expiresAt: Date.now() + 30 })).state).toBe('cancelled')
  await expect(value(page, 'phone')).toHaveValue('')
})

test('没有简历教育时仍报告必填教育，必填协议只报告未完成并保持未勾选', async ({ page }) => {
  await open(page)
  await page.evaluate(() => {
    document.querySelector('[data-nav-id="block-basicInfo"]')!.insertAdjacentHTML('beforeend', '<label><input type="checkbox" id="required-consent" required>同意申请规则</label>')
  })
  const input = request(); input.profile.education = []
  const result = await page.evaluate(fillMokaApplication, input)
  expect(result.state).toBe('needs_attention')
  expect(result.fields.filter(field => field.field.startsWith('required.') && field.status === 'missing')).toHaveLength(4)
  await expect(page.locator('#required-consent')).not.toBeChecked()
  await expect(value(page, 'school')).toHaveValue('')
})

test('真实CSS星号必填字段与隐藏附件回报待处理，手机号从可见国码搜索框中准确区分', async ({ page }) => {
  await open(page)
  await page.evaluate(() => {
    document.querySelectorAll('[required]').forEach(node => node.removeAttribute('required'))
    document.querySelectorAll('[data-key="name"],[data-key="school"],[data-key="major"],[data-key="degree"]').forEach(node => {
      node.querySelector('[class^="title-"]')!.insertAdjacentHTML('beforeend', '<span class="required-asterisk-fixture"></span>')
    })
    document.querySelector('[data-key="phone"] .ctrl-fixture')!.insertAdjacentHTML('afterbegin', '<input placeholder="区号搜索" data-country="true" value="+86">')
    document.querySelector('[data-nav-id="block-basicInfo"]')!.insertAdjacentHTML('beforeend', '<div class="apply-field-fixture"><div class="title-fixture">附件简历<span class="required-asterisk-fixture"></span></div><input type="file" hidden></div>')
  })
  const input = request(); input.profile.name = ''
  const result = await page.evaluate(fillMokaApplication, input)
  expect(result.state).toBe('needs_attention')
  expect(result.fields).toEqual(expect.arrayContaining([
    expect.objectContaining({ field: 'name', status: 'missing' }), expect.objectContaining({ field: 'phone', status: 'filled' }),
    expect.objectContaining({ field: 'required.0', status: 'missing' }),
  ]))
  await expect(page.locator('[data-country]')).toHaveValue('+86')
  await expect(page.getByPlaceholder('请输入手机号')).toHaveValue(profile.phone)
})

test('同任务并发复用在途Promise，不同任务等待，完成后清理任务锁', async ({ page }) => {
  await open(page)
  await page.evaluate(() => {
    (window as FixtureWindow).fixtureChanges = 0
    document.addEventListener('change', () => { (window as FixtureWindow).fixtureChanges++ })
  })
  const input = request()
  const first = page.evaluate(fillMokaApplication, input)
  await page.waitForFunction(() => Boolean((window as FixtureWindow).__knowviaAutofillRun))
  const second = page.evaluate(fillMokaApplication, input)
  expect((await page.evaluate(fillMokaApplication, { ...input, taskId: 'another-task' })).state).toBe('waiting_form')
  const results = await Promise.all([first, second])
  expect(results[0]).toEqual(results[1])
  expect(results[0].state).toBe('filled')
  expect(await page.evaluate(() => (window as FixtureWindow).fixtureChanges)).toBe(8)
  expect(await page.evaluate(() => (window as FixtureWindow).__knowviaAutofillRun)).toBeUndefined()
})

test('最终全量回读捕获后续字段事件清空早先字段', async ({ page }) => {
  await open(page)
  await value(page, 'endDate').evaluate(node => node.addEventListener('change', () => {
    ;(document.querySelector('[data-key="email"] input') as HTMLInputElement).value = ''
  }))
  const result = await page.evaluate(fillMokaApplication, request())
  expect(result.state).toBe('needs_attention')
  expect(result.fields).toContainEqual(expect.objectContaining({ field: 'email', status: 'invalid' }))
})

test('打开自定义菜单后异步出现的已有学校保持冲突，不覆盖所选学校', async ({ page }) => {
  await open(page)
  await page.evaluate(row => {
    const field = document.querySelector('[data-key="school"]')!
    ;(window as FixtureWindow).makeCustom(field, [row.school])
    field.querySelector('input')!.addEventListener('click', () => { field.querySelector('[class*="sd-Input-display-value-"]')!.textContent = '已存在的另一大学' })
  }, profile.education[0])
  const result = await page.evaluate(fillMokaApplication, request())
  expect(result.state).toBe('needs_attention')
  expect(result.fields).toContainEqual(expect.objectContaining({ field: 'education.0.school', status: 'conflict' }))
  await expect(page.locator('[data-key="school"] [class*="sd-Input-display-value-"]')).toHaveText('已存在的另一大学')
})

test('禁用选项组不选择，已经选中的禁用选项也不视为填写完成', async ({ page }) => {
  await open(page)
  await value(page, 'degree').evaluate(node => { node.innerHTML = '<option value="">请选择</option><optgroup disabled><option value="bachelor">本科</option></optgroup>' })
  let result = await page.evaluate(fillMokaApplication, request())
  expect(result.fields).toContainEqual(expect.objectContaining({ field: 'education.0.degree', status: 'unsupported' }))
  await expect(value(page, 'degree')).toHaveValue('')
  await value(page, 'degree').evaluate(node => { (node as HTMLSelectElement).value = 'bachelor' })
  result = await page.evaluate(fillMokaApplication, request())
  expect(result.fields).toContainEqual(expect.objectContaining({ field: 'education.0.degree', status: 'invalid' }))
})

test('隐藏旧display无法冒充可见选中值，申请区域外的必填协议必须回报', async ({ page }) => {
  await open(page)
  await page.evaluate(row => {
    const field = document.querySelector('[data-key="school"]')!
    ;(window as FixtureWindow).makeCustom(field, [row.school])
    field.querySelector('[class*="sd-Select-container-"]')!.insertAdjacentHTML('afterbegin', `<span class="sd-Input-display-value-old" hidden>${row.school}</span>`)
    document.querySelector('#consent')!.setAttribute('required', '')
  }, profile.education[0])
  const result = await page.evaluate(fillMokaApplication, request())
  expect(result.state).toBe('needs_attention')
  expect(result.fields).toContainEqual(expect.objectContaining({ field: 'education.0.school', status: 'filled' }))
  await expect(page.locator('[data-key="school"] .sd-Input-display-value-fixture')).toHaveText(profile.education[0].school)
  expect(result.fields.some(field => field.field.startsWith('required.'))).toBe(true)
  await expect(page.locator('#consent')).not.toBeChecked()
})

test('填写期间出现登录浮层时停止底层表单', async ({ page }) => {
  await open(page)
  await value(page, 'name').evaluate(node => node.addEventListener('change', () => {
    document.body.insertAdjacentHTML('beforeend', '<div role="dialog">登录<input placeholder="请输入手机号"><input type="password"></div>')
  }))
  expect((await page.evaluate(fillMokaApplication, request())).state).toBe('waiting_login')
  await expect(value(page, 'phone')).toHaveValue('')
  await expect(page.locator('[role="dialog"] input').nth(0)).toHaveValue('')
})

test('年月控件中途重新排序后停止按旧顺序写入，自定义菜单中途禁用保持未选择', async ({ page }) => {
  await open(page)
  await page.evaluate(() => {
    const block = document.querySelector('.multi-fixture')!
    block.querySelector('[data-key="startDate"]')!.remove(); block.querySelector('[data-key="endDate"]')!.remove()
    block.insertAdjacentHTML('beforeend', '<div class="apply-field-fixture"><div class="title-fixture">就读时间</div><div class="month-range-select"><input placeholder="年"><input placeholder="月"><input placeholder="年"><input placeholder="月"></div></div>')
    document.querySelector('.month-range-select input')!.addEventListener('change', () => {
      document.querySelectorAll('.month-range-select input').forEach((node, index) => { (node as HTMLInputElement).placeholder = index < 2 ? '年' : '月' })
    })
  })
  expect((await page.evaluate(fillMokaApplication, request())).state).toBe('needs_attention')
  expect(await page.locator('.month-range-select input').evaluateAll(nodes => nodes.map(node => (node as HTMLInputElement).value))).toEqual(['2023', '', '', ''])
  await open(page)
  await page.evaluate(row => {
    const field = document.querySelector('[data-key="school"]')!
    ;(window as FixtureWindow).makeCustom(field, [row.school])
    field.querySelector('input')!.addEventListener('click', event => (event.target as HTMLElement).setAttribute('aria-disabled', 'true'))
  }, profile.education[0])
  const result = await page.evaluate(fillMokaApplication, request())
  expect(result.fields).toContainEqual(expect.objectContaining({ field: 'education.0.school', status: 'invalid' }))
  await expect(page.locator('[data-key="school"] [class*="sd-Input-display-value-"]')).toHaveText('')
})

test('未来出生日期与明显倒置的入学毕业日期跳过填写，同年不同精度保持兼容', async ({ page }) => {
  await open(page)
  const input = request()
  input.profile.birthDate = '2090-01-01'
  input.profile.education[0].startDate = '2028'; input.profile.education[0].endDate = '2027-06'
  const result = await page.evaluate(fillMokaApplication, input)
  expect(result.fields).toEqual(expect.arrayContaining([
    expect.objectContaining({ field: 'birthDate', status: 'invalid' }), expect.objectContaining({ field: 'education.0.startDate', status: 'conflict' }),
    expect.objectContaining({ field: 'education.0.endDate', status: 'conflict' }),
  ]))
  await expect(value(page, 'startDate')).toHaveValue('')
  await expect(value(page, 'endDate')).toHaveValue('')
  await expect(value(page, 'birthDate')).toHaveValue('')
  await expect(value(page, 'name')).toHaveValue(profile.name)
  await open(page)
  input.profile.birthDate = ''; input.profile.education[0].startDate = '2027'; input.profile.education[0].endDate = '2027-06'
  await value(page, 'startDate').evaluate(node => node.setAttribute('type', 'number'))
  expect((await page.evaluate(fillMokaApplication, input)).state).toBe('filled')
})

test('真实React19受控input的onChange和onBlur均触发，失焦校验反映在回读结果', async ({ page }) => {
  await open(page)
  const bundle = await build({ stdin: { contents: `
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    function Controlled() {
      const [value, setValue] = useState('');
      const [invalid, setInvalid] = useState(false);
      return <input data-react="true" placeholder="请输入姓名" value={value} aria-invalid={invalid}
        onChange={event => { window.fixtureReactChanges = (window.fixtureReactChanges || 0) + 1; setValue(event.target.value); }}
        onBlur={() => { window.fixtureReactBlurs = (window.fixtureReactBlurs || 0) + 1; setInvalid(true); }} />;
    }
    createRoot(document.querySelector('[data-key="name"] .ctrl-fixture')).render(<Controlled />);
  `, loader: 'jsx', resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife' })
  await page.addScriptTag({ content: bundle.outputFiles[0].text })
  await expect(page.locator('[data-react="true"]')).toBeVisible()
  const result = await page.evaluate(fillMokaApplication, request())
  expect(result.fields).toContainEqual(expect.objectContaining({ field: 'name', status: 'invalid' }))
  expect(await page.evaluate(() => (window as FixtureWindow).fixtureReactChanges)).toBe(1)
  expect(await page.evaluate(() => (window as FixtureWindow).fixtureReactBlurs)).toBe(1)
})
