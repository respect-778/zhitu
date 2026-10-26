// 统一响应格式工具类

export interface ApiResponse<T = any> {
  message: string;
  data?: T;
  token?: string;
}

export class ResponseUtil {
  // 成功响应
  static success<T>(message: string = '操作成功', data?: T, token?: string): ApiResponse<T> {
    const response: ApiResponse<T> = { message };
    if (data !== undefined) response.data = data;
    if (token) response.token = token;
    return response;
  }

  // 错误响应
  static error(message: string = '操作失败'): ApiResponse {
    return { message };
  }

  // 登录响应
  static login(token: string, message: string = '登录成功'): ApiResponse {
    return { message, token };
  }

  // 用户信息响应
  static userInfo<T>(data: T, token: string, message: string = '获取成功'): ApiResponse<T> {
    return { message, data, token };
  }
}
