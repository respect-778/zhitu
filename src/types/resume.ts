export interface PhotoConfig {
  width: number
  height: number
  aspectRatio: '1:1' | '4:3' | '3:4' | '16:9' | 'custom'
  borderRadius: 'none' | 'medium' | 'full' | 'custom'
  customBorderRadius: number
  visible?: boolean
}

export interface CustomFieldType {
  id: string
  label: string
  value: string
  icon?: string
  visible?: boolean
  custom?: boolean
  displayLabel?: boolean
}

export interface BasicInfo {
  name: string
  title: string
  email: string
  emailPrefix: string
  phone: string
  phonePrefix: string
  location: string
  locationPrefix: string
  age: string
  agePrefix: string
  birthDate: string
  employementStatus: string
  photo: string
  photoConfig: PhotoConfig
  customFields: CustomFieldType[]
  layout?: 'left' | 'center' | 'right'
}

export interface Education {
  id: string
  school: string
  major: string
  degree: string
  startDate: string
  endDate: string
  gpa?: string
  courses?: string
  description?: string
  visible?: boolean
}

export interface Experience {
  id: string
  company: string
  position: string
  date: string
  details: string
  visible?: boolean
}

export interface Project {
  id: string
  name: string
  role: string
  date: string
  description: string
  visible: boolean
  link?: string
  linkLabel?: string
}

export interface Certificate {
  id: string
  url: string
  width: number
}

export interface CustomItem {
  id: string
  title: string
  subtitle: string
  dateRange: string
  description: string
  visible: boolean
}

export interface GlobalSettings {
  themeColor?: string
  fontFamily?: string
  baseFontSize?: number
  pagePadding?: number
  paragraphSpacing?: number
  lineHeight?: number
  sectionSpacing?: number
  headerSize?: number
  subheaderSize?: number
}

export interface MenuSection {
  id: string
  title: string
  icon: string
  enabled: boolean
  order: number
}

export interface ResumeData {
  id: string
  title: string
  templateId: string
  createdAt: string
  updatedAt: string
  basic: BasicInfo
  education: Education[]
  experience: Experience[]
  projects: Project[]
  certificates: Certificate[]
  customData: Record<string, CustomItem[]>
  skillContent: string
  selfEvaluationContent: string
  menuSections: MenuSection[]
  globalSettings: GlobalSettings
}

export const DEFAULT_MENU_SECTIONS: MenuSection[] = [
  { id: 'basic', title: '基本信息', icon: 'user', enabled: true, order: 0 },
  { id: 'experience', title: '工作经历', icon: 'briefcase', enabled: true, order: 1 },
  { id: 'education', title: '教育背景', icon: 'book', enabled: true, order: 2 },
  { id: 'projects', title: '项目经历', icon: 'code', enabled: true, order: 3 },
  { id: 'skills', title: '专业技能', icon: 'star', enabled: true, order: 4 },
  { id: 'selfEvaluation', title: '自我评价', icon: 'smile', enabled: true, order: 5 },
]

export const DEFAULT_RESUME_DATA: Omit<ResumeData, 'id' | 'createdAt' | 'updatedAt'> = {
  title: '我的简历',
  templateId: 'minimalist',
  basic: {
    name: '',
    title: '',
    email: '',
    emailPrefix: '',
    phone: '',
    phonePrefix: '',
    location: '',
    locationPrefix: '',
    age: '',
    agePrefix: '',
    birthDate: '',
    employementStatus: '',
    photo: '',
    photoConfig: { width: 90, height: 90, aspectRatio: '1:1', borderRadius: 'full', customBorderRadius: 0, visible: true },
    customFields: [],
    layout: 'left',
  },
  education: [],
  experience: [],
  projects: [],
  certificates: [],
  customData: {},
  skillContent: '',
  selfEvaluationContent: '',
  menuSections: DEFAULT_MENU_SECTIONS,
  globalSettings: {
    themeColor: '#000000',
    fontFamily: 'PingFang SC',
    baseFontSize: 14,
    pagePadding: 40,
    paragraphSpacing: 6,
    lineHeight: 1.6,
    sectionSpacing: 20,
    headerSize: 18,
    subheaderSize: 15,
  },
}
