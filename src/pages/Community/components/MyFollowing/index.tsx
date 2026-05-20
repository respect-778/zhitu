import { useState, useEffect, useCallback } from 'react'
import { message } from 'antd'
import { UserOutlined, FileTextOutlined, TeamOutlined } from '@ant-design/icons'
import { getFollowingListAPI, followCommunityAPI } from '@/api/community'
import type { IFollowingUser } from '@/types/community'
import styles from './index.module.less'
import { useNavigate } from 'react-router'

const MyFollowing = () => {
  const navigate = useNavigate()

  const [list, setList] = useState<IFollowingUser[]>([])
  const [loading, setLoading] = useState(false)

  // 获取关注列表
  const getFollowingList = useCallback(async () => {
    setLoading(true)
    try {
      const res: any = await getFollowingListAPI()
      if (res?.data) {
        setList(res.data || [])
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    getFollowingList()
  }, [getFollowingList])

  // 取消关注
  const handleUnfollow = async (userId: number, username: string) => {
    try {
      await followCommunityAPI(userId, 'unfollow')
      message.success(`已取消关注 ${username}`)
      setList(prev => prev.filter(u => u.id !== userId))
    } catch {
      message.error('操作失败')
    }
  }

  // 点击用户卡片跳转到个人主页
  const handleClickUser = (userId: number) => {
    navigate(`/user/${userId}`)
  }

  return (
    <div className={styles.wrapper}>
      {/* 头部 */}
      <div className={styles.header}>
        <span className={styles.headerTitle}>我的关注</span>
        <div className={styles.headerDivider}>/</div>
        <div className={styles.headerDesc}>发现有趣的创作者</div>
      </div>

      {/* 内容区 */}
      <div className={styles.content}>
        {loading ? (
          <div className={styles.loadingWrap}>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className={styles.skeletonCard} />
            ))}
          </div>
        ) : list.length > 0 ? (
          <div className={styles.grid}>
            {list.map(user => (
              <div key={user.id} className={styles.card}>
                <div className={styles.cardMain} onClick={() => handleClickUser(user.id)}>
                  <img
                    src={user.avatar}
                    alt={user.username}
                    className={styles.avatar}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=default'
                    }}
                  />
                  <div className={styles.username}>{user.username}</div>
                  <div className={styles.stats}>
                    <div className={styles.statItem}>
                      <FileTextOutlined className={styles.statIcon} />
                      <span>{user.art_count} 篇文章</span>
                    </div>
                    <div className={styles.statItem}>
                      <TeamOutlined className={styles.statIcon} />
                      <span>{user.fans_count} 粉丝</span>
                    </div>
                  </div>
                </div>
                <button
                  className={styles.unfollowBtn}
                  onClick={() => handleUnfollow(user.id, user.username)}
                >
                  已关注
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <UserOutlined className={styles.emptyIcon} />
            <div className={styles.emptyTitle}>还没有关注任何人</div>
            <div className={styles.emptyDesc}>去阅读文章时关注感兴趣的作者吧</div>
          </div>
        )}
      </div>
    </div>
  )
}

export default MyFollowing
