export type JobPlatform = 'boss' | 'zhaopin' | 'liepin'

export const platformNames: Record<JobPlatform, string> = { boss: 'BOSS', zhaopin: '智联', liepin: '猎聘' }
export const platformFullNames: Record<JobPlatform, string> = { boss: 'BOSS直聘', zhaopin: '智联招聘', liepin: '猎聘网' }
const platformOrigins = { boss: 'https://www.zhipin.com', zhaopin: 'https://www.zhaopin.com', liepin: 'https://www.liepin.com' }

export function platformJobPath(platform: JobPlatform, path: string): boolean {
  const paths = { boss: /^\/job_detail\/[\w-]+\.html$/, zhaopin: /^\/jobdetail\/[A-Za-z0-9_-]+\.htm$/, liepin: /^\/(?:job|a)\/\d{1,20}\.shtml$/ }
  return paths[platform].test(path)
}

export function platformJobId(url: string, platform: JobPlatform): string {
  const path = new URL(url).pathname
  return platform === 'liepin' ? path.slice(1).replace(/\.shtml$/, '') : path.split('/').pop()!.replace(/\.html?$/, '')
}

export function platformJobLink(value: string, platform: JobPlatform): string | undefined {
  try {
    const origin = platformOrigins[platform]
    const url = new URL(value, origin)
    return url.origin === origin && !url.username && !url.password && platformJobPath(platform, url.pathname) ? url.href : undefined
  } catch { return undefined }
}
