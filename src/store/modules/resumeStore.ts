import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { ResumeData, BasicInfo, Education, Experience, Project, GlobalSettings, MenuSection } from '@/types/resume'
import { DEFAULT_RESUME_DATA } from '@/types/resume'

interface ResumeState {
  resumes: ResumeData[]
  activeResumeId: string | null
  activeSection: string
  storageUserId: string
}

const STORAGE_KEY_PREFIX = 'zhitu_resumes'

const getStorageKey = (userId: string) => `${STORAGE_KEY_PREFIX}_${userId}`

const loadFromStorage = (userId: string): ResumeData[] => {
  try {
    const raw = localStorage.getItem(getStorageKey(userId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

const saveToStorage = (userId: string, resumes: ResumeData[]) => {
  if (!userId) return
  localStorage.setItem(getStorageKey(userId), JSON.stringify(resumes))
}

const persistCurrentUserResumes = (state: ResumeState) => {
  saveToStorage(state.storageUserId, state.resumes)
}

const initialState: ResumeState = {
  resumes: [],
  activeResumeId: null,
  activeSection: 'basic',
  storageUserId: '',
}

const resumeSlice = createSlice({
  name: 'resume',
  initialState,
  reducers: {
    // 按用户加载本地简历，避免不同账号共用同一个 localStorage key。
    loadUserResumes(state, action: PayloadAction<string>) {
      const userId = action.payload.trim()
      state.storageUserId = userId
      state.resumes = userId ? loadFromStorage(userId) : []
      state.activeResumeId = null
      state.activeSection = 'basic'
    },
    // 清楚本地简历
    clearResumeState(state) {
      state.resumes = []
      state.activeResumeId = null
      state.activeSection = 'basic'
      state.storageUserId = ''
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
})

export const {
  loadUserResumes, clearResumeState,
  createResume, deleteResume, setActiveResume, setActiveSection,
  updateBasicInfo, addEducation, updateEducation, removeEducation,
  addExperience, updateExperience, removeExperience,
  addProject, updateProject, removeProject,
  updateSkillContent, updateSelfEvaluation,
  updateGlobalSettings, updateMenuSections, updateResumeTitle,
} = resumeSlice.actions

export default resumeSlice.reducer
