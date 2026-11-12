import { test, expect } from '@playwright/test'
import { createJobAutofillProvider, type JobAutofillState } from '../../src/utils/jobApplication/resumeProfiles'
import { autofillProfiles, registerAutofillProfiles } from '../../src/utils/jobApplication/autofillProfiles'
import { DEFAULT_RESUME_DATA, type ResumeData } from '../../src/types/resume'

function resumeFixture(id = 'resume-a'): ResumeData & { importNeedsReview?: boolean; sourceText?: string } {
  return {
    ...structuredClone(DEFAULT_RESUME_DATA),
    id,
    title: `简历 ${id}`,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    basic: {
      ...structuredClone(DEFAULT_RESUME_DATA.basic),
      name: ' 林小橙 ',
      phone: ' 13800138000 ',
      email: ' example@example.com ',
      age: ' 23 ',
      birthDate: ' 2002年11月 ',
    },
    education: [
      { id: 'undergraduate', school: ' 橙子大学 ', major: ' 金融学 ', degree: ' 本科 ', startDate: ' 2020 ', endDate: ' 2024-06 ' },
      { id: 'graduate', school: '橙子研究院', major: '金融科技', degree: '硕士', startDate: '2024年9月', endDate: '至今', visible: true },
      { id: 'hidden', school: '隐藏学校', major: '隐藏专业', degree: '高中', startDate: '2017', endDate: '2020', visible: false },
    ],
  }
}

function registerFixture(resumes: JobAutofillState['resume']['resumes'] = [resumeFixture()]) {
  const state: JobAutofillState = {
    user: { userId: 'user-a' },
    resume: { resumes, storageUserId: 'user-a', loaded: true, activeResumeId: resumes[0]?.id ?? null },
  }
  const listeners = new Set<() => void>()
  registerAutofillProfiles(createJobAutofillProvider(() => state, listener => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }))
  return { state, provider: autofillProfiles(), notify: () => listeners.forEach(listener => listener()) }
}

test('注册入口投影最小资料，逐段关联可见教育并保留日期精度', () => {
  const resume = resumeFixture()
  resume.sourceText = '原始全文不得传出'
  resume.sourceDocumentId = 'original-document'
  resume.basic.photo = 'data:image/png;base64,original-photo'
  resume.basic.customFields = [{ id: 'private', label: '私有字段', value: '私有内容' }]
  resume.experience = [{ id: 'work', company: '私有公司', position: '私有岗位', date: '2024', details: '私有经历' }]
  resume.projects = [{ id: 'project', name: '私有项目', role: '负责人', date: '2024', description: '私有项目详情', visible: true }]
  const { provider } = registerFixture([resume])

  expect(provider.choices()).toEqual({
    ownerId: 'user-a', activeId: 'resume-a',
    resumes: [{ id: 'resume-a', title: '简历 resume-a', revision: expect.any(String) }],
  })
  const result = provider.read('resume-a')
  expect(result.profile).toEqual({
    name: '林小橙', phone: '13800138000', email: 'example@example.com', age: '23', birthDate: '2002年11月',
    education: [
      { id: 'undergraduate', school: '橙子大学', major: '金融学', degree: '本科', startDate: '2020', endDate: '2024-06' },
      { id: 'graduate', school: '橙子研究院', major: '金融科技', degree: '硕士', startDate: '2024年9月', endDate: '至今' },
    ],
  })
  expect(result.revision).toBe(provider.choices().resumes[0].revision)
  const serialized = JSON.stringify([result, provider.choices()])
  for (const privateValue of ['原始全文', 'original-document', 'original-photo', '私有', '隐藏学校', '隐藏专业']) {
    expect(serialized).not.toContain(privateValue)
  }
})

test('当前账号切换后不会返回上一账号简历，读取会重新验证归属', () => {
  const { state, provider } = registerFixture()
  expect(provider.choices().resumes).toHaveLength(1)
  state.user.userId = 'user-b'
  expect(provider.choices()).toEqual({ ownerId: 'user-b', activeId: null, resumes: [] })
  expect(() => provider.read('resume-a')).toThrow(/当前账号.*尚未就绪/)

  state.resume.storageUserId = 'user-b'
  state.resume.resumes = [resumeFixture('resume-b')]
  state.resume.activeResumeId = 'resume-b'
  expect(provider.read('resume-b').ownerId).toBe('user-b')
  expect(() => provider.read('resume-a')).toThrow(/不存在/)
})

test('隐藏整个教育模块会清空教育投影并更新版本，恢复后复用原内容版本', () => {
  const resume = resumeFixture()
  const { provider } = registerFixture([resume])
  const before = provider.read(resume.id)
  const educationSection = resume.menuSections.find(section => section.id === 'education')!
  educationSection.enabled = false
  const hidden = provider.read(resume.id)
  expect(hidden.profile.education).toEqual([])
  expect(hidden.profile.name).toBe(before.profile.name)
  expect(hidden.revision).not.toBe(before.revision)
  expect(provider.choices().resumes[0].revision).toBe(hidden.revision)
  educationSection.enabled = true
  expect(provider.read(resume.id)).toEqual(before)
})

test('已关闭的基本信息模块清空姓名联系方式年龄生日并更新版本', () => {
  const resume = resumeFixture()
  const { provider } = registerFixture([resume])
  const before = provider.read(resume.id)
  const basicSection = resume.menuSections.find(section => section.id === 'basic')!
  basicSection.enabled = false
  const hidden = provider.read(resume.id)
  expect(hidden.profile).toEqual({ name: '', phone: '', email: '', age: '', birthDate: '', education: before.profile.education })
  expect(hidden.revision).not.toBe(before.revision)
  expect(provider.choices().resumes[0].revision).toBe(hidden.revision)
  basicSection.enabled = true
  expect(provider.read(resume.id)).toEqual(before)
})

test('章节列表中缺少模块或列表为空时遵循模板隐藏语义', () => {
  const resume = resumeFixture()
  const { provider } = registerFixture([resume])
  resume.menuSections = resume.menuSections.filter(section => section.id !== 'education')
  expect(provider.read(resume.id).profile.education).toEqual([])
  expect(provider.read(resume.id).profile.name).toBe('林小橙')
  resume.menuSections = []
  expect(provider.read(resume.id).profile).toEqual({ name: '', phone: '', email: '', age: '', birthDate: '', education: [] })
})

test('未加载、重新加载和空账号均拒绝提供简历', () => {
  const { state, provider } = registerFixture()
  state.resume.loaded = false
  expect(provider.choices().resumes).toEqual([])
  expect(() => provider.read('resume-a')).toThrow(/尚未就绪/)
  state.resume.loaded = true
  state.resume.loadRequestId = 'request-pending'
  expect(provider.choices().resumes).toEqual([])
  expect(() => provider.read('resume-a')).toThrow(/尚未就绪/)
  state.resume.loadRequestId = undefined
  state.user.userId = ''
  state.resume.storageUserId = ''
  expect(provider.choices().resumes).toEqual([])
  expect(() => provider.read('resume-a')).toThrow(/尚未就绪/)
})

test('多简历使用当前激活项，读取明确选择的简历且拒绝已删除项', () => {
  const first = resumeFixture()
  const second = resumeFixture('resume-b')
  second.basic.name = '另一位候选人'
  const { state, provider } = registerFixture([first, second])
  state.resume.activeResumeId = second.id
  expect(provider.choices().activeId).toBe(second.id)
  expect(provider.choices().resumes.map(item => item.id)).toEqual([first.id, second.id])
  expect(provider.read(first.id).profile.name).toBe('林小橙')
  expect(provider.read(second.id).profile.name).toBe('另一位候选人')
  state.resume.resumes = [first]
  expect(() => provider.read(second.id)).toThrow(/不存在/)
})

test('版本稳定追踪投影内容和待核对状态，编辑时间戳相同也能识别修改', () => {
  const resume = resumeFixture()
  const { provider } = registerFixture([resume])
  const revision = provider.read(resume.id).revision
  expect(revision).toMatch(/^profile-v1-[0-9a-f]{32}$/)
  expect(revision.length).toBeLessThanOrEqual(200)
  expect(provider.read(resume.id).revision).toBe(revision)
  expect(provider.choices().resumes[0].revision).toBe(revision)
  resume.basic.name = '修改姓名'
  const edited = provider.read(resume.id).revision
  expect(edited).not.toBe(revision)
  expect(provider.choices().resumes[0].revision).toBe(edited)
  resume.basic.name = '林小橙'
  expect(provider.read(resume.id).revision).toBe(revision)
  resume.education[0].school = '另一所大学'
  expect(provider.read(resume.id).revision).not.toBe(revision)
  resume.education[0].school = '橙子大学'
  resume.sourceText = '修改原始全文'
  resume.education[2].school = '修改隐藏学校'
  resume.updatedAt = '2026-11-11'
  expect(provider.read(resume.id).revision).toBe(revision)
  resume.importNeedsReview = true
  expect(provider.choices().resumes[0].revision).not.toBe(revision)
  expect(() => provider.read(resume.id)).toThrow(/先在简历编辑器.*确认/)
})

test('旧简历缺省字段返回空字符串和空教育，年龄与生日保留源内容', () => {
  const legacy = { id: 'legacy', title: '旧简历' }
  const { provider } = registerFixture([legacy])
  expect(provider.read(legacy.id).profile).toEqual({ name: '', phone: '', email: '', age: '', birthDate: '', education: [] })
  const partial = { id: 'partial', title: '部分字段', basic: { age: ' 50 ', birthDate: ' 2002-11-12 ' }, education: [{ id: 'school', school: '旧学校' }] }
  const { provider: partialProvider } = registerFixture([partial])
  expect(partialProvider.read(partial.id).profile).toEqual({
    name: '', phone: '', email: '', age: '50', birthDate: '2002-11-12',
    education: [{ id: 'school', school: '旧学校', major: '', degree: '', startDate: '', endDate: '' }],
  })
})

test('订阅沿用 store 通知并支持取消，读取结果不持有源教育对象', () => {
  const resume = resumeFixture()
  const { provider, notify } = registerFixture([resume])
  let count = 0
  const unsubscribe = provider.subscribe(() => { count += 1 })
  notify()
  expect(count).toBe(1)
  unsubscribe()
  notify()
  expect(count).toBe(1)
  const result = provider.read(resume.id)
  result.profile.education[0].school = '调用方修改'
  expect(provider.read(resume.id).profile.education[0].school).toBe('橙子大学')
})
