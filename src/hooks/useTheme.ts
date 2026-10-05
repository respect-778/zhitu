import { useSyncExternalStore } from 'react'
import { useAppSelector } from '@/store/hooks'

const subscribeSystemTheme = (onChange: () => void) => {
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

const getSystemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches

export const useTheme = () => {
  const mode = useAppSelector(state => state.theme.mode)
  const systemDark = useSyncExternalStore(subscribeSystemTheme, getSystemDark, () => false)
  const isDark = mode === 'dark' || (mode === 'system' && systemDark)
  return { mode, isDark }
}
