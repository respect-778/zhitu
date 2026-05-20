import UserProfile from '@/components/UserProfile'
import { useAppSelector } from '@/store/hooks'
import styles from './index.module.less'

const PersonalContent = () => {
  const userId = Number(useAppSelector(state => state.user.userId))

  // if (!userId) return null

  return (
    <div className={styles.personalContainer}>
      <UserProfile userId={userId} isSelf />
    </div>
  )
}

export default PersonalContent