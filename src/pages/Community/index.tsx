import styles from './index.module.less'
import type { IContent, IContentPageParams, IHotkeyword, INavItems } from '@/types/community'
import { SearchOutlined, BellOutlined, ReadOutlined, CloseCircleFilled, RightOutlined } from '@ant-design/icons'
import { message } from 'antd'
import React, { useCallback, useEffect, useState } from 'react'
import { collectedCommunityAPI, getEarlyReportAPI, getHotCommunityListAPI, getNewCommunityListAPI, likeCommunityAPI, searchCommunityAPI } from '@/api/community';
import { useSearchParams } from 'react-router';
import ArticleList from '@/components/ArticleList';

const Community = () => {
  const [searchParams, setSearchParams] = useSearchParams() // 设置查询参数
  const initialTab = searchParams.get('tab') // 获取当前 url 查询参数

  const [content, setContent] = useState<IContent[]>([]) // 帖子列表
  const [searchValue, setSearchValue] = useState<string>('') // 输入框中搜索的内容
  const [earlyReport, setEarlyReport] = useState<IContent | null>(null)
  const [activeTab, setActiveTab] = useState<string>(initialTab || 'new') // tab
  const [activeMenu, setActiveMenu] = useState<string>(`menu-${initialTab || 'new'}`) // 当前选中的菜单
  const [pageParams, setPageParams] = useState(() => { // 当前页、页数、总数
    const search = searchParams.get('page') // 获取 page 参数
    const pageNum = parseInt(search || '1') // 初始化 -> 如果获取到的 page 参数为空，就默认显示第一页
    return { pageNum, pageSize: 10, total: 0 }
  }) // 分页
  const [loading, setLoading] = useState(false) // 帖子加载效果
  const [isEmpty, setIsEmpty] = useState(false) // 这个 state 不是证明搜索框是否空，而是搜索的内容是否存在


  // 公共精选
  const navItems: INavItems[] = [
    { id: 'new', label: '最新内容', icon: '' },
    { id: 'recommend', label: '为你推荐', icon: '' },
    { id: 'hot', label: '精选周刊', icon: '' },
    { id: 'relax', label: '放松愉悦', icon: '' },
  ]

  // 我的记录
  const personalKeywords: IHotkeyword[] = [
    { id: 'history', name: '阅读历史' },
    { id: 'collect', name: '我的收藏' },
    { id: 'follow', name: '我的关注' },
    { id: 'profile', name: '个人信息' },
  ]

  // 右侧公告栏
  const notices = [
    { id: 1, title: '知途社区 1.2 版本更新公告', time: '2小时前' },
    { id: 2, title: '关于规范社区发帖的通知', time: '1天前' },
  ]

  // 左侧 公共精选 NavBar
  const handleNavBar = async (navType: string) => {
    setActiveMenu(`menu-${navType}`)
    setActiveTab(navType)
    if (navType === 'recommend') {
      setSearchValue('')
      handlePageSize(1, pageParams.pageSize, navType)
    } else if (navType === 'hot') {
      setSearchValue('')
      handlePageSize(1, pageParams.pageSize, navType)
    } else if (navType === 'new') {
      setSearchValue('')
      handlePageSize(1, pageParams.pageSize, navType)
    }
  }

  // 左侧 我的记录 NavBar
  const handlePersonalNavBar = (keyword: string) => {
    setActiveMenu(`menu-${keyword}`)
    setActiveTab(keyword)
  }

  // 获取输入框中的内容
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value)
  }

  // 清空输入框和当前搜索内容并回到最初页
  const clearSearchValue = async (navType: string) => {
    setSearchValue('') // 滞空搜索框
    setIsEmpty(false) // 重置 搜索内容存在态
    if (navType === 'recommend') { // 这里使用原始的接口调用，是因为 如果使用 handlePageSize 方法的话，会有 keyword 干扰，导致点击重置还是在搜索后的列表
      const res = await searchCommunityAPI({ pageNum: 1, pageSize: pageParams.pageSize })
      tabPage(res.data, 1, pageParams.pageSize)
      return
    } else if (navType === 'new') {
      const res = await getNewCommunityListAPI({ pageNum: 1, pageSize: pageParams.pageSize })
      tabPage(res.data, 1, pageParams.pageSize)
    } else if (navType === 'hot') {
      const res = await getHotCommunityListAPI({ pageNum: 1, pageSize: pageParams.pageSize })
      tabPage(res.data, 1, pageParams.pageSize)
    }
  }

  // 每日早报
  const getEarlyReport = useCallback(async () => {
    try {
      const res = await getEarlyReportAPI()
      setEarlyReport(res.data)
    } catch (error) {
      console.log(error)
    }
  }, [])

  // 搜索（是通过 推荐 的内容去搜索的，本质上 使用哪个接口都没有关系）
  const searchCommunity = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // 如果搜索框为空，重置为所有帖子列表
      if (searchValue.trim() === '') { // 判断搜索框中的值是否为空
        handlePageSize(1, pageParams.pageSize, activeTab)
        return
      }

      const res = await searchCommunityAPI({ keyword: searchValue.trim(), pageNum: 1, pageSize: pageParams.pageSize })

      if (res.data.list.length === 0) { // 当没有搜索到结果时
        setIsEmpty(true) // 设置内容不存在
      }

      setPageParams(pre => ({ // 设置分页需要的参数，使分页组件的显示为当前搜索过后的结果
        ...pre,
        pageNum: 1,
        pageSize: pageParams.pageSize,
        total: res.data.total
      }))

      setContent(res.data.list)
    }
  }

  // 处理分页中统一的逻辑
  const tabPage = (data: IContentPageParams, page: number, pageSize: number) => {
    setPageParams(pre => ({ // 修改页数
      ...pre,
      pageNum: page,
      pageSize: pageSize,
      total: data.total
    }))
    setContent(data.list) // 更新帖子
  }

  // 分页（也是推荐）
  const handlePageSize = async (page: number, pageSize: number, navType: string) => {
    setLoading(true)
    if (navType === 'recommend') {
      const res = await searchCommunityAPI({ keyword: searchValue.trim(), pageNum: page, pageSize })
      tabPage(res.data, page, pageSize)
    } else if (navType === 'hot') {
      const res = await getHotCommunityListAPI({ keyword: searchValue.trim(), pageNum: page, pageSize })
      tabPage(res.data, page, pageSize)
    } else if (navType === 'new') {
      const res = await getNewCommunityListAPI({ keyword: searchValue.trim(), pageNum: page, pageSize })
      tabPage(res.data, page, pageSize)
    }
    setLoading(false)

    // setSearchParams 里会自动修改浏览器地址的查询字符串（内部自动使用了 ）
    setSearchParams(pre => { // 把当前选中的页数给到 searchParams
      pre.set('page', String(page))
      pre.set('tab', navType)
      return pre
    }, { replace: true })

    // 回到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // 发布按钮
  const handleOpen = () => {
    window.open('/community/publish')
  }

  // 进入详情页
  const handleDetail = (id: number) => {
    window.open(`/community/${id}`)
  }

  // 点击喜欢时触发（做了乐观更新 -> 用户在网络不加的情况下，点击喜欢按钮也会显示，不会出现点击没反应）
  const handleLike = async (id: number, isLiked: boolean) => {
    // 乐观更新 UI，当后一个状态依赖前一个状态时，需要使用 pre => pre 这种形式
    setContent(pre => pre.map(item =>
      item.id === id ? { ...item, isLiked: !isLiked, likes: isLiked ? item.likes - 1 : item.likes + 1 } : item
    ))

    try {
      // 成功调用接口，无序额外操作，后端同步 UI 变化
      await likeCommunityAPI(id, isLiked) // 调用接口，提醒后端同步修改赞
    } catch (error) {
      message.error(`网络错误，点赞失败`)
    }
  }

  // 点击收藏时触发
  const handleCollection = async (id: number, isCollected: boolean) => {
    setContent(pre => pre.map(item => {
      return item.id === id ? { ...item, isCollected: !isCollected, collection: isCollected ? item.collection - 1 : item.collection + 1 } : item
    }))

    try {
      await collectedCommunityAPI(id, isCollected) // 调用接口，提醒后端同步修改收藏量
    } catch (error) {
      message.error(`网络错误，收藏失败`)
    }
  }

  useEffect(() => {
    handlePageSize(pageParams.pageNum, pageParams.pageSize, activeTab)
    getEarlyReport() // 获取早报
  }, [])

  return (
    <div className={styles.container}>
      {/* 左侧区域 */}
      <div className={styles.left}>
        <div className={styles.leftSidebar}>
          {/* 公共精选 */}
          <div className={styles.navCard}>
            <div className={styles.title}>公共精选</div>
            <div className={styles.navBar}>
              {navItems.map(item => {
                return (
                  <div
                    key={item.id}
                    onClick={() => handleNavBar(item.id)}
                    className={`${styles.navItem} ${activeMenu === `menu-${item.id}` ? styles.active : ""}`}
                  >
                    {item.label}
                  </div>
                )
              })}
            </div>
          </div>
          <div className={styles.line}></div>
          {/* 我的记录 */}
          <div className={styles.navCard}>
            <div className={styles.title}>我的记录</div>
            <div className={styles.navBar}>
              {personalKeywords.map(keyword => {
                return (
                  <div
                    key={keyword.id}
                    onClick={() => handlePersonalNavBar(keyword.id)}
                    className={`${styles.navItem} ${activeMenu === `menu-${keyword.id}` ? styles.active : ""}`}
                  >
                    {keyword.name}</div>
                )
              })}
            </div>
          </div>
          {/* 发布文章按钮 */}
          <button onClick={handleOpen} className={styles.postBtn}>
            发布文章
          </button>
        </div>
      </div>

      {/* 中间区域 */}
      <div className={styles.middle}>
        {/* <div className={styles.middleHeader}>
          <div className={styles.subTitle}>精选内容</div>
          <div style={{ fontSize: '13px', color: '#8e9aa7' }}>/</div>
          <div style={{ fontSize: '13px', color: '#8e9aa7' }}>从公共质量池中挑出的高质量内容</div>
        </div>
        <div style={{ borderBottom: '1px solid #b4b4bd80' }}></div>
        {content.length !== 0 &&
          <div className={styles.feed}>
            {
              content.map(item => {
                return (
                  <Skeleton key={item.id} loading={loading} active avatar>
                    <div className={styles.cardSty}>
                      <div className={styles.content}>
                        <div onClick={() => handleDetail(item.id!)}>
                          <div className={styles.cardTop}>
                            {item.cover ?
                              <div><img src={item.cover} alt="封面" className={styles.cardCover} /></div>
                              :
                              <div><img src="/imgs/admin.png" alt="头像" className={styles.cardAvatar} /></div>
                            }
                            <div className={styles.cardContent}>
                              <div className={styles.titleContainer}><div className={styles.cardTitle}>{item.title}</div></div>
                              <div className={styles.userInfo}>
                                <div className={styles.cardName}>{item.name}</div>
                                <div className={styles.cardTime}>{formatDateTime(item.time)}</div>
                              </div>
                              <div className={styles.contentContainer}><div className={styles.contentSty}>{item.abstract}</div></div>
                            </div>
                          </div>
                        </div>
                        <div className={styles.cardBottom}>
                          <div className={`${styles.actionItem} ${item.isLiked ? styles.active : ''}`} onClick={() => handleLike(item.id!, item.isLiked)}>
                            {item.isLiked ? <HeartFilled /> : <HeartOutlined />}
                            <span>{item.likes}</span>
                          </div>
                          <div className={`${styles.actionItem} ${item.isCollected ? styles.active : ''}`} onClick={() => handleCollection(item.id!, item.isCollected)}>
                            {item.isCollected ? <StarFilled /> : <StarOutlined />}
                            <span>{item.collection}</span>
                          </div>
                          <div className={styles.actionItem}> <CommentOutlined /> {item.comments}</div>
                        </div>
                      </div>
                    </div>
                  </Skeleton>
                )
              })
            }
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <div className={styles.pagination}>
                <ConfigProvider locale={zhCN}>
                  <Pagination onChange={(page, pageSize) => handlePageSize(page, pageSize, activeTab)} current={pageParams.pageNum} pageSize={pageParams.pageSize} total={pageParams.total} />
                </ConfigProvider>
              </div>
            </div>
          </div>
        }

        {isEmpty ?
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', width: '100%', height: '800px' }}>
            <div><img style={{ width: '300px' }} src="imgs/empty.png" alt="404" draggable="false" /></div>
            <div style={{ display: 'flex', fontSize: '18px' }}>抱歉没有找到相关的内容</div>
          </div> : ''
        } */}
        <ArticleList content={content} loading={loading} pageParams={pageParams} isEmpty={isEmpty} activeTab={activeTab} handleDetail={handleDetail} handleLike={handleLike} handleCollection={handleCollection} handlePageSize={handlePageSize} />
      </div>

      {/* 右侧区域 */}
      <div className={styles.right}>

        {/* 搜索框 */}
        <div className={styles.formControl}>
          <button className={styles.searchButton} type="submit">
            <SearchOutlined />
          </button>
          <input onChange={handleSearchChange} onKeyDown={searchCommunity} value={searchValue} className={`${styles.input} ${styles.inputAlt}`} placeholder="搜索文章" type="text" />
          <span className={`${styles.inputBorder} ${styles.inputBorderAlt}`}></span>
          {searchValue !== '' &&
            <button className={styles.delButton} onClick={() => clearSearchValue(activeTab)} type='submit'>
              <CloseCircleFilled />
            </button>
          }
        </div>

        {/* 今日早报 */}
        <div className={`${styles.rightCard} ${styles.trendingCard}`}>
          <div className={styles.cardHeader}>
            <div><ReadOutlined style={{ color: '#FFBF59' }} /> 今日早报</div>
            <div style={{ fontSize: '12px', cursor: 'pointer' }} onClick={() => window.open(`/community/${earlyReport?.id}`)}>查看全部 <RightOutlined /></div>
          </div>
          <div className={styles.earlyReport}>
            {earlyReport?.abstract}
          </div>
        </div>

        {/* 系统公告 */}
        <div className={`${styles.rightCard} ${styles.noticeCard}`}>
          <div className={styles.cardHeader}>
            <div><BellOutlined style={{ color: '#FFBF59' }} /> 公告栏</div>
          </div>
          {notices.map(notice => (
            <div key={notice.id} className={styles.noticeItem}>
              <div className={styles.noticeContent}>
                <div className={styles.noticeTitle}>{notice.title}</div>
                <div className={styles.noticeTime}>{notice.time}</div>
              </div>
            </div>
          ))}
        </div>



        {/* 每日一句 (NEW) */}
        {/* <div className={styles.dailyCard}>
          <div className={styles.dailyTitle}> <ReadOutlined />每日一句</div>
          <div className={styles.dailyContent}>
            "Talk is cheap. Show me the code."
          </div>
          <div className={styles.dailyAuthor}>—— Linus Torvalds</div>
        </div> */}
      </div>
    </div>
  )
}

export default Community
