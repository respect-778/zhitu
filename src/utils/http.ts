import { message } from 'antd'
import axios from 'axios'
import { getStore } from './store'

const BASE_URL = import.meta.env.VITE_BASE_URL

const httpInstance = axios.create({
  baseURL: BASE_URL,
  // timeout: 3000
})

// 请求拦截器
httpInstance.interceptors.request.use(
  config => {
    // 在发送请求之前做些什么
    const token = getStore('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },

  error => {
    // 对请求错误做些什么
    return Promise.reject(error)
  }
)

// 响应拦截器
httpInstance.interceptors.response.use(
  response => {
    // 对响应数据做点什么
    return response.data
  },

  error => {
    // 对响应错误做点什么
    const status = error.response.status
    if (status !== 200) {
      message.error(error.response.data.message)
    }
    return Promise.reject(error)
  }

)

export default httpInstance