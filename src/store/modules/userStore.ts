import { getUserInfoAPI, loginAPI } from "@/api/user";
import type { IUser, IUserInfo } from "@/types/user";
import { delStore, setStore } from "@/utils/store";
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AppDispatch } from "..";

interface UserState {
  username: string;
  token: string;
  userInfo: IUserInfo;
}

const initialState: UserState = {
  username: '',
  token: '',
  userInfo: { message: '', data: { id: '', username: '', photo: '', video: '', link: '', mobile: '', gender: 0, birthday: '', degree: '', art_count: 0, follow_count: 0, fans_count: 0, like_count: 0, community_count: 0, favorites_count: 0 }, token: '' }
}

const userStore = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setToken(state, action: PayloadAction<string>) {
      state.token = action.payload
      setStore('token', action.payload) // 在本地也存储一份
    },
    setUserName(state, action: PayloadAction<string>) {
      state.username = action.payload
      setStore('username', action.payload)
    },
    setUserInfo(state, action: PayloadAction<IUserInfo>) {
      state.userInfo = action.payload
    },
    clearUserInfo(state) {
      state.token = ''
      state.username = ''
      state.userInfo = { message: '', data: { id: '', username: '', photo: '', video: '', link: '', mobile: '', gender: 0, birthday: '', degree: '', art_count: 0, follow_count: 0, fans_count: 0, like_count: 0, community_count: 0, favorites_count: 0 }, token: '' }
      delStore('token')
    }
  }
})

// 登录操作
const fetchLogin = (formData: IUser) => {
  return async (dispatch: AppDispatch) => {
    const res = await loginAPI(formData)
    dispatch(setToken(res.token))
  }
}

// 获取用户信息
const getUserInfo = () => {
  return async (dispatch: AppDispatch) => {
    const res = await getUserInfoAPI()
    dispatch(setToken(res.token)) // 获取用户token
    dispatch(setUserName(res.data.username)) // 获取用户名
    dispatch(setUserInfo(res)) // 获取用户信息
  }
}

const { setToken, setUserName, setUserInfo, clearUserInfo } = userStore.actions

const reducer = userStore.reducer

export { setToken, setUserName, setUserInfo, clearUserInfo, fetchLogin, getUserInfo }
export default reducer