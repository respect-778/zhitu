import { useLayoutEffect, useMemo, type PropsWithChildren } from 'react'
import { ConfigProvider, theme as antdTheme, type ThemeConfig } from 'antd'
import { useTheme } from '@/hooks/useTheme'

// 所有路由（包括独立简历编辑页）共享同一份亮暗状态。
const AppThemeProvider = ({ children }: PropsWithChildren) => {
  const { mode, isDark } = useTheme()

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'default')
    try {
      localStorage.setItem('data-theme', mode)
    } catch {
      // 本地存储不可用不影响页面配色。
    }
  }, [mode, isDark])

  const config = useMemo<ThemeConfig>(() => ({
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: '#2e5995',
      // 对齐 theme.less 的页面、卡片与浮层底色；交互状态由算法派生。
      colorBgLayout: isDark ? '#0F172A' : '#FEFDFB',
      colorBgContainer: isDark ? '#1E293B' : '#ffffff',
      colorBgElevated: isDark ? '#1E293B' : '#ffffff',
      colorText: isDark ? '#f5f5f7' : '#1d1d1f',
      colorTextSecondary: isDark ? '#86868b' : '#747479',
      colorBorder: isDark ? '#3d465a' : '#d9d9d9',
    },
  }), [isDark])

  return <ConfigProvider theme={config}>{children}</ConfigProvider>
}

export default AppThemeProvider
