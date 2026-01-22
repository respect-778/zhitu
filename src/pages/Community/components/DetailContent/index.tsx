import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { ArrowLeftOutlined, HeartOutlined, HeartFilled, CommentOutlined, StarOutlined, StarFilled, ShareAltOutlined } from '@ant-design/icons'
import { Skeleton, message } from 'antd'
import type { IContent } from '@/types/community'
import { formatDateTime } from '@/utils/formatDateTime'
import styles from './index.module.less'
import { getCommunityByIdAPI, likeCommunityAPI, collectedCommunityAPI } from '@/api/community'

const DetailContent: React.FC = () => {
  const { id } = useParams<{ id: string }>() // 获取 url 参数
  const navigate = useNavigate()
  const [detail, setDetail] = useState<IContent>({
    id: 0,
    avatar: '',
    name: '',
    time: '',
    title: '',
    content: '',
    likes: 0,
    comments: 0,
    collection: 0,
    photo: [],
    video: [],
    link: [],
    isLiked: false,
    isCollected: false
  })
  const [isComment, setIsComment] = useState(true) // 是否显示发表评论
  const [loading, setLoading] = useState(true)

  // 根据 id 获取对应帖子详情
  const getCommunityById = async () => {
    setLoading(true)

    const res = await getCommunityByIdAPI(parseInt(id!))
    setDetail(res.data)

    setLoading(false)
  }

  // 点击喜欢时触发
  const handleLike = async (id: number, isLiked: boolean) => {
    // 当后一个状态依赖前一个状态时，需要使用 pre => pre 这种形式
    setDetail(pre =>
      pre.id === id ? { ...pre, isLiked: !pre.isLiked, likes: pre.isLiked ? pre.likes = pre.likes - 1 : pre.likes = pre.likes + 1 } : pre
    )

    await likeCommunityAPI(id, isLiked) // 调用接口，提醒后端同步修改赞
  }

  // 点击收藏时触发
  const handleCollection = async (id: number, isCollected: boolean) => {
    setDetail(pre =>
      pre.id === id ? { ...pre, isCollected: !pre.isCollected, collection: pre.isCollected ? pre.collection - 1 : pre.collection + 1 } : pre
    )

    await collectedCommunityAPI(id, isCollected) // 调用接口，提醒后端同步修改收藏量
  }

  // 处理评论
  const handleComment = () => {

  }

  useEffect(() => {
    getCommunityById()
  }, [])

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Skeleton active avatar paragraph={{ rows: 10 }} />
      </div>
    )
  }

  if (!detail) {
    return <div className={styles.errorContainer}>未找到该内容</div>
  }

  return (
    <div className={styles.wrapper}>

      {/* 顶部导航栏 */}
      <header className={styles.header}>
        <div className={styles.headerLeft} onClick={() => navigate(-1)}>
          <ArrowLeftOutlined />
          <span>返回社区</span>
        </div>
      </header>

      <main className={styles.container}>
        <article className={styles.article}>
          {/* 文章头部信息 */}
          <header className={styles.articleHeader}>
            <h1 className={styles.title}>{detail.title}</h1>
            <div className={styles.authorSection}>
              <div><img src="/imgs/admin.png" alt="" className={styles.avatar} /></div>
              <div className={styles.meta}>
                <span className={styles.name}>{detail.name}</span>
                <span className={styles.time}>{formatDateTime(detail.time)}</span>
              </div>
            </div>
          </header>

          {/* 文章正文 */}
          <section className={styles.content}>
            <p className={styles.text}>{detail.content}</p>

            {/* 媒体展示 */}
            {detail.photo && detail.photo.length > 0 && (
              <div className={styles.photoGrid}>
                {detail.photo.map((url, index) => (
                  <div key={index}>
                    <img src={url} alt={`Photo ${index + 1}`} className={styles.photo} />
                  </div>
                ))}
              </div>
            )}

            {/* 视频占位 (如果将来有视频) */}
            {detail.video && detail.video.length > 0 && (
              <div className={styles.mediaPlaceholder}>
                <span>视频预览 (开发中)</span>
              </div>
            )}

            {/* 链接占位 (如果将来有链接) */}
            {detail.link && detail.link.length > 0 && (
              <div className={styles.linkCard}>
                <ShareAltOutlined />
                <span>{detail.link[0]}</span>
              </div>
            )}
          </section>

          {/* 分隔线 */}
          <div className={styles.divider} />

          {/* 这里可以扩展评论列表 */}
          <section className={styles.commentsPlaceholder}>
            <h3>留言 {detail.comments}</h3>
            <div className={styles.postComments}>
              <div className={styles.authorAvatar}><img src="/imgs/admin.png" alt="作者" className={styles.avatar} /></div>
              <div className={styles.inputMulti}>
                <input type="text" placeholder='写留言' className={styles.inputComments} />
              </div>
              <div onClick={() => setIsComment(!isComment)} className={styles.commentsBtn}>发送</div>
            </div>
            {/* {detail.comments === 0 || isComment ? */}
            {isComment ?
              <div className={styles.emptyCard}>
                <div className={styles.emptyComments}>
                  快来发布你的第一条评论吧...
                </div>
              </div>
              :
              <div>11</div>
            }
          </section>
        </article>
      </main>

      {/* 悬浮操作栏 */}
      <aside className={styles.floatingBar}>
        <div
          className={`${styles.actionItem} ${detail.isLiked ? styles.active : ''}`}
          onClick={() => handleLike(detail.id!, detail.isLiked)}
        >
          {detail.isLiked ? <HeartFilled /> : <HeartOutlined />}
          <span>{detail.likes}</span>
        </div>
        <div
          className={`${styles.actionItem} ${detail.isCollected ? styles.active : ''}`}
          onClick={() => handleCollection(detail.id!, detail.isCollected)}
        >
          {detail.isCollected ? <StarFilled /> : <StarOutlined />}
          <span>{detail.collection}</span>
        </div>
        <div className={styles.actionItem}>
          <CommentOutlined />
          <span>{detail.comments}</span>
        </div>
        <div className={styles.dividerSmall} />
        <div className={styles.actionItem} onClick={() => message.success('文章已复制到剪贴板')}>
          <ShareAltOutlined />
        </div>
      </aside>
    </div>
  )
}

export default DetailContent