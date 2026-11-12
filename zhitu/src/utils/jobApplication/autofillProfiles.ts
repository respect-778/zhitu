import type { AutofillProfileProvider } from '@/types/jobApplication/autofillTypes'

let provider: AutofillProfileProvider | undefined
export function registerAutofillProfiles(value: AutofillProfileProvider) {
  provider = value
}
export function autofillProfiles() {
  if (!provider) throw new Error('简历资料尚未就绪，请重新打开页面。')
  return provider
}
