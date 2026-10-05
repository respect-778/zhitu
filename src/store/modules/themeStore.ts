import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type ThemeMode = 'default' | 'dark' | 'system'

const readThemeMode = (): ThemeMode => {
  try {
    const saved = localStorage.getItem('data-theme')
    if (saved === 'dark' || saved === 'system') return saved
  } catch {
    // 浏览器禁用本地存储时仍可在当前会话中切换主题。
  }
  return 'default'
}

const themeSlice = createSlice({
  name: 'theme',
  initialState: { mode: readThemeMode() },
  reducers: {
    setThemeMode(state, action: PayloadAction<ThemeMode>) {
      state.mode = action.payload
    },
  },
})

export const { setThemeMode } = themeSlice.actions
export default themeSlice.reducer
