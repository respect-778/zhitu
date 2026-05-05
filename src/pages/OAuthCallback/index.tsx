import Loading from "@/components/Loading"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { fetchOAuthSession } from "@/store/modules/userStore"
import { message } from "antd"
import { useEffect } from "react"
import { useNavigate } from "react-router"

const OAuthCallback = () => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()

  const userInfo = useAppSelector(state => state.user.userInfo)

  useEffect(() => {
    dispatch(fetchOAuthSession())
      .then(() => {
        navigate('/', { replace: true })
        message.success(`欢迎回来 ${userInfo.data.username}`)
      })
      .catch(() => {
        message.error('登录失败，请重试')
        navigate('/login', { replace: true })
      })
  }, [])

  return <Loading />
}

export default OAuthCallback