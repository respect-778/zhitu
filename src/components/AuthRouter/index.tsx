import { getStore } from "@/utils/store"
import { Navigate } from "react-router"

/**
* 认证路由组件
* 用于根据用户是否已登录来决定渲染内容或跳转到登录页
* @param children - 需要条件渲染的React子组件
*/
const AuthRouter = ({ children }: any) => {
  if (getStore('token')) {
    return children
  } else {
    return <Navigate to="/login" replace={true}></Navigate>
  }
}

export default AuthRouter