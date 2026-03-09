import { setStore } from "@/utils/store"
import { createSlice, type PayloadAction } from "@reduxjs/toolkit"

interface CommunityState {
  isSaveContentValue: boolean,
  savedTitleValue: string,
  savedContentValue: string
}

const initialState: CommunityState = {
  isSaveContentValue: false,
  savedTitleValue: '',
  savedContentValue: ''
}

const communityStore = createSlice({
  name: 'community',
  initialState,
  reducers: {
    // 确定保存草稿
    confirmSave(state) {
      state.isSaveContentValue = true
      setStore('isSaveContent', state.isSaveContentValue) // 在本地存一份
    },
    // 取消保存草稿
    cancelSave(state) {
      state.isSaveContentValue = false
      setStore('isSaveContent', state.isSaveContentValue) // 在本地存一份
    },
    // 保存下来的文章标题
    setSavedTitleValue(state, action: PayloadAction<string>) {
      state.savedTitleValue = action.payload
      setStore('savedTitleValue', state.savedTitleValue) // 在本地存一份
    },
    // 保存下来的文章内容
    setSavedContentValue(state, action: PayloadAction<string>) {
      state.savedContentValue = action.payload
      setStore('savedContentValue', state.savedContentValue) // 在本地存一份
    }
  }
})

const { confirmSave, cancelSave, setSavedTitleValue, setSavedContentValue } = communityStore.actions
const reducer = communityStore.reducer

export { confirmSave, cancelSave, setSavedTitleValue, setSavedContentValue }
export default reducer