import { getStore } from "@/utils/store"
import { Navigate } from "react-router"

/**
* 认证路由组件
* 用于根据用户是否已登录来决定渲染内容或跳转到登录页
* @param children - 需要条件渲染的React子组件
*/
const AuthRouter = ({ children }: any) => {
  // 当前 url
  const location = window.location.pathname

  // 白名单
  const whiteList = ['/', '/community', '/login', '/register', '/oauth/callback']

  if (getStore('token') || whiteList.includes(location)) {
    return children
  } else {
    return <Navigate to="/login" replace={true}></Navigate>
  }
}

export default AuthRouter