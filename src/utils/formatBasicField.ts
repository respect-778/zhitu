import type { BasicInfo, Project } from '@/types/resume'

export function formatBasicField(value?: string, prefix?: string) {
  const text = value?.trim()
  if (!text) return ''

  const label = prefix?.trim()
  return label ? `${label}：${text}` : text
}

export function getBasicContactItems(basic: BasicInfo) {
  return [
    { key: 'email', text: formatBasicField(basic.email, basic.emailPrefix) },
    { key: 'phone', text: formatBasicField(basic.phone, basic.phonePrefix) },
    { key: 'location', text: formatBasicField(basic.location, basic.locationPrefix) },
    { key: 'age', text: formatBasicField(basic.age, basic.agePrefix) },
  ].filter(item => item.text)
}

export function getProjectLinkText(project: Project) {
  return project.linkLabel?.trim() || project.link?.trim() || ''
}

export function normalizeProjectHref(link?: string) {
  const text = link?.trim()
  if (!text) return ''
  return /^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`
}
