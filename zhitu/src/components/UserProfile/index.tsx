import { useState, useEffect, useCallback, useRef } from 'react'
import { message } from 'antd'
import {
  FileTextOutlined,
  TeamOutlined,
  HeartOutlined,
  UserAddOutlined,
  CheckOutlined,
  LeftOutlined,
  RightOutlined,
  EyeOutlined,
  ReadOutlined
} from '@ant-design/icons'
import { getUserProfileAPI } from '@/api/user'
import { getUserPostsAPI, followCommunityAPI } from '@/api/community'
import type { IUserProfile, IContent } from '@/types/community'
import { formatDateTime } from '@/utils/formatDateTime'
import styles from './index.module.less'

interface UserProfileProps {
  userId: number
  isSelf?: boolean
}

const UserProfile = ({ userId, isSelf = false }: UserProfileProps) => {
  const [profile, setProfile] = useState<IUserProfile | null>(null)
  const [hotArticle, setHotArticle] = useState<IContent | null>(null)
  const [articles, setArticles] = useState<IContent[]>([])
  const [loading, setLoading] = useState(true)

  // 走马灯
  const carouselRef = useRef<HTMLDivElement>(null)
  const [scrollLeft, setScrollLeft] = useState(0) // 当前滚动位置
  const [maxScroll, setMaxScroll] = useState(0) // 最大可滚动距离

  // 获取用户资料
  const fetchProfile = useCallback(async () => {
    try {
      const res = await getUserProfileAPI(userId)
      if (res?.data) setProfile(res.data)
    } catch {
      message.error('获取用户资料失败')
    }
  }, [userId])

  // 获取最火文章（1 篇）
  const fetchHotArticle = useCallback(async () => {
    try {
      const res = await getUserPostsAPI(userId, { sort: 'hot', pageNum: 1, pageSize: 1 })
      if (res?.data?.list?.length > 0) {
        setHotArticle(res.data.list[0])
      }
    } catch { /* ignore */ }
  }, [userId])

  // 获取最新文章（走马灯用）
  const fetchArticles = useCallback(async () => {
    try {
      const res = await getUserPostsAPI(userId, { sort: 'new', pageNum: 1, pageSize: 20 })
      if (res?.data?.list) {
        setArticles(res.data.list)
      }
    } catch { /* ignore */ }
  }, [userId])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchProfile(), fetchHotArticle(), fetchArticles()]).finally(() => setLoading(false))
  }, [fetchProfile, fetchHotArticle, fetchArticles])

  // 走马灯滚动计算
  useEffect(() => {
    const el = carouselRef.current
    if (!el) return

    const calc = () => {
      const max = Math.max(0, el.scrollWidth - el.clientWidth)
      setMaxScroll(max)
      setScrollLeft(el.scrollLeft)
    }

    // 延迟到浏览器完成布局后再计算
    const rafId = requestAnimationFrame(calc)

    const observer = new ResizeObserver(calc)
    observer.observe(el)
    return () => {
      cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [articles, loading])

  const handleScroll = () => {
    const el = carouselRef.current
    if (!el) return
    setScrollLeft(el.scrollLeft)
    setMaxScroll(Math.max(0, el.scrollWidth - el.clientWidth))
  }

  const scrollBy = (dir: 'left' | 'right') => {
    const el = carouselRef.current
    if (!el) return
    const cardWidth = (240 + 16) * 3
    el.scrollBy({ left: dir === 'left' ? -cardWidth : cardWidth, behavior: 'smooth' })
  }

  // 关注/取关
  const handleFollow = async () => {
    if (!profile) return
    const action = profile.isFollowed ? 'unfollow' : 'follow'
    try {
      const res = await followCommunityAPI(profile.id, action)
      setProfile(prev => prev ? {
        ...prev,
        isFollowed: res.data.isFollowed,
        fans_count: res.data.fans_count
      } : prev)
    } catch {
      message.error('操作失败')
    }
  }

  // 跳转文章详情
  const goArticle = (id?: number) => {
    if (id) window.open(`/community/${id}`)
  }

  if (loading) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.skeletonHeader} />
        <div className={styles.skeletonHot} />
        <div className={styles.skeletonCarousel}>
          {[1, 2, 3, 4].map(i => <div key={i} className={styles.skeletonCard} />)}
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.emptyState}>用户不存在</div>
      </div>
    )
  }

  return (
    <div className={styles.wrapper}>
      {/* ========== 头部：用户信息 ========== */}
      <div className={styles.header}>
        <img
          src={profile.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default'}
          alt={profile.username}
          className={styles.avatar}
          onError={e => { (e.target as HTMLImageElement).src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=default' }}
        />
        <div className={styles.headerInfo}>
          <div className={styles.username}>{profile.username}</div>
          <div className={styles.statsRow}>
            <span className={styles.statChip}><FileTextOutlined /> {profile.art_count} 篇文章</span>
            <span className={styles.statDot}>·</span>
            <span className={styles.statChip}><TeamOutlined /> {profile.fans_count} 粉丝</span>
            <span className={styles.statDot}>·</span>
            <span className={styles.statChip}><HeartOutlined /> {profile.like_count} 获赞</span>
          </div>
          <div className={styles.bio}>
            {profile.bio || '这个作者很懒，什么也没留下~'}
          </div>
          {!isSelf && (
            <button
              className={`${styles.followBtn} ${profile.isFollowed ? styles.followed : ''}`}
              onClick={handleFollow}
            >
              {profile.isFollowed
                ? <><CheckOutlined /> 已关注</>
                : <><UserAddOutlined /> 关注</>
              }
            </button>
          )}
        </div>
      </div>

      {/* ========== 中间：最受欢迎的文章 ========== */}
      {hotArticle && (
        <div className={styles.hotSection}>
          <div className={styles.sectionTitle}>最受欢迎</div>
          <div className={styles.hotCard} onClick={() => goArticle(hotArticle.id)}>
            {hotArticle.cover ? (
              <img src={hotArticle.cover} alt="" className={styles.hotCover} />
            ) : (
              <div className={styles.hotCoverPlaceholder}>
                <ReadOutlined />
              </div>
            )}
            <div className={styles.hotInfo}>
              <div className={styles.hotTitle}>{hotArticle.title || '无标题'}</div>
              <div className={styles.hotMeta}>
                <span>{profile.username}</span>
                <span className={styles.statDot}>·</span>
                <span><EyeOutlined /> {hotArticle.Pageviews} 次浏览</span>
                <span className={styles.statDot}>·</span>
                <span>{formatDateTime(hotArticle.time)}</span>
              </div>
              <div className={styles.hotAbstract}>{hotArticle.abstract}</div>
            </div>
          </div>
        </div>
      )}

      {/* ========== 底部：最新文章走马灯 ========== */}
      {articles.length > 0 && (
        <div className={styles.carouselSection}>
          <div className={styles.sectionTitle}>最新文章</div>
          <div className={styles.carouselBody}>
            {scrollLeft > 0 && (
              <button
                className={`${styles.navBtn} ${styles.navLeft}`}
                onClick={() => scrollBy('left')}
              >
                <LeftOutlined />
              </button>
            )}
            {scrollLeft < maxScroll - 1 && maxScroll > 0 && (
              <button
                className={`${styles.navBtn} ${styles.navRight}`}
                onClick={() => scrollBy('right')}
              >
                <RightOutlined />
              </button>
            )}
            <div
              className={styles.carouselTrack}
              ref={carouselRef}
              onScroll={handleScroll}
            >
              {articles.map(article => (
                <div
                  key={article.id}
                  className={styles.articleCard}
                  onClick={() => goArticle(article.id)}
                >
                  {article.cover ? (
                    <img src={article.cover} alt="" className={styles.articleCover} />
                  ) : (
                    <div className={styles.articleCoverPlaceholder}>
                      <ReadOutlined />
                    </div>
                  )}
                  <div className={styles.articleTitle}>{article.title || '无标题'}</div>
                  <div className={styles.articleMeta}>
                    <EyeOutlined /> {article.Pageviews} 次浏览 · {formatDateTime(article.time)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 无文章状态 */}
      {!hotArticle && articles.length === 0 && (
        <div className={styles.emptyArticles}>
          <ReadOutlined className={styles.emptyIcon} />
          <div>该用户还没有发布任何文章</div>
        </div>
      )}
    </div>
  )
}

export default UserProfile
