import type { ResumeData } from '../types/resume'
import { DEFAULT_RESUME_DATA } from '../types/resume'

export function normalizeResumes(input: unknown): ResumeData[] {
  if (!Array.isArray(input)) throw new Error('简历集合格式损坏，原缓存已保留')
  const ids = new Set<string>()
  return input.map(value => {
    if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !value.id || ids.has(value.id)) {
      throw new Error('简历编号无效，原缓存已保留')
    }
    ids.add(value.id)
    for (const key of ['education', 'experience', 'projects', 'certificates', 'menuSections']) {
      if (value[key] !== undefined && !Array.isArray(value[key])) throw new Error('简历内容格式损坏，原缓存已保留')
    }
    const defaults = structuredClone(DEFAULT_RESUME_DATA)
    return {
      ...defaults, ...value,
      basic: { ...defaults.basic, ...value.basic, photoConfig: { ...defaults.basic.photoConfig, ...value.basic?.photoConfig } },
      globalSettings: { ...defaults.globalSettings, ...value.globalSettings },
      createdAt: value.createdAt || new Date().toISOString(), updatedAt: value.updatedAt || new Date().toISOString(),
    } as ResumeData
  })
}

/** 首次迁移和冲突恢复均保留远端，相同编号的不同内容生成恢复副本。 */
export function mergeResumeCopies(remote: ResumeData[], local: ResumeData[], newId = () => crypto.randomUUID()): ResumeData[] {
  const merged = structuredClone(remote)
  for (const resume of local) {
    const existing = merged.find(item => item.id === resume.id)
    if (!existing) { merged.push(structuredClone(resume)); continue }
    if (JSON.stringify(existing) === JSON.stringify(resume)) continue
    const id = newId()
    if (merged.some(item => item.id === id)) throw new Error('恢复副本编号重复')
    merged.push({ ...structuredClone(resume), id, title: `${resume.title || '简历'}（本地恢复副本）`, updatedAt: new Date().toISOString() })
  }
  return merged
}
