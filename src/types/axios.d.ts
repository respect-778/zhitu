import 'axios'

// 声明模块扩展 -> 对 axios 模块进行扩展
declare module 'axios' {
  export interface AxiosRequestConfig { // 扩展 axios 请求配置
    skipAuth?: boolean // true: 请求拦截器不自动挂 Authorization
    skipRefresh?: boolean // true: 401 时不触发自动 refresh（比如 login 请求）
    _retry?: boolean // 内部标记：是否已经重试过一次，防止死循环
  }
}