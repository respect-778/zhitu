import httpInstance from '@/utils/http'
import type { ResumeData } from '@/types/resume'
import type { SaveSnapshot } from '@/utils/workspaceSaveQueue'

export interface ResumeCollection { resumes: ResumeData[] }
export const getResumesAPI = (): Promise<SaveSnapshot<ResumeCollection>> => httpInstance({ url: '/resume/workspace', method: 'get' })
export const saveResumesAPI = (data: ResumeCollection, revision: number, keepalive = false): Promise<SaveSnapshot<ResumeCollection>> => httpInstance({
  url: '/resume/workspace', method: 'put', data: { data, revision },
  ...(keepalive ? { adapter: 'fetch', fetchOptions: { keepalive: true } } : {}),
})
