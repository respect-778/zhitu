import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { ArrowLeftOutlined, HeartOutlined, HeartFilled, CommentOutlined, StarOutlined, StarFilled, ShareAltOutlined } from '@ant-design/icons'
import { Skeleton, message } from 'antd'
// import { getCommunityByIdAPI } from '@/api/community'
import type { IContent } from '@/types/community'
import { formatDateTime } from '@/utils/formatDateTime'
import styles from './index.module.less'

const DetailContent: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<IContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [isLiked, setIsLiked] = useState(false)
  const [isCollected, setIsCollected] = useState(false)
  const [scrollPercent, setScrollPercent] = useState(0)

  useEffect(() => {
    const handleScroll = () => {
      const winScroll = document.documentElement.scrollTop
      const height = document.documentElement.scrollHeight - document.documentElement.clientHeight
      const scrolled = (winScroll / height) * 100
      setScrollPercent(scrolled)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const fetchData = () => {
      setLoading(true)
      // 模拟后端返回的数据
      const mockData: IContent = {
        id: Number(id),
        avatar: 'A',
        name: '知途小助手',
        time: new Date().toISOString(),
        title: '探索 AI 的无限可能：从零开始构建你的第一个 Agent',
        content: `在当今这个技术飞速发展的时代，人工智能已经不再是一个遥不可及的词汇。从简单的聊天机器人到复杂的自主代理（Agents），AI 正在深刻地改变着我们的工作和生活方式。\n\n什么是 AI Agent？\n简单来说，AI Agent 是一个能够感知环境、进行推理并采取行动以实现特定目标的智能实体。不同于传统的程序，它具有一定的“自主性”。\n\n为什么要学习构建 Agent？\n1. 提升效率：自动化重复性任务。\n2. 扩展能力：处理人类难以胜任的大规模数据分析。\n3. 未来趋势：掌握下一代软件开发的核心技术。\n\n在本篇指南中，我们将从基础概念出发，逐步带你了解如何利用当前最先进的 LLM 模型（如 DeepSeek, GPT-4）打造属于你自己的智能代理...`,
        likes: 128,
        comments: 45,
        collection: 89,
        photo: [
          'https://images.unsplash.com/photo-1677442136019-21780ecad995?q=80&w=2070&auto=format&fit=crop',
          'https://images.unsplash.com/photo-1620712943543-bcc4628c7007?q=80&w=2070&auto=format&fit=crop'
        ]
      }

      setTimeout(() => {
        setData(mockData)
        setLoading(false)
      }, 800)
    }
    fetchData()
  }, [id])

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Skeleton active avatar paragraph={{ rows: 10 }} />
      </div>
    )
  }

  if (!data) {
    return <div className={styles.errorContainer}>未找到该内容</div>
  }

  return (
    <div className={styles.wrapper}>
      {/* 顶部进度条 */}

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
            <h1 className={styles.title}>{data.title}</h1>
            <div className={styles.authorSection}>
              <div className={styles.avatar}>{data.avatar}</div>
              <div className={styles.meta}>
                <span className={styles.name}>{data.name}</span>
                <span className={styles.time}>{formatDateTime(data.time)}</span>
              </div>
            </div>
          </header>

          {/* 文章正文 */}
          <section className={styles.content}>
            <p className={styles.text}>{data.content}</p>

            {/* 媒体展示 */}
            {data.photo && data.photo.length > 0 && (
              <div className={styles.photoGrid}>
                {data.photo.map((url, index) => (
                  <div key={index} className={styles.photoItem}>
                    <img src={url} alt={`Photo ${index + 1}`} />
                  </div>
                ))}
              </div>
            )}

            {/* 视频占位 (如果将来有视频) */}
            {data.video && data.video.length > 0 && (
              <div className={styles.mediaPlaceholder}>
                <span>视频预览 (开发中)</span>
              </div>
            )}

            {/* 链接占位 (如果将来有链接) */}
            {data.link && data.link.length > 0 && (
              <div className={styles.linkCard}>
                <ShareAltOutlined />
                <span>{data.link[0]}</span>
              </div>
            )}
          </section>

          {/* 分隔线 */}
          <div className={styles.divider} />

          {/* 这里可以扩展评论列表 */}
          <section className={styles.commentsPlaceholder}>
            <h3>评论 ({data.comments})</h3>
            <div className={styles.emptyComments}>
              快来发布你的第一条评论吧...
            </div>
          </section>
        </article>
      </main>

      {/* 悬浮操作栏 */}
      <aside className={styles.floatingBar}>
        <div
          className={`${styles.actionItem} ${isLiked ? styles.active : ''}`}
          onClick={() => setIsLiked(!isLiked)}
        >
          {isLiked ? <HeartFilled /> : <HeartOutlined />}
          <span>{data.likes + (isLiked ? 1 : 0)}</span>
        </div>
        <div className={styles.actionItem}>
          <CommentOutlined />
          <span>{data.comments}</span>
        </div>
        <div
          className={`${styles.actionItem} ${isCollected ? styles.active : ''}`}
          onClick={() => setIsCollected(!isCollected)}
        >
          {isCollected ? <StarFilled /> : <StarOutlined />}
          <span>{data.collection + (isCollected ? 1 : 0)}</span>
        </div>
        <div className={styles.dividerSmall} />
        <div className={styles.actionItem} onClick={() => message.success('链接已复制到剪贴板')}>
          <ShareAltOutlined />
        </div>
      </aside>
    </div>
  )
}

export default DetailContent