import styles from './index.module.less'
import type { IContent, IHotkeyword, INavItems } from '@/types/community'
import { HeartOutlined, HeartFilled, CommentOutlined, StarFilled, StarOutlined, SearchOutlined, BellOutlined, FireOutlined, ReadOutlined, EditOutlined } from '@ant-design/icons'
import { Pagination, ConfigProvider } from 'antd'
import zhCN from 'antd/lib/locale/zh_CN';
import React, { useEffect, useState } from 'react'
import ModalContent from './components/ModalContent'
import { collectedCommunityAPI, likeCommunityAPI, searchCommunityAPI } from '@/api/community';
import { formatDateTime } from '@/utils/formatDateTime';
import { useNavigate, useSearchParams } from 'react-router';
import { useAppSelector } from '@/store/hooks';
import { debounce } from 'lodash'

const Community = () => {
  const [activeTab, setActiveTab] = useState<string>('recommend') // tab
  const [isModalOpen, setIsModalOpen] = useState(false); // 弹框状态
  const [content, setContent] = useState<IContent[]>([]) // 帖子列表
  const [searchValue, setSearchValue] = useState<string>('') // 输入框中搜索的内容
  const [searchParams, setSearchParams] = useSearchParams() // 设置查询参数
  const [pageParams, setPageParams] = useState(() => {
    const search = searchParams.get('page') // 获取 page 参数
    const pageNum = parseInt(search || '1') // 初始化 -> 如果获取到的 page 参数为空，就默认显示第一页
    return { pageNum, pageSize: 3, total: 0 }
  }) // 分页

  const userInfo = useAppSelector(state => state.user.userInfo)

  // 左侧侧边栏
  const navItems: INavItems[] = [
    { id: 'recommend', label: '推荐' },
    { id: 'hot', label: '热门' },
    { id: 'new', label: '最新' },
    { id: 'relax', label: '放松' },
    { id: 'following', label: '关注' },
    { id: 'oneself', label: '我' }
  ]

  // 左侧热门关键词
  const hotKeywords: IHotkeyword[] = [
    { id: 1, name: 'AI' },
    { id: 2, name: 'Agent' },
    { id: 3, name: '前端工程化' },
    { id: 4, name: 'AIGC' },
    { id: 5, name: 'langchain' },
    { id: 6, name: 'nextjs' }
  ]

  // 右侧公告栏
  const notices = [
    { id: 1, title: '知途社区 1.2 版本更新公告', time: '2小时前' },
    { id: 2, title: '关于规范社区发帖的通知', time: '1天前' },
  ]

  // 右侧热榜
  const trendings = [
    { id: 1, name: 'DeepSeek R1 发布', hot: '1.2w' },
    { id: 2, name: 'React 19 新特性', hot: '8.5k' },
    { id: 3, name: 'Web3 开发入门', hot: '5.2k' },
  ]

  // 打开/关闭 弹框
  const handleOpen = () => {
    setIsModalOpen(!isModalOpen)
  }

  // 获取输入框中的内容
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value)
  }

  // 搜索
  const searchCommunity = async () => {
    // 如果搜索框为空，重置为所有帖子列表
    if (!searchValue && searchValue.trim() === '') { // 判断搜索框中的值是否为空
      handlePageSize(1, pageParams.pageSize)
      return
    }
    const res = await searchCommunityAPI({ keyword: searchValue.trim(), pageNum: 1, pageSize: pageParams.pageSize })
    setPageParams(pre => ({
      ...pre,
      pageNum: 1,
      pageSize: pageParams.pageSize,
      total: res.data.total
    }))
    setContent(res.data.list)
  }

  // 分页
  const handlePageSize = async (page: number, pageSize: number) => {
    const res = await searchCommunityAPI({ keyword: searchValue.trim(), pageNum: page, pageSize })
    setPageParams(pre => ({
      ...pre,
      pageNum: page,
      pageSize: pageSize,
      total: res.data.total
    }))
    setContent(res.data.list)

    // setSearchParams 里会自动修改浏览器地址的查询字符串（内部自动使用了 ）
    setSearchParams(pre => { // 把当前选中的页数给到 searchParams
      pre.set('page', String(page))
      return pre
    }, { replace: true })
  }

  // 进入详情页
  const navigate = useNavigate()
  const handleDetail = (id: number) => {
    navigate(`/community/${id}`)
  }

  // 点击喜欢时触发
  const handleLike = async (id: number, isLiked: boolean) => {
    // 当后一个状态依赖前一个状态时，需要使用 pre => pre 这种形式
    setContent(pre => pre.map(item =>
      item.id === id ? { ...item, isLiked: !item.isLiked, likes: item.isLiked ? item.likes = item.likes - 1 : item.likes = item.likes + 1 } : item
    ))

    await likeCommunityAPI(id, isLiked) // 调用接口，提醒后端同步修改赞
  }

  // 点击收藏时触发
  const handleCollection = async (id: number, isCollected: boolean) => {
    setContent(pre => pre.map(item => {
      return item.id === id ? { ...item, isCollected: !item.isCollected, collection: item.isCollected ? item.collection - 1 : item.collection + 1 } : item
    }))

    await collectedCommunityAPI(id, isCollected) // 调用接口，提醒后端同步修改收藏量
  }

  useEffect(() => {
    handlePageSize(pageParams.pageNum, pageParams.pageSize)
  }, [])

  return (
    <div className={styles.container}>
      {/* 左侧区域 */}
      <div className={styles.left}>
        <div className={styles.leftSidebar}>
          {/* 推荐、热门、最新、放松、关注、账户 */}
          <div className={styles.navCard}>
            {/* 搜索框 */}
            <div className={styles.formControl}>
              <input onChange={handleSearchChange} className={`${styles.input} ${styles.inputAlt}`} placeholder="搜索帖子" type="text" />
              <span className={`${styles.inputBorder} ${styles.inputBorderAlt}`}></span>
              <button onClick={debounce(searchCommunity, 300)} className={styles.searchButton} type="submit">
                <SearchOutlined />
              </button>
            </div>
            {/* 侧边栏 */}
            <div className={styles.navBar}>
              {navItems.map(item => {
                return (
                  <div
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`${styles.navItem} ${activeTab === item.id ? styles.active : ""}`}
                  >
                    {item.label}
                  </div>
                )
              })}
            </div>
          </div>
          {/* 热门关键词 */}
          <div className={styles.navCard}>
            <div className={styles.title}>热门关键词</div>
            <div className={styles.navKeyword}>
              {hotKeywords.map(keyword => {
                return (
                  <div className={styles.navKey} key={keyword.id}>{keyword.name}</div>
                )
              })}
            </div>
          </div>
          {/* 每日一句 (NEW) */}
          <div className={styles.dailyCard}>
            <div className={styles.dailyTitle}> <ReadOutlined />每日一句</div>
            <div className={styles.dailyContent}>
              "Talk is cheap. Show me the code."
            </div>
            <div className={styles.dailyAuthor}>—— Linus Torvalds</div>
          </div>
        </div>
      </div>

      {/* 中间区域 */}
      <div className={styles.middle}>
        {content.length !== 0 ? <div className={styles.feed}>
          {
            content.map(item => {
              return (
                <div key={item.id} className={styles.cardSty}>
                  <div className={styles.content}>
                    <div onClick={() => handleDetail(item.id!)}>
                      <div className={styles.cardTop}>
                        <div><img src="/imgs/admin.png" alt="" className={styles.cardAvatar} /></div>
                        <div className={styles.userInfo}>
                          <div className={styles.cardName}>{item.name}</div>
                          <div className={styles.cardTime}>{formatDateTime(item.time)}</div>
                        </div>
                      </div>
                      <div className={styles.cardMiddle}>
                        <div className={styles.tc}>
                          <div className={styles.titleContainer}><div className={styles.cardTitle}>{item.title}</div></div>
                          <div className={styles.contentContainer}><div className={styles.contentSty}>{item.content}</div></div>
                        </div>
                        {item.photo ?
                          <div className={styles.photoContainer}>
                            <img src={item.photo[0]} alt="" className={styles.photo} />
                          </div> : ''}
                        {item.video ? <div>{item.video || ''}</div> : ''}
                        {item.link ? <div>{item.link || ''}</div> : ''}
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
              )
            })
          }
        </div>
          :
          <div> </div>
        }
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className={styles.pagination}>
            <ConfigProvider locale={zhCN}>
              <Pagination onChange={handlePageSize} current={pageParams.pageNum} pageSize={pageParams.pageSize} total={pageParams.total} />
            </ConfigProvider>
          </div>
        </div>
      </div>

      {/* 右侧区域 */}
      <div className={styles.right}>
        {/* 用户个人资料 */}
        <div className={`${styles.rightCard} ${styles.profileCard}`}>
          <div className={styles.profileAvatar}><img style={{ width: '100%' }} src="/imgs/admin.png" alt="" /></div>
          <div className={styles.profileName}>{userInfo.data.username}</div>
          <div className={styles.profileBio}>知识改变世界</div>

          <div className={styles.statsGrid}>
            <div className={styles.statItem}>
              <span className={styles.statValue}>{userInfo.data.art_count}</span>
              <span className={styles.statLabel}>帖子</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statValue}>{userInfo.data.favorites_count}</span>
              <span className={styles.statLabel}>收藏</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statValue}>{userInfo.data.like_count}</span>
              <span className={styles.statLabel}>喜欢</span>
            </div>
          </div>

          {/* Post Button (Moved) */}
          <button onClick={handleOpen} className={styles.postBtn}>
            <EditOutlined /> 发布帖子
          </button>
        </div>

        {/* 系统公告 */}
        <div className={`${styles.rightCard} ${styles.noticeCard}`}>
          <div className={styles.cardHeader}>
            <BellOutlined style={{ color: '#FF6464' }} /> 公告栏
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

        {/* 热榜 */}
        <div className={`${styles.rightCard} ${styles.trendingCard}`}>
          <div className={styles.cardHeader}>
            <FireOutlined style={{ color: '#FFBF59' }} /> 全站热榜
          </div>
          {trendings.map((item, index) => (
            <div key={item.id} className={styles.trendItem}>
              <div className={styles.trendLeft}>
                <span className={`${styles.trendRank} ${index === 0 ? styles.top1 : index === 1 ? styles.top2 : index === 2 ? styles.top3 : ''}`}>{index + 1}</span>
                <span className={styles.trendName}>{item.name}</span>
              </div>
              <div className={styles.trendHot}>{item.hot}</div>
            </div>
          ))}
        </div>
      </div>

      <ModalContent isModalOpen={isModalOpen} handleOpen={handleOpen} handlePageSize={() => handlePageSize(1, pageParams.pageSize)} />
    </div>
  )
}

export default Community
