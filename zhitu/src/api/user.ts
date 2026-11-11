import httpInstance from "@/utils/http";
import type { IUser, IRegister, ILoginResponse, IUserInfo, ILogoutResponse, ILearningPreferences, ILearningPreferencesResponse, IKeywordSuggestionsResponse } from "@/types/user";
import type { IUserProfileResponse } from "@/types/community";

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

// 注册接口
export const registerAPI = (params: IRegister): Promise<ILoginResponse> => {
  return httpInstance({
    url: "/user/register",
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

// 获取用户公开资料接口
export const getUserProfileAPI = (userId: number): Promise<IUserProfileResponse> => {
  return httpInstance({
    url: `/user/profile/${userId}`,
    method: 'get'
  })
}

// 更新用户信息接口
export const updateUserInfoAPI = (data: { username: string, avatar?: string, mobile: string, gender: number, birthday: string, degree: string, bio?: string }): Promise<IUserInfo> => {
  return httpInstance({
    url: "/user/info",
    method: "put",
    data
  });
}

export const getLearningPreferencesAPI = (): Promise<ILearningPreferencesResponse> => {
  return httpInstance({
    url: "/user/learning-preferences",
    method: "get"
  })
}

export const updateLearningPreferencesAPI = (data: ILearningPreferences): Promise<ILearningPreferencesResponse> => {
  return httpInstance({
    url: "/user/learning-preferences",
    method: "put",
    data
  })
}

export const generateLearningKeywordsAPI = (data: Pick<ILearningPreferences, 'direction' | 'stage' | 'goal'>): Promise<IKeywordSuggestionsResponse> => {
  return httpInstance({
    url: "/user/learning-preferences/generate-keywords",
    method: "post",
    data
  })
}

// 退出登录接口（后端会清理 refresh cookie）
export const logoutAPI = (): Promise<ILogoutResponse> => {
  return httpInstance({
    url: "/user/logout",
    method: "post",
    withCredentials: true,
    skipRefresh: true
  });
};
