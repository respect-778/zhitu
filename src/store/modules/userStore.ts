import { getUserInfoAPI, loginAPI } from "@/api/user";
import type { IUser, IUserInfo } from "@/types/user";
import { delStore, getStore, setStore } from "@/utils/store";
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AppDispatch } from "..";
import { refreshAccessTokenByFetch } from "@/api/token";

interface UserState {
  userId: string;
  username: string;
  token: string;
  userInfo: IUserInfo;
}

const initialState: UserState = {
  userId: getStore('userId') || '',
  username: getStore('username') || '',
  token: getStore('token') || '',
  userInfo: { message: '', data: { id: '', username: '', avatar: '', email: '', mobile: '', gender: 0, birthday: '', degree: '', art_count: 0, follow_count: 0, fans_count: 0, like_count: 0, community_count: 0, favorites_count: 0 }, token: '' }
}

const userStore = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setUserId(state, action: PayloadAction<string>) {
      state.userId = action.payload
      setStore('userId', action.payload) // 在本地也存储一份
    },
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
      state.userInfo = { message: '', data: { id: '', username: '', avatar: '', email: '', mobile: '', gender: 0, birthday: '', degree: '', art_count: 0, follow_count: 0, fans_count: 0, like_count: 0, community_count: 0, favorites_count: 0 }, token: '' }
      delStore('token')
      delStore('username')
      delStore('userInfo')
    }
  }
})

// 登录操作：只存 accessToken
const fetchLogin = (formData: IUser) => {
  return async (dispatch: AppDispatch) => {
    const res = await loginAPI(formData)
    dispatch(setToken(res.token)) // 在登录这里存 access token
  }
}

// OAuth 获取用户信息
const fetchOAuthSession = () => {
  return async (dispatch: AppDispatch) => {
    const token = await refreshAccessTokenByFetch()
    dispatch(setToken(token)) // 在登录这里存 access token
    await dispatch(getUserInfo())
  }
}

// 获取用户信息
const getUserInfo = () => {
  return async (dispatch: AppDispatch) => {
    const res = await getUserInfoAPI()
    dispatch(setUserId(res.data.id)) // 设置用户id
    dispatch(setUserName(res.data.username)) // 设置用户名
    dispatch(setUserInfo(res)) // 设置用户信息
  }
}

const { setUserId, setToken, setUserName, setUserInfo, clearUserInfo } = userStore.actions

const reducer = userStore.reducer

export { setUserId, setToken, setUserName, setUserInfo, clearUserInfo, fetchLogin, fetchOAuthSession, getUserInfo }
export default reducer