import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { HeartOutlined, HeartFilled, StarOutlined, StarFilled, UpCircleOutlined, EyeFilled, FilePdfOutlined, PlusOutlined } from '@ant-design/icons'
import { Skeleton, message } from 'antd'
import type { IContent, IContentDetail } from '@/types/community'
import { formatDateTime } from '@/utils/formatDateTime'
import styles from './index.module.less'
import { getCommunityByIdAPI, likeCommunityAPI, collectedCommunityAPI, getHotCommunityListAPI, pageviewsCommunityAPI, followCommunityAPI } from '@/api/community'
import { useScrollYPosition } from '@/hooks/useScrollYPosition'
import { Viewer } from '@bytemd/react'
import { markdownPlugins } from '@/utils/markdown'
import { scroller } from 'react-scroll'
import { useAppSelector } from '@/store/hooks'

type TocItem = {
  id: string
  text: string
  level: 1 | 2 | 3
}

// 目录只读取正文里的 h1-h3；滚动时预留顶部 sticky header 的高度。
const HEADING_SELECTOR = 'h1, h2, h3'
const TOC_SCROLL_OFFSET = -88
const TOC_SCROLL_DURATION = 360
const TOC_ACTIVATION_OFFSET = Math.abs(TOC_SCROLL_OFFSET) + 32

// ByteMD 的 Viewer 会把 Markdown 渲染成真实 DOM，目录需要从渲染后的 DOM 里取标题。
const getArticleHeadings = (articleRoot: HTMLElement | null) => {
  const markdownBody = articleRoot?.querySelector('.markdown-body') as HTMLElement | null
  if (!markdownBody) return []

  return Array.from(markdownBody.querySelectorAll<HTMLElement>(HEADING_SELECTOR))
}

// 同步正文标题和目录数据：给每个标题补稳定 id，再生成 React 可渲染的目录数组。
const syncArticleTocItems = (articleRoot: HTMLElement | null) => {
  const headings = getArticleHeadings(articleRoot)

  return headings.reduce<TocItem[]>((items, heading, index) => {
    const text = heading.textContent?.trim()
    const level = Number(heading.tagName.slice(1)) as TocItem['level']

    if (!text || ![1, 2, 3].includes(level)) return items

    const headingId = `article-heading-${index}`
    // react-scroll 最终就是通过这个 id 找到正文标题并滚过去。
    heading.id = headingId

    items.push({
      id: headingId,
      text,
      level,
    })

    return items
  }, [])
}

const isSameTocItems = (first: TocItem[], second: TocItem[]) => {
  if (first.length !== second.length) return false

  return first.every((item, index) => {
    const nextItem = second[index]
    return item.id === nextItem.id && item.text === nextItem.text && item.level === nextItem.level
  })
}

// 根据当前正文滚动位置计算应该高亮哪个目录项。
const getActiveTocIdByScroll = (tocItems: TocItem[]) => {
  if (!tocItems.length) return ''

  let activeId = ''
  let closestId = tocItems[0].id
  let closestDistance = Number.POSITIVE_INFINITY

  tocItems.forEach(item => {
    const heading = document.getElementById(item.id)
    if (!heading) return

    const headingTop = heading.getBoundingClientRect().top
    const distance = Math.abs(headingTop - TOC_ACTIVATION_OFFSET)

    if (distance < closestDistance) {
      closestDistance = distance
      closestId = item.id
    }

    if (headingTop <= TOC_ACTIVATION_OFFSET) {
      activeId = item.id
    }
  })

  return activeId || closestId
}

const DetailContent: React.FC = () => {
  // react-router
  const { id } = useParams<{ id: string }>() // 获取当前 url 文章 id
  const navigate = useNavigate()

  const username = useAppSelector(state => state.user.username)

  // useRef
  const articleRef = useRef<HTMLDivElement>(null) // 文章内容 ref
  const tocbotRef = useRef<HTMLElement>(null) // 目录 ref
  // 程序点击目录触发的平滑滚动期间，先不让滚动监听抢高亮。
  const isTocScrollingRef = useRef(false)
  const tocScrollTimerRef = useRef<number | null>(null)
  // 用 requestAnimationFrame 合并滚动事件，避免滚动时频繁计算。
  const scrollSpyFrameRef = useRef<number | null>(null)
  // 保存最新目录数据，供滚动事件回调读取，避免闭包拿到旧状态。
  const tocItemsRef = useRef<TocItem[]>([])

  // useState
  const [detail, setDetail] = useState<IContentDetail>({
    id: 0,
    avatar: '',
    name: '',
    time: '',
    title: '',
    content: '',
    abstract: '',
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
  const [loading, setLoading] = useState(true) // 加载
  const [tocItems, setTocItems] = useState<TocItem[]>([]) // 文章目录
  const [activeTocId, setActiveTocId] = useState('') // 当前高亮目录


  const { scrollYPosition } = useScrollYPosition() // 1000 显示 回到顶部

  // 根据 id 获取对应文章详情
  const getCommunityById = async () => {
    try {
      setLoading(true)
      const res = await getCommunityByIdAPI(parseInt(id!))
      setDetail(res.data)
    } catch (error) {
      message.error("获取文章失败")
      console.log(error)
    } finally {
      setLoading(false)
    }
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
      if (action === 'follow') {
        message.success("关注成功")
      } else {
        message.success("取消关注")
      }
    } catch (error) {
      message.error("关注失败")
    }
  }

  // 开启 ai 阅读
  const handleAiRead = async () => {
    window.open(`/community/${id}/summary`)
  }

  // 当目录自动高亮到某项时，让左侧目录容器也滚到对应位置附近。
  const scrollActiveTocItemIntoView = (tocId: string) => {
    const tocElement = tocbotRef.current
    if (!tocElement) return

    const activeNode = tocElement.querySelector<HTMLElement>(`[data-toc-id="${tocId}"]`)
    if (!activeNode) return

    const viewTop = tocElement.scrollTop
    const viewBottom = viewTop + tocElement.clientHeight
    // 用矩形差值计算目录项相对滚动容器的位置，避免 offsetTop 带上外层布局偏移。
    const tocRect = tocElement.getBoundingClientRect()
    const activeRect = activeNode.getBoundingClientRect()
    const itemTop = activeRect.top - tocRect.top + tocElement.scrollTop
    const itemBottom = itemTop + activeRect.height
    const padding = 24

    if (itemTop < viewTop + padding) {
      tocElement.scrollTo({ top: Math.max(itemTop - padding, 0), behavior: 'smooth' })
      return
    }

    if (itemBottom > viewBottom - padding) {
      tocElement.scrollTo({ top: itemBottom - tocElement.clientHeight + padding, behavior: 'smooth' })
    }
  }

  // 页面滚动时的主流程：同步标题 id -> 算当前高亮 -> 同步目录滚动位置。
  const updateActiveTocByScroll = () => {
    const nextTocItems = syncArticleTocItems(articleRef.current)

    if (!isSameTocItems(tocItemsRef.current, nextTocItems)) {
      tocItemsRef.current = nextTocItems
      setTocItems(nextTocItems)
    }

    const nextActiveTocId = getActiveTocIdByScroll(nextTocItems)
    if (!nextActiveTocId) return

    setActiveTocId(currentId => currentId === nextActiveTocId ? currentId : nextActiveTocId)
    scrollActiveTocItemIntoView(nextActiveTocId)
  }

  // 点击目录项时，先立即高亮，再交给 react-scroll 平滑滚到正文标题。
  const handleTocClick = (tocItem: TocItem) => {
    const syncedTocItems = syncArticleTocItems(articleRef.current)
    const target = document.getElementById(tocItem.id)

    if (!isSameTocItems(tocItemsRef.current, syncedTocItems)) {
      tocItemsRef.current = syncedTocItems
      setTocItems(syncedTocItems)
    }

    if (!target) return

    if (tocScrollTimerRef.current) {
      window.clearTimeout(tocScrollTimerRef.current)
    }

    isTocScrollingRef.current = true
    setActiveTocId(tocItem.id)
    scrollActiveTocItemIntoView(tocItem.id)
    scroller.scrollTo(tocItem.id, {
      smooth: true,
      duration: TOC_SCROLL_DURATION,
      offset: TOC_SCROLL_OFFSET,
    })

    tocScrollTimerRef.current = window.setTimeout(() => {
      setActiveTocId(tocItem.id)
      scrollActiveTocItemIntoView(tocItem.id)
      isTocScrollingRef.current = false
      tocScrollTimerRef.current = null
      window.requestAnimationFrame(updateActiveTocByScroll)
    }, TOC_SCROLL_DURATION + 120)
  }

  const handleBackToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    tocbotRef.current?.scrollTo({ top: 0, behavior: 'smooth' })

    const firstTocId = tocItemsRef.current[0]?.id
    if (firstTocId) {
      setActiveTocId(firstTocId)
    }
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

  // 显示文章目录：等 Viewer 把 Markdown 渲染进 DOM 后，再读取标题生成目录。
  useLayoutEffect(() => {
    if (!detail.content) {
      setTocItems([])
      setActiveTocId('')
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      const nextTocItems = syncArticleTocItems(articleRef.current)

      tocItemsRef.current = nextTocItems
      setTocItems(nextTocItems)
      setActiveTocId(nextTocItems[0]?.id ?? '')

      if (tocbotRef.current) {
        tocbotRef.current.scrollTop = 0
      }
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [detail.content])

  // 目录状态变化后，再确认一遍正文标题 id，防止 Viewer 重渲染后 id 丢失。
  useLayoutEffect(() => {
    if (!tocItems.length) return

    const frameId = window.requestAnimationFrame(() => {
      const nextTocItems = syncArticleTocItems(articleRef.current)
      tocItemsRef.current = nextTocItems
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [tocItems])

  // 手动滚动文章时自动更新目录高亮，并滚动左侧目录到当前项。
  useEffect(() => {
    if (!tocItems.length) return

    const handleScrollSpy = () => {
      if (scrollSpyFrameRef.current !== null) return

      scrollSpyFrameRef.current = window.requestAnimationFrame(() => {
        scrollSpyFrameRef.current = null

        if (!isTocScrollingRef.current) {
          updateActiveTocByScroll()
        }
      })
    }

    handleScrollSpy()
    window.addEventListener('scroll', handleScrollSpy, { passive: true })
    window.addEventListener('resize', handleScrollSpy)

    return () => {
      window.removeEventListener('scroll', handleScrollSpy)
      window.removeEventListener('resize', handleScrollSpy)

      if (scrollSpyFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollSpyFrameRef.current)
        scrollSpyFrameRef.current = null
      }
    }
  }, [tocItems])

  // 如果用户在程序平滑滚动期间手动滚动，就停止“点击滚动锁”，改由真实滚动位置接管高亮。
  useEffect(() => {
    const stopProgrammaticTocScroll = () => {
      if (!isTocScrollingRef.current) return

      isTocScrollingRef.current = false

      if (tocScrollTimerRef.current) {
        window.clearTimeout(tocScrollTimerRef.current)
        tocScrollTimerRef.current = null
      }

      window.requestAnimationFrame(updateActiveTocByScroll)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) {
        stopProgrammaticTocScroll()
      }
    }

    window.addEventListener('wheel', stopProgrammaticTocScroll, { passive: true })
    window.addEventListener('touchmove', stopProgrammaticTocScroll, { passive: true })
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('wheel', stopProgrammaticTocScroll)
      window.removeEventListener('touchmove', stopProgrammaticTocScroll)
      window.removeEventListener('keydown', handleKeyDown)

      if (tocScrollTimerRef.current) {
        window.clearTimeout(tocScrollTimerRef.current)
      }
    }
  }, [])

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Skeleton active avatar paragraph={{ rows: 10 }} />
      </div>
    )
  }

  if (detail.content === '' && detail.name === '') {
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
              <div><img src={detail.avatar || './imgs/admin.png'} alt="" className={styles.avatar} /></div>
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
        </article>
      </main>

      {/* 悬浮 作者信息 */}
      <aside className={styles.avatarContainer}>
        <div className={styles.avatarContent}>
          <div className={styles.avatarTop}>
            <img className={styles.img} src={detail.avatar || './imgs/admin.png'} alt="作者" draggable="false" />
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
                  <div className={styles.followedBtn} onClick={() => hanldeFollow(detail.authorId!, 'follow')}>关注</div>
            }
            <div className={styles.messageBtn}>私信</div>
          </div>
        </div>
      </aside>

      {/* 悬浮 目录 */}
      {tocItems.length > 0 &&
        <aside className={styles.tocbotContainer}>
          <nav className={styles.tocbotContent} ref={tocbotRef} aria-label="文章目录">
            {tocItems.map(item => (
              <button
                key={item.id}
                type="button"
                // 左侧目录自动滚动时，用这个属性定位当前目录节点。
                data-toc-id={item.id}
                className={`${styles.tocLink} ${styles[`tocLevel${item.level}`]} ${activeTocId === item.id ? styles.tocActive : ''}`}
                title={item.text}
                onClick={() => handleTocClick(item)}
              >
                {item.text}
              </button>
            ))}
          </nav>
        </aside>
      }

      {/* 悬浮 ai agent 助手 */}
      <aside className={styles.aiHelperContainer}>
        <img style={{ height: '30px' }} src="/imgs/vai.png" alt="Via 知道" draggable="false" />
        <div className={styles.aiHelperContent}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '20px', fontWeight: '600' }}>核心速览</div>
            <span style={{ fontSize: '13px', color: '#A1A1A1' }}>文章太长没时间？AI 3秒提炼核心干货，省时80%</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '35px' }}>
            <div className={styles.labelContainer}>
              <span className={styles.label}>提炼文本</span>
              <span className={styles.label}>高效总结</span>
              <span className={styles.label}>30秒速读</span>
            </div>
            <div className={styles.labelBtn} onClick={handleAiRead}>一键开启AI阅读</div>
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
        <div className={styles.dividerSmall} />
        <div className={styles.actionItem} onClick={() => message.success('正在下载 PDF')}>
          <FilePdfOutlined />
        </div>
      </aside>

      {/* 悬浮 回到顶部按钮 */}
      {scrollYPosition >= 900 ?
        <div onClick={handleBackToTop} className={styles.upCircle}>
          <UpCircleOutlined />
        </div>
        :
        ''}
    </div>
  )
}

export default DetailContent
