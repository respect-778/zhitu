export interface IUser {
  username: string
  password: string
}

export interface ILoginResponse {
  message: string
  token: string
}

// 用户个人资料
export interface IUserInfo {
  message: string
  data: {
    id: string
    username: string
    photo: string
    video?: string
    link?: string
    mobile: string
    gender: number
    birthday: string
    degree: string
  }
  token: string
}

// 用户详细资料
export interface IUserDetail {
  data: {
    id: string
    username: string
    photo?: string
    video?: string
    link?: string
    mobile: string
    gender: number
    birthday: string
    degree: string
    art_count: number // 用户发布文章数
    follow_count: number // 用户关注的数目
    fans_count: number // 用户粉丝的数量
    like_count: number // 用户被点赞数量
  },
  message: string
}