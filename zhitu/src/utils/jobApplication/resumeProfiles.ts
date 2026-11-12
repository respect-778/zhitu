import type { AutofillProfile, AutofillProfileProvider } from '@/types/jobApplication/autofillTypes'
import type { BasicInfo, Education, MenuSection, ResumeData } from '@/types/resume'

type AutofillResumeSource = Pick<ResumeData, 'id' | 'title'> & {
  importNeedsReview?: boolean
  basic?: Partial<Pick<BasicInfo, 'name' | 'phone' | 'email' | 'age' | 'birthDate'>>
  education?: ReadonlyArray<Partial<Education>>
  menuSections?: ReadonlyArray<Pick<MenuSection, 'id' | 'enabled'>>
}

export interface JobAutofillState {
  user: { userId: string }
  resume: {
    resumes: ReadonlyArray<AutofillResumeSource>
    activeResumeId: string | null
    storageUserId: string
    loaded: boolean
    loadRequestId?: string
  }
}

const trimField = (value: unknown) => typeof value === 'string' ? value.trim() : ''

export function buildAutofillProfile(resume: AutofillResumeSource): AutofillProfile {
  const sectionEnabled = (id: string) => resume.menuSections?.some(section => section.id === id && section.enabled) ?? true
  const basic = sectionEnabled('basic') ? resume.basic : undefined
  const education = sectionEnabled('education') ? resume.education ?? [] : []
  return {
    name: trimField(basic?.name),
    phone: trimField(basic?.phone),
    email: trimField(basic?.email),
    age: trimField(basic?.age),
    birthDate: trimField(basic?.birthDate),
    education: education.filter(item => item.visible !== false).map(item => ({
      id: trimField(item.id),
      school: trimField(item.school),
      major: trimField(item.major),
      degree: trimField(item.degree),
      startDate: trimField(item.startDate),
      endDate: trimField(item.endDate),
    })),
  }
}

function profileRevision(resume: AutofillResumeSource, profile: AutofillProfile): string {
  // FNV-1a 128-bit identifies local content changes without exposing field values.
  const bytes = new TextEncoder().encode(JSON.stringify([resume.importNeedsReview === true, profile]))
  let hash = 0x6c62272e07bb014262b821756295c58dn
  for (const byte of bytes) {
    hash ^= BigInt(byte)
    hash = BigInt.asUintN(128, hash * 0x1000000000000000000013bn)
  }
  return `profile-v1-${hash.toString(16).padStart(32, '0')}`
}

function resumesReady(state: JobAutofillState): boolean {
  return Boolean(state.user.userId && state.resume.storageUserId === state.user.userId
    && state.resume.loaded && !state.resume.loadRequestId)
}

export function createJobAutofillProvider(
  getState: () => JobAutofillState,
  subscribe: AutofillProfileProvider['subscribe'],
): AutofillProfileProvider {
  return {
    choices: () => {
      const state = getState()
      const ready = resumesReady(state)
      return {
        ownerId: state.user.userId,
        activeId: ready ? state.resume.activeResumeId : null,
        resumes: ready ? state.resume.resumes.map(resume => ({
          id: resume.id,
          title: resume.title,
          revision: profileRevision(resume, buildAutofillProfile(resume)),
        })) : [],
      }
    },
    read: resumeId => {
      const state = getState()
      if (!resumesReady(state)) throw new Error('当前账号的简历资料尚未就绪，请等待加载完成后重试。')
      const resume = state.resume.resumes.find(item => item.id === resumeId)
      if (!resume) throw new Error('所选简历已不存在，请重新选择简历。')
      if (resume.importNeedsReview) throw new Error('这份导入简历需要核对，请先在简历编辑器中确认并完善信息，再使用自动填写。')
      const profile = buildAutofillProfile(resume)
      return { ownerId: state.user.userId, revision: profileRevision(resume, profile), profile }
    },
    subscribe,
  }
}
