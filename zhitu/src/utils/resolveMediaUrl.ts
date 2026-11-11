const API_BASE_URL = import.meta.env.VITE_BASE_URL || '/api'
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

const withApiBase = (path: string): string => {
  return `${API_BASE_URL.replace(/\/$/, '')}${path}`
}

/**
 * 将历史数据中的本地上传地址改为当前 API 地址。
 * 外部图片地址保持原样，避免影响头像、图床和 CDN 资源。
 */
export const resolveMediaUrl = (value?: string): string => {
  const source = value?.trim()
  if (!source) return ''

  if (source.startsWith('/uploads/')) {
    return withApiBase(source)
  }

  try {
    const url = new URL(source)
    if (LOCAL_HOSTS.has(url.hostname) && url.pathname.startsWith('/uploads/')) {
      return withApiBase(`${url.pathname}${url.search}${url.hash}`)
    }
  } catch {
    // 普通相对路径交给浏览器按原规则解析。
  }

  return source
}
