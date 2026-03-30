import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { ArrowLeftOutlined, HeartOutlined, HeartFilled, CommentOutlined, StarOutlined, StarFilled, ShareAltOutlined, UpCircleOutlined } from '@ant-design/icons'
import { Skeleton, message } from 'antd'
import type { IContent } from '@/types/community'
import { formatDateTime } from '@/utils/formatDateTime'
import styles from './index.module.less'
import { getCommunityByIdAPI, likeCommunityAPI, collectedCommunityAPI } from '@/api/community'
import { useScrollYPosition } from '@/hooks/useScrollYPosition'
import { Viewer } from '@bytemd/react'
import { markdownPlugins } from '@/utils/markdown'
import tocbot from 'tocbot'

const DetailContent: React.FC = () => {
  const { id } = useParams<{ id: string }>() // 获取 url 参数
  const navigate = useNavigate()

  const articleRef = useRef<HTMLDivElement>(null) // 文章内容 ref
  const tocbotRef = useRef<HTMLDivElement>(null) // 目录 ref

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
  const { scrollYPosition } = useScrollYPosition() // 1000 显示 回到顶部

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


  // 获取到对应 id 的文章 
  useEffect(() => {
    getCommunityById()
  }, [])

  // 进入详情页时先回到顶部，避免目录初始化时激活到中间位置
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [])

  // 显示文章目录
  useEffect(() => {
    if (!articleRef.current || !tocbotRef.current) return
    // 获取 markdownBody 元素
    const markdownBody = articleRef.current.querySelector('.markdown-body') as HTMLElement | null
    if (!markdownBody) return
    const headingIdMap = new Map<string, number>()

    // 基于标题文本生成稳定 id，避免 href 变成 "#" 导致历史记录多一条
    const getHeadingId = (rawText: string, fallbackId?: string) => {
      const baseId = (fallbackId || rawText || 'section')
        .toLowerCase()
        .trim()
        .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'section'

      const count = headingIdMap.get(baseId) ?? 0
      headingIdMap.set(baseId, count + 1)
      return count === 0 ? baseId : `${baseId}-${count}`
    }

    // 对 目录 进行初始化
    tocbot.init({
      tocElement: tocbotRef.current,   // 你左侧目录容器
      contentElement: markdownBody,    // ByteMD Viewer 渲染内容
      headingSelector: 'h1, h2, h3',   // 选择要显示的标题等级
      collapseDepth: 6,
      scrollSmooth: true,
      scrollSmoothOffset: -76,         // 控制正文滚动停靠位置
      headingsOffset: 76,
      disableTocScrollSync: false,
      tocScrollOffset: 72,             // 给目录滚动预留顶部空间，避免首个目录项被“顶住”遮挡
      onClick: (event) => {
        // 阻止 a 标签默认行为，避免 URL 末尾出现 hash 并污染返回栈
        event.preventDefault()
      },
      headingObjectCallback: (obj, headingNode) => {
        const heading = obj as { id?: string, textContent?: string }
        const id = getHeadingId(heading.textContent ?? headingNode.innerText ?? '', heading.id || headingNode.id)
        headingNode.id = id
        return { ...heading, id }
      },
    })

    // 首次进入时，如果页面在顶部，确保目录滚动也在顶部
    requestAnimationFrame(() => {
      if (window.scrollY <= 1 && tocbotRef.current) {
        tocbotRef.current.scrollTop = 0
      }
    })

    return () => tocbot.destroy()
  }, [detail.content])

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
          <div className={styles.markdownBody} ref={articleRef}>
            <Viewer
              value={detail.content}
              plugins={markdownPlugins}
            >
            </Viewer>
          </div>
          {/* <section className={styles.content}>
            <p className={styles.text}>{detail.content}</p>

            {detail.photo && detail.photo.length > 0 && (
              <div className={styles.photoGrid}>
                {detail.photo.map((url, index) => (
                  <div key={index}>
                    <img src={url} alt={`Photo ${index + 1}`} className={styles.photo} />
                  </div>
                ))}
              </div>
            )}

            {detail.video && detail.video.length > 0 && (
              <div className={styles.mediaPlaceholder}>
                <span>视频预览 (开发中)</span>
              </div>
            )}

            {detail.link && detail.link.length > 0 && (
              <div className={styles.linkCard}>
                <ShareAltOutlined />
                <span>{detail.link[0]}</span>
              </div>
            )}
          </section> */}

          {/* 分隔线 */}
          <div className={styles.divider} />

          {/* 这里可以扩展评论列表 */}
          <section className={styles.commentsPlaceholder}>
            <h3>留言 {detail.comments}</h3>
            <div className={styles.postComments}>
              <div className={styles.authorAvatar}><img src="/imgs/admin.png" alt="作者" className={styles.avatar} /></div>
              <div className={styles.inputMulti}>
                <input onKeyDown={handleComment} type="text" placeholder='写留言' className={styles.inputComments} />
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

      {/* 悬浮 目录 */}
      <aside className={styles.tocbotContainer}>
        <div className={styles.tocbotContent} ref={tocbotRef}></div>
      </aside>

      {/* 悬浮 操作栏 */}
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

      {/* 悬浮 回到顶部按钮 */}
      {scrollYPosition >= 900 ?
        <div onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className={styles.upCircle}>
          <UpCircleOutlined />
        </div>
        :
        ''}
    </div>
  )
}

export default DetailContent
