export interface AutofillEducation {
  id: string
  school: string
  major: string
  degree: string
  startDate: string
  endDate: string
}

export interface AutofillProfile {
  name: string
  phone: string
  email: string
  age: string
  birthDate: string
  education: AutofillEducation[]
}

export interface AutofillResumeChoice {
  id: string
  title: string
  revision: string
}

export interface AutofillProfileProvider {
  choices: () => { ownerId: string; activeId: string | null; resumes: AutofillResumeChoice[] }
  read: (resumeId: string) => { ownerId: string; revision: string; profile: AutofillProfile }
  subscribe: (listener: () => void) => () => void
}

export interface AutofillTarget {
  jobId: string
  title: string
  company: string
  jobUrl: string
}

export type AutofillFieldStatus = 'filled' | 'existing' | 'missing' | 'ambiguous' | 'conflict' | 'unsupported' | 'invalid'
export interface AutofillFieldResult {
  field: string
  status: AutofillFieldStatus
  message: string
}

export interface AutofillJobResult {
  jobId: string
  title: string
  company: string
  system?: 'moka' | 'feishu' | 'beisen'
  state: 'opening' | 'waiting_login' | 'waiting_form' | 'filling' | 'filled' | 'needs_attention' | 'failed' | 'cancelled'
  message: string
  fields: AutofillFieldResult[]
}

export interface AutofillTaskStatus {
  taskId: string
  state: 'running' | 'finished' | 'cancelled'
  jobs: AutofillJobResult[]
}
