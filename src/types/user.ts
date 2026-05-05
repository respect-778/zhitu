export interface IUser {
  email: string
  password: string
}

export interface IRegister {
  username: string
  email: string
  password: string
}

// 登录响应类型
export interface ILoginResponse {
  message: string
  token: string
}

// 退出响应类型
export interface ILogoutResponse {
  message: string
}

// 用户个人资料
export interface IUserInfo {
  message: string
  data: {
    id: string
    username: string
    avatar: string
    email: string
    mobile: string
    gender: number
    birthday: string
    degree: string
    art_count: number // 发布帖子数量
    fans_count: number // 粉丝数量
    follow_count: number // 关注数量
    like_count: number // 喜欢数量
    community_count: number // 评论数量
    favorites_count: number // 收藏数量
  }
  token?: string // 双 token 模式一般不依赖 /user/info 返回 token
}