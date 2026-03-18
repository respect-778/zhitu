import httpInstance from "@/utils/http";
import type { IUser, ILoginResponse, IUserInfo, ILogoutResponse } from "@/types/user";

// 登录接口
export const loginAPI = (params: IUser): Promise<ILoginResponse> => {
  return httpInstance({
    url: "/user/login",
    method: "post",
    data: params,
    withCredentials: true,
    skipAuth: true,
    skipRefresh: true
  });
};

// 获取用户信息接口
export const getUserInfoAPI = (): Promise<IUserInfo> => {
  return httpInstance({
    url: "/user/info",
    method: "get"
  });
};

// 退出登录接口（后端会清理 refresh cookie）
export const logoutAPI = (): Promise<ILogoutResponse> => {
  return httpInstance({
    url: "/user/logout",
    method: "post",
    withCredentials: true,
    skipRefresh: true
  });
};
