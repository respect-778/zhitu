import httpInstance from "@/utils/http";
import type { IUser, ILoginResponse, IUserInfo } from "@/types/user";

// 登录接口
export const loginAPI = (params: IUser): Promise<ILoginResponse> => {
  return httpInstance({
    url: "/api/user/login",
    method: "post",
    data: params
  })
}

// 获取用户信息接口
export const getUserInfoAPI = (): Promise<IUserInfo> => {
  return httpInstance({
    url: "/api/user/info",  
    method: "get"
  })
}
