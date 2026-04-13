import React, { useEffect, useRef, useState } from 'react'
import { useLayoutEffect } from 'react'
import { useParams, useNavigate } from 'react-router'
import { HeartOutlined, HeartFilled, CommentOutlined, StarOutlined, StarFilled, UpCircleOutlined, EyeFilled, FilePdfOutlined, PlusOutlined } from '@ant-design/icons'
import { Skeleton, message } from 'antd'
import type { IContent, IContentDetail } from '@/types/community'
import { formatDateTime } from '@/utils/formatDateTime'
import styles from './index.module.less'
import { getCommunityByIdAPI, likeCommunityAPI, collectedCommunityAPI, getHotCommunityListAPI, pageviewsCommunityAPI, followCommunityAPI } from '@/api/community'
import { useScrollYPosition } from '@/hooks/useScrollYPosition'
import { Viewer } from '@bytemd/react'
import { markdownPlugins } from '@/utils/markdown'
import tocbot from 'tocbot'
import { useAppSelector } from '@/store/hooks'

const DetailContent: React.FC = () => {
  const { id } = useParams<{ id: string }>() // 获取当前 url 文章 id
  const navigate = useNavigate()

  const articleRef = useRef<HTMLDivElement>(null) // 文章内容 ref
  const tocbotRef = useRef<HTMLDivElement>(null) // 目录 ref

  const [detail, setDetail] = useState<IContentDetail>({
    id: 0,
    avatar: '',
    name: '',
    time: '',
    title: '',
    content: '',
    art_count: 0,
    likes: 0,
    comments: 0,
    collection: 0,
    photo: [],
    video: [],
    link: [],
    isLiked: false,
    isCollected: false,
    Pageviews: 0,
    authorId: 0,
    fans_count: 0,
    isFollowed: false
  }) // 文章详情
  const [hotArticle, setHotArticle] = useState<IContent[]>([]) // 热门文章
  const [isComment, setIsComment] = useState(true) // 是否显示发表评论
  const [loading, setLoading] = useState(true) // 加载

  const username = useAppSelector(state => state.user.username) // 当前登录的用户

  const { scrollYPosition } = useScrollYPosition() // 1000 显示 回到顶部

  // 根据 id 获取对应帖子详情
  const getCommunityById = async () => {
    setLoading(true)

    const res = await getCommunityByIdAPI(parseInt(id!))
    setDetail(res.data)

    setLoading(false)
  }

  // 获取热门文章
  const getHotCommunityList = async () => {
    const res = await getHotCommunityListAPI({ pageNum: 1, pageSize: 10 })
    setHotArticle(res.data.list)
  }

  // 浏览量
  const pageviewsCommunity = async () => {
    try {
      if (id) {
        await pageviewsCommunityAPI(parseInt(id))
      }
    } catch (error) {
      console.log(error)
    }
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

  // 关注
  const hanldeFollow = async (authorId: number, action: 'follow' | 'unfollow') => {
    try {
      const res = await followCommunityAPI(authorId, action)
      const nextFollowed = res.data.isFollowed
      const nextFansCount = res.data.fans_count
      setDetail(pre => ({ ...pre, isFollowed: nextFollowed, fans_count: nextFansCount }))
    } catch (error) {
      message.error("关注失败")
    }
  }

  // 处理评论
  const handleComment = () => {

  }


  useEffect(() => {
    getCommunityById()      // 获取当前文章内容
    getHotCommunityList()   // 获取热门文章
  }, [])


  // 浏览量
  useEffect(() => {
    let timer = null
    timer = setTimeout(() => {
      pageviewsCommunity() // 五秒调用一次浏览量
    }, 5000)

    return () => clearTimeout(timer)
  }, [id])

  // 在首帧绘制前完成滚动归位，避免出现首屏位移
  useLayoutEffect(() => {
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
        <div className={styles.headerLeft} onClick={() => navigate('/')}>
          <img style={{ height: '60px' }} src="/imgs/logo.png" alt="logo" draggable="false" />
        </div>
        <div className={styles.headerRight} onClick={() => window.open('/community/publish')} >
          <PlusOutlined />
          <span>创作</span>
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

      {/* 悬浮 作者信息 */}
      <aside className={styles.avatarContainer}>
        <div className={styles.avatarContent}>
          <div className={styles.avatarTop}>
            <img className={styles.img} src="/imgs/admin.png" alt="作者" draggable="false" />
            <div className={styles.detail}>
              <div style={{ fontSize: '18px', fontWeight: '550' }}>{detail.name}</div>
              <div className={styles.signatureCon}>
                <div className={styles.signature}>签名:</div>
                <div style={{ fontSize: '13px', color: '#555666' }}>吾日三省吾身，吾没有错</div>
              </div>
            </div>
          </div>
          <div className={styles.avatarCenter}>
            <div className={styles.centerContent}>
              <div className={styles.centerCount}>{detail.art_count}</div>
              <div className={styles.centerKey}>原创</div>
            </div>
            <div className={styles.centerContent}>
              <div className={styles.centerCount}>{detail.likes}</div>
              <div className={styles.centerKey}>点赞</div>
            </div>
            <div className={styles.centerContent}>
              <div className={styles.centerCount}>{detail.collection}</div>
              <div className={styles.centerKey}>收藏</div>
            </div>
            <div className={styles.centerContent}>
              <div className={styles.centerCount}>{detail.fans_count}</div>
              <div className={styles.centerKey}>粉丝</div>
            </div>
          </div>
          <div className={styles.avatarBottom}>
            {
              detail.name === username ?
                <div className={styles.followedBtn}>作者</div>
                :
                detail.isFollowed ?
                  <div className={styles.followedBtn} onClick={() => hanldeFollow(detail.authorId!, 'unfollow')}>已关注</div>
                  :
                  <div className={styles.followBtn} onClick={() => hanldeFollow(detail.authorId!, 'follow')}>关注</div>
            }
            <div className={styles.messageBtn}>私信</div>
          </div>
        </div>
      </aside>

      {/* 悬浮 目录 */}
      <aside className={styles.tocbotContainer}>
        <div className={styles.tocbotContent} ref={tocbotRef}></div>
      </aside>

      {/* 悬浮 ai agent 助手 */}
      <aside className={styles.aiHelperContainer}>
        <img style={{ height: '30px' }} src="/imgs/vai.png" alt="Via 知道" draggable="false" />
        <div className={styles.aiHelperContent}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '20px', fontWeight: '600' }}>核心速览</div>
            <span style={{ fontSize: '13px', color: '#A1A1A1' }}>文章太长没时间？AI 3秒提炼核心干货，省时80%</span>
          </div>
          <div></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '35px' }}>
            <div className={styles.labelContainer}>
              <span className={styles.label}>提炼文本</span>
              <span className={styles.label}>高效总结</span>
              <span className={styles.label}>30秒速读</span>
            </div>
            <div className={styles.labelBtn}>一键开启AI阅读</div>
          </div>
        </div>
      </aside>

      {/* 悬浮 热门文章 */}
      <aside className={styles.hotArticleContainer}>
        <div className={styles.hotArticleContent}>
          {hotArticle?.map(item => {
            return (
              <div className={styles.hotArticleFrame} key={item.id}>
                <div className={styles.hotArticleTitle} onClick={() => window.open(`/community/${item.id}`)}>
                  {item.title} <span style={{ marginLeft: '15px', marginRight: '5px', color: '#a5a5a5' }}><EyeFilled /></span><span>{item.Pageviews}</span>
                </div>
              </div>
            )
          }
          )}
        </div>
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
        <div className={styles.actionItem} onClick={() => message.success('正在下载 PDF')}>
          <FilePdfOutlined />
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
