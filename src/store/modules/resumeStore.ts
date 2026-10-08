import { createSlice, createAsyncThunk, createListenerMiddleware, type PayloadAction } from '@reduxjs/toolkit'
import type { ResumeData, BasicInfo, Education, Experience, Project, GlobalSettings, MenuSection } from '@/types/resume'
import { DEFAULT_RESUME_DATA } from '@/types/resume'
import { getResumesAPI, saveResumesAPI, type ResumeCollection } from '@/api/resume'
import { getStore } from '@/utils/store'
import { mergeResumeCopies, normalizeResumes } from '@/utils/resumePersistence'
import { WorkspaceSaveQueue, type SaveSnapshot, type SaveState, type WorkspaceSyncStatus } from '@/utils/workspaceSaveQueue'

interface ResumeState {
  resumes: ResumeData[]
  activeResumeId: string | null
  activeSection: string
  storageUserId: string
  revision: number | null
  syncStatus: WorkspaceSyncStatus
  syncError: string
  loaded: boolean
  loadRequestId?: string
}

const STORAGE_KEY_PREFIX = 'zhitu_resumes'

const getStorageKey = (userId: string) => `${STORAGE_KEY_PREFIX}_${userId}`

const loadFromStorage = (userId: string): ResumeData[] => {
  try {
    const raw = localStorage.getItem(getStorageKey(userId))
    return raw ? normalizeResumes(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

const saveToStorage = (userId: string, resumes: ResumeData[]) => {
  if (!userId) return
  try { localStorage.setItem(getStorageKey(userId), JSON.stringify(resumes)) } catch { /* 云端保存仍继续；队列会另行反馈草稿缓存失败。 */ }
}

const persistCurrentUserResumes = (state: ResumeState) => {
  saveToStorage(state.storageUserId, state.resumes)
}

const initialState: ResumeState = {
  resumes: [],
  activeResumeId: null,
  activeSection: 'basic',
  storageUserId: '',
  revision: null,
  syncStatus: 'loading',
  syncError: '',
  loaded: false,
}

const clientId = sessionStorage.getItem('zhitu_resume_client') || crypto.randomUUID()
sessionStorage.setItem('zhitu_resume_client', clientId)
const draftKey = (uid: string) => `zhitu_resume_draft_${uid}_${clientId}`
const migrationKey = (uid: string) => `zhitu_resume_migrated_${uid}`
type Draft = { data: ResumeCollection; revision: number | null }
const readDraft = (uid: string): Draft | undefined => {
  try {
    const raw = localStorage.getItem(draftKey(uid))
    if (!raw) return
    const draft = JSON.parse(raw)
    return { data: { resumes: normalizeResumes(draft.data.resumes) }, revision: draft.revision }
  } catch { return undefined }
}
let onSyncState: ((uid: string, sync: SaveState<ResumeCollection>) => void) | undefined
export const resumeSaveQueue = new WorkspaceSaveQueue<ResumeCollection>(
  async (uid, data, revision, keepalive) => {
    if (getStore('userId') !== uid) throw new Error('当前账号已切换')
    return saveResumesAPI(data, revision, keepalive)
  },
  (uid, sync) => {
    let cacheError = false
    try {
      if (sync.pending) localStorage.setItem(draftKey(uid), JSON.stringify({ data: sync.pending, revision: sync.revision }))
      else localStorage.removeItem(draftKey(uid))
      if (sync.savedData && !sync.pending) {
        saveToStorage(uid, sync.savedData.resumes)
        localStorage.setItem(migrationKey(uid), '1')
      }
    } catch { cacheError = true }
    onSyncState?.(uid, { ...sync, message: cacheError ? '浏览器缓存空间不足，请保持页面打开直至服务器保存成功' : sync.message })
  },
)
export const bindResumeSync = (callback: NonNullable<typeof onSyncState>) => { onSyncState = callback }
export const flushResumes = (keepalive = false) => resumeSaveQueue.flush(getStore('userId') || '', keepalive)

export const loadUserResumes = createAsyncThunk('resume/loadUserResumes', async (uid: string) => {
  if (getStore('userId') !== uid) throw new Error('当前账号已切换')
  const draft = readDraft(uid)
  try {
    const snapshot = await getResumesAPI()
    if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0) throw new Error('服务器简历版本无效')
    if (snapshot.data) snapshot.data = { resumes: normalizeResumes(snapshot.data.resumes) }
    if (getStore('userId') !== uid) throw new Error('当前账号已切换')
    const legacy = !localStorage.getItem(migrationKey(uid)) ? loadFromStorage(uid) : []
    return { uid, snapshot, draft, legacy, offline: false }
  } catch {
    if (getStore('userId') !== uid) throw new Error('当前账号已切换')
    return { uid, snapshot: { data: { resumes: loadFromStorage(uid) }, revision: 0 } as SaveSnapshot<ResumeCollection>, draft, legacy: [], offline: true }
  }
}, { condition: (uid, { getState }) => {
  const state = (getState() as { resume: ResumeState }).resume
  return !(state.storageUserId === uid && state.loadRequestId)
} })

export const recoverResumes = createAsyncThunk('resume/recoverResumes', async (uid: string) => {
  if (getStore('userId') !== uid) throw new Error('当前账号已切换')
  await resumeSaveQueue.flush(uid)
  const snapshot = await getResumesAPI()
  if (!Number.isSafeInteger(snapshot.revision)) throw new Error('服务器简历版本无效')
  const draft = resumeSaveQueue.peek(uid)?.pending || readDraft(uid)?.data
  const remote = normalizeResumes(snapshot.data?.resumes || [])
  const data = { resumes: mergeResumeCopies(remote, draft?.resumes || []) }
  if (getStore('userId') !== uid) throw new Error('当前账号已切换')
  return { uid, snapshot: { ...snapshot, data: snapshot.data ? { resumes: remote } : null }, data }
})

const resumeSlice = createSlice({
  name: 'resume',
  initialState,
  reducers: {
    applyResumeCollection(state, action: PayloadAction<{ uid: string; data: ResumeCollection }>) {
      if (state.storageUserId !== action.payload.uid) return
      state.resumes = action.payload.data.resumes
    },
    setResumeSync(state, action: PayloadAction<{ uid: string; sync: SaveState<ResumeCollection> }>) {
      if (state.storageUserId !== action.payload.uid) return
      state.revision = action.payload.sync.revision
      state.syncStatus = action.payload.sync.status
      state.syncError = action.payload.sync.message
    },
    // 清楚本地简历
    clearResumeState(state) {
      state.resumes = []
      state.activeResumeId = null
      state.activeSection = 'basic'
      state.storageUserId = ''
      state.revision = null
      state.loaded = false
      state.loadRequestId = undefined
      state.syncStatus = 'loading'
      state.syncError = ''
    },
    createResume(state, action: PayloadAction<{ id: string; title: string; templateId: string; prefill?: Partial<ResumeData> }>) {
      const now = new Date().toISOString()
      const prefill = action.payload.prefill
      const resume: ResumeData = {
        ...DEFAULT_RESUME_DATA,
        ...prefill,
        basic: {
          ...DEFAULT_RESUME_DATA.basic,
          ...prefill?.basic,
        },
        globalSettings: {
          ...DEFAULT_RESUME_DATA.globalSettings,
          ...prefill?.globalSettings,
        },
        menuSections: (prefill?.menuSections ?? DEFAULT_RESUME_DATA.menuSections).map(section => ({ ...section })),
        education: prefill?.education?.map(item => ({ ...item })) ?? [],
        experience: prefill?.experience?.map(item => ({ ...item })) ?? [],
        projects: prefill?.projects?.map(item => ({ ...item })) ?? [],
        certificates: prefill?.certificates?.map(item => ({ ...item })) ?? [],
        customData: prefill?.customData ? { ...prefill.customData } : {},
        id: action.payload.id,
        title: action.payload.title,
        templateId: action.payload.templateId,
        createdAt: now,
        updatedAt: now,
      }
      state.resumes.push(resume)
      state.activeResumeId = resume.id
      persistCurrentUserResumes(state)
    },
    deleteResume(state, action: PayloadAction<string>) {
      state.resumes = state.resumes.filter(r => r.id !== action.payload)
      if (state.activeResumeId === action.payload) state.activeResumeId = null
      persistCurrentUserResumes(state)
    },
    setActiveResume(state, action: PayloadAction<string>) {
      state.activeResumeId = action.payload
    },
    setActiveSection(state, action: PayloadAction<string>) {
      state.activeSection = action.payload
    },
    updateBasicInfo(state, action: PayloadAction<Partial<BasicInfo>>) {
      const resume = state.resumes.find(r => r.id === state.activeResumeId)
      if (!resume) return
      resume.basic = { ...resume.basic, ...action.payload }
      resume.updatedAt = new Date().toISOString()
      persistCurrentUserResumes(state)
    },
    addEducation(state, action: PayloadAction<Omit<Education, 'id'>>) {
      const resume = state.resumes.find(r => r.id === state.activeResumeId)
      if (!resume) return
      resume.education.push({ ...action.payload, id: crypto.randomUUID() })
      resume.updatedAt = new Date().toISOString()
      persistCurrentUserResumes(state)
    },
    updateEducation(state, action: PayloadAction<{ id: string; data: Partial<Education> }>) {
      const resume = state.resumes.find(r => r.id === state.activeResumeId)
      if (!resume) return
      const idx = resume.education.findIndex(e => e.id === action.payload.id)
      if (idx !== -1) resume.education[idx] = { ...resume.education[idx], ...action.payload.data }
      resume.updatedAt = new Date().toISOString()
      persistCurrentUserResumes(state)
    },
    removeEducation(state, action: PayloadAction<string>) {
      const resume = state.resumes.find(r => r.id === state.activeResumeId)
      if (!resume) return
      resume.education = resume.education.filter(e => e.id !== action.payload)
      resume.updatedAt = new Date().toISOString()
      persistCurrentUserResumes(state)
    },
    addExperience(state, action: PayloadAction<Omit<Experience, 'id'>>) {
      const resume = state.resumes.find(r => r.id === state.activeResumeId)
      if (!resume) return
      resume.experience.push({ ...action.payload, id: crypto.randomUUID() })
      resume.updatedAt = new Date().toISOString()
      persistCurrentUserResumes(state)
    },
    updateExperience(state, action: PayloadAction<{ id: string; data: Partial<Experience> }>) {
      const resume = state.resumes.find(r => r.id === state.activeResumeId)
      if (!resume) return
      const idx = resume.experience.findIndex(e => e.id === action.payload.id)
      if (idx !== -1) resume.experience[idx] = { ...resume.experience[idx], ...action.payload.data }
      resume.updatedAt = new Date().toISOString()
      persistCurrentUserResumes(state)
    },
    removeExperience(state, action: PayloadAction<string>) {
      const resume = state.resumes.find(r => r.id === state.activeResumeId)
      if (!resume) return
      resume.experience = resume.experience.filter(e => e.id !== action.payload)
      resume.updatedAt = new Date().toISOString()
      persistCurrentUserResumes(state)
    },
    addProject(state, action: PayloadAction<Omit<Project, 'id'>>) {
      const resume = state.resumes.find(r => r.id === state.activeResumeId)
      if (!resume) return
      resume.projects.push({ ...action.payload, id: crypto.randomUUID() })
      resume.updatedAt = new Date().toISOString()
      persistCurrentUserResumes(state)
    },
    updateProject(state, action: PayloadAction<{ id: string; data: Partial<Project> }>) {
      const resume = state.resumes.find(r => r.id === state.activeResumeId)
      if (!resume) return
      const idx = resume.projects.findIndex(p => p.id === action.payload.id)
      if (idx !== -1) resume.projects[idx] = { ...resume.projects[idx], ...action.payload.data }
      resume.updatedAt = new Date().toISOString()
      persistCurrentUserResumes(state)
    },
    removeProject(state, action: PayloadAction<string>) {
      const resume = state.resumes.find(r => r.id === state.activeResumeId)
      if (!resume) return
      resume.projects = resume.projects.filter(p => p.id !== action.payload)
      resume.updatedAt = new Date().toISOString()
      persistCurrentUserResumes(state)
    },
    updateSkillContent(state, action: PayloadAction<string>) {
      const resume = state.resumes.find(r => r.id === state.activeResumeId)
      if (!resume) return
      resume.skillContent = action.payload
      resume.updatedAt = new Date().toISOString()
      persistCurrentUserResumes(state)
    },
    updateSelfEvaluation(state, action: PayloadAction<string>) {
      const resume = state.resumes.find(r => r.id === state.activeResumeId)
      if (!resume) return
      resume.selfEvaluationContent = action.payload
      resume.updatedAt = new Date().toISOString()
      persistCurrentUserResumes(state)
    },
    updateGlobalSettings(state, action: PayloadAction<Partial<GlobalSettings>>) {
      const resume = state.resumes.find(r => r.id === state.activeResumeId)
      if (!resume) return
      resume.globalSettings = { ...resume.globalSettings, ...action.payload }
      resume.updatedAt = new Date().toISOString()
      persistCurrentUserResumes(state)
    },
    updateMenuSections(state, action: PayloadAction<MenuSection[]>) {
      const resume = state.resumes.find(r => r.id === state.activeResumeId)
      if (!resume) return
      resume.menuSections = action.payload
      resume.updatedAt = new Date().toISOString()
      persistCurrentUserResumes(state)
    },
    updateResumeTitle(state, action: PayloadAction<string>) {
      const resume = state.resumes.find(r => r.id === state.activeResumeId)
      if (!resume) return
      resume.title = action.payload
      resume.updatedAt = new Date().toISOString()
      persistCurrentUserResumes(state)
    },
  },
  extraReducers: builder => builder
    .addCase(loadUserResumes.pending, (state, action) => {
      if (state.storageUserId !== action.meta.arg) {
        state.resumes = loadFromStorage(action.meta.arg)
        state.activeResumeId = null
        state.activeSection = 'basic'
        state.revision = null
        state.loaded = false
      }
      state.storageUserId = action.meta.arg
      state.loadRequestId = action.meta.requestId
      state.syncStatus = 'loading'
    })
    .addCase(loadUserResumes.fulfilled, (state, action) => {
      if (state.loadRequestId !== action.meta.requestId) return
      state.loaded = true
      state.loadRequestId = undefined
    })
    .addCase(loadUserResumes.rejected, (state, action) => {
      if (state.loadRequestId !== action.meta.requestId) return
      state.loadRequestId = undefined
      state.loaded = true
      state.syncStatus = 'error'
      state.syncError = action.error.message || '加载失败，请重试'
    }),
})

export const {
  clearResumeState, applyResumeCollection, setResumeSync,
  createResume, deleteResume, setActiveResume, setActiveSection,
  updateBasicInfo, addEducation, updateEducation, removeEducation,
  addExperience, updateExperience, removeExperience,
  addProject, updateProject, removeProject,
  updateSkillContent, updateSelfEvaluation,
  updateGlobalSettings, updateMenuSections, updateResumeTitle,
} = resumeSlice.actions

export const resumeSyncListener = createListenerMiddleware()
resumeSyncListener.startListening({ actionCreator: loadUserResumes.fulfilled, effect: (action, api) => {
  const { uid, snapshot, draft, legacy, offline } = action.payload
  if (getStore('userId') !== uid) return
  if (offline) {
    const pending = resumeSaveQueue.peek(uid)?.pending || draft?.data || snapshot.data || { resumes: [] }
    api.dispatch(applyResumeCollection({ uid, data: pending }))
    resumeSaveQueue.enqueue(uid, pending, null)
    return
  }
  const existingPending = resumeSaveQueue.peek(uid)?.pending
  const migration = !existingPending && !draft && legacy.length ? { data: { resumes: mergeResumeCopies(snapshot.data?.resumes || [], legacy) }, revision: snapshot.revision } : draft
  resumeSaveQueue.initialize(uid, snapshot, migration)
  // 刷新请求可能早于一次保存完成：以队列接受的版本为准，不能用迟到的旧响应回填界面。
  const accepted = resumeSaveQueue.peek(uid)
  api.dispatch(applyResumeCollection({ uid, data: accepted?.pending || accepted?.savedData || { resumes: [] } }))
} })
resumeSyncListener.startListening({ actionCreator: recoverResumes.fulfilled, effect: (action, api) => {
  const { uid, snapshot, data } = action.payload
  if (getStore('userId') !== uid) return
  resumeSaveQueue.replaceBaseline(uid, snapshot)
  api.dispatch(applyResumeCollection({ uid, data }))
  resumeSaveQueue.enqueue(uid, data, snapshot.revision)
  void resumeSaveQueue.flush(uid)
} })
resumeSyncListener.startListening({ predicate: (action, current, previous) => {
  const before = (previous as { resume: ResumeState }).resume
  const after = (current as { resume: ResumeState }).resume
  return action.type.startsWith('resume/') && !['resume/applyResumeCollection', 'resume/clearResumeState', 'resume/loadUserResumes/pending'].includes(action.type)
    && after.loaded && after.storageUserId === getStore('userId') && before.resumes !== after.resumes
}, effect: (_, api) => {
  const state = (api.getState() as { resume: ResumeState }).resume
  resumeSaveQueue.enqueue(state.storageUserId, JSON.parse(JSON.stringify({ resumes: state.resumes })), state.revision)
} })

export default resumeSlice.reducer
