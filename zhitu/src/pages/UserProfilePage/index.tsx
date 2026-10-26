import { useParams, useNavigate } from 'react-router'
import { LeftOutlined } from '@ant-design/icons'
import UserProfile from '@/components/UserProfile'
import { useAppSelector } from '@/store/hooks'
import styles from './index.module.less'

const UserProfilePage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const currentUserId = Number(useAppSelector(state => state.user.userId))
  const userId = Number(id)

  if (!userId || isNaN(userId)) {
    return <div className={styles.container}><div className={styles.error}>无效的用户 ID</div></div>
  }

  const isSelf = currentUserId === userId

  return (
    <div className={styles.container}>
      <div className={styles.backBar}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>
          <LeftOutlined /> 返回
        </button>
      </div>
      <UserProfile userId={userId} isSelf={isSelf} />
    </div>
  )
}

export default UserProfilePage
