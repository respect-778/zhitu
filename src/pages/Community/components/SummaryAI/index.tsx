import {
  ArrowRightOutlined,
  DownOutlined,
  LoadingOutlined,
  MessageOutlined,
  PlusOutlined,
  RightOutlined,
  UpOutlined
} from '@ant-design/icons'
import { Viewer } from '@bytemd/react'
import { Drawer } from 'antd'
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  addChatMessageAPI,
  addChatSessionAPI,
  callChatStreamAPI,
  getChatMessageAPI,
  getHistorySessionAPI,
  getSummaryMessageAPI
} from '@/api/chat'
import { getCommunityByIdAPI } from '@/api/community'
import { useAppSelector } from '@/store/hooks'
import { formatDateTime } from '@/utils/formatDateTime'
import {
  markdownPlugins,
  markdownPluginsNoHighlight,
  normalizeMarkdownText
} from '@/utils/markdown'
import { useAutoResizeTextarea } from '@/hooks/useAutoResizeTextarea'
import { useStreamingAutoFollow } from '@/hooks/useStreamingAutoFollow'
import type { IContentDetail } from '@/types/community'
import type { IChatMessage, IChatSession } from '@/types/chat'
import styles from './index.module.less'
import ScrollDownButton from '@/components/ScrollDownButton'

const SUMMARY_OPENING_PROMPT =
  '请帮我快速总结这篇文章的核心干货，按“一句话总结、关键观点、适合谁读、是否值得细读”输出。'

const SummaryAI = () => {
  // 路由参数与当前文章 id
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const articleId = Number(id)
  // 当前登录用户 id
  const userId = Number(useAppSelector(state => state.user.userId))

  // 页面基础状态
  const [detail, setDetail] = useState<IContentDetail>() // 文章详情界面
  const [isShowDrawer, setIsShowDrawer] = useState(false) // 是否显示抽屉
  const [inputValue, setInputValue] = useState('') // 输入框内容
  const [isInputEmpty, setIsInputEmpty] = useState(true) // 输入框是否为空
  const [sessionId, setSessionId] = useState<number | null>(null) // 当前会话 id
  const [messages, setMessages] = useState<IChatMessage[]>([]) // 当前会话的聊天记录
  const [historySession, setHistorySession] = useState<IChatSession[]>([]) // 历史会话
  const [historyLoading, setHistoryLoading] = useState(false) // 历史会话加载中
  const [streamBySession, setStreamBySession] = useState< // 流式回复
    Record<number, { isStreaming: boolean; content: string }>
  >({})
  const [isFirstSummary, setIsFirstSummary] = useState(false) // 是否是首次总结
  const [isOpenAbstract, setIsOpenAbstract] = useState(false) // 是否展开总结摘要
  const [leftWidth, setLeftWidth] = useState(450) // 左侧宽度

  const { textareaRef } = useAutoResizeTextarea({ // textarea 自适应高度
    value: inputValue,
    minHeight: 44,
    maxHeight: 80
  })

  const abortControllerRef = useRef<AbortController | null>(null) // 取消请求
  const isDraggingRef = useRef(false) // 是否正在拖拽
  const startXRef = useRef(0) // 鼠标相对浏览器左边的距离
  const startWidthRef = useRef(0) // 左侧面板自身的宽度

  // 当前会话对应的流式回复状态
  const currentStream = useMemo(() => {
    if (sessionId === null) {
      return { isStreaming: false, content: '' }
    }

    return streamBySession[sessionId] ?? { isStreaming: false, content: '' }
  }, [sessionId, streamBySession])

  const {
    containerRef: conversationRef,
    endRef,
    showJumpToBottom,
    onUserScroll,
    scrollToBottomAndLock
  } = useStreamingAutoFollow({
    isStreaming: currentStream.isStreaming,
    depKey: `${messages.length}-${currentStream.content.length}`,
    bottomThreshold: 24,
  })

  // 根据文章 id 获取当前文章对应的总结会话和消息记录
  const getSummaryMessage = useCallback(async () => {
    if (!Number.isInteger(articleId) || articleId <= 0) throw new Error('文章 id 无效')

    try {
      const res = await getSummaryMessageAPI(articleId)
      setSessionId(res.data.session_id ?? null)
      setMessages(res.data.messages ?? [])

      return res.data ?? null
    } catch (error) {
      console.error('获取总结消息失败:', error)
      throw error
    }
  }, [articleId])

  // 获取当前用户下所有文章总结类型的历史会话
  const getHistorySession = useCallback(async () => {
    try {
      setHistoryLoading(true)
      const res = await getHistorySessionAPI('article_summary')
      setHistorySession(res.data ?? [])
    } catch (error) {
      console.error('获取总结历史失败:', error)
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  // 点击历史记录
  const handleClickHistory = async (sessionId: number, articleId: number) => {
    const res = await getChatMessageAPI(sessionId)
    setMessages(res.data ?? []) // 更新消息列表
    const articleRes = await getCommunityByIdAPI(articleId)
    setDetail(articleRes.data ?? null) // 更新文章详情
    navigate(`/community/${articleId}/summary`)
  }

  // 输入框内容变化
  const handleInput = (value: string) => {
    setInputValue(value)
    setIsInputEmpty(value.trim() === '')
  }

  // 提交问题（正常的用户输入，ai回复）
  const handleSubmit = async (signal?: AbortSignal) => {
    const trimmedInput = inputValue.trim()
    if (trimmedInput === '' || sessionId === null || isFirstSummary || currentStream.isStreaming) return

    let userMessage = trimmedInput

    // 先保存用户消息，再开启流式回复
    try {
      await addChatMessageAPI({
        session_id: sessionId,
        role: 'user',
        content: userMessage
      })
      setInputValue('')
      setIsInputEmpty(true)
      await getSummaryMessage()
    } catch (error) {
      console.error('保存用户消息失败:', error)
      return
    }

    // 打开当前会话的流式状态
    setStreamBySession(pre => ({
      ...pre,
      [sessionId]: { isStreaming: true, content: '' }
    }))

    // 流式调用 AI，并把增量内容写入当前会话的流式状态
    try {
      await callChatStreamAPI(
        0,
        userMessage,
        sessionId,
        content => {
          setStreamBySession(pre => ({
            ...pre,
            [sessionId]: { isStreaming: true, content }
          }))
        },
        error => {
          console.error('流式调用错误:', error)
        },
        false,
        signal
      )
    } catch (error) {
      if (signal?.aborted) return // 如果是取消接口，不抛出错误

      await addChatMessageAPI({
        session_id: sessionId,
        role: 'ai',
        content: `AI调用失败:${error}`
      })
      console.error('AI 调用失败:', error)
    } finally {
      if (signal?.aborted) return // 如果是取消接口，不执行后续操作

      // 流式结束后，刷新消息和历史会话，并关闭流式状态
      await getSummaryMessage()
      await getHistorySession()
      setStreamBySession(pre => ({
        ...pre,
        [sessionId]: { isStreaming: false, content: '' }
      }))
    }
  }

  // 回车提交问题
  const keydownQuestion = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { // 回车 且没按 shift，阻止默认换行，执行发送
      e.preventDefault()
      handleSubmit(abortControllerRef.current?.signal)
    }
  }

  // 首次进入文章总结页时先创建文章总结会话
  const startInitialSummary = async (signal?: AbortSignal) => {
    if (sessionId !== null) return

    let userMessage = SUMMARY_OPENING_PROMPT
    let activeSessionId = null

    // 创建会话
    try {
      const res = await addChatSessionAPI({
        user_id: userId,
        session_title: userMessage,
        scene_type: 'article_summary',
        source_id: articleId
      })
      activeSessionId = res.data.session_id
      setSessionId(activeSessionId)
    } catch (error) {
      console.error('创建总结会话失败:', error)
      return
    }

    if (activeSessionId === null) {
      console.error('sessionId 创建失败')
      return
    }

    // 先保存用户消息，再开启流式回复
    try {
      await addChatMessageAPI({
        session_id: activeSessionId,
        role: 'user',
        content: userMessage
      })
      setInputValue('')
      setIsInputEmpty(true)
      await getSummaryMessage()
    } catch (error) {
      console.error('保存用户消息失败:', error)
      return
    }

    // 打开当前会话的流式状态
    setStreamBySession(pre => ({
      ...pre,
      [activeSessionId]: { isStreaming: true, content: '' }
    }))

    // 流式调用 AI，并把增量内容写入当前会话的流式状态
    try {
      await callChatStreamAPI(
        0,
        userMessage,
        activeSessionId,
        content => {
          setStreamBySession(pre => ({
            ...pre,
            [activeSessionId]: { isStreaming: true, content }
          }))
        },
        error => {
          console.error('流式调用错误:', error)
        },
        false,
        signal
      )
    } catch (error) {
      if (signal?.aborted) return // 如果是取消接口，不抛出错误

      await addChatMessageAPI({
        session_id: activeSessionId,
        role: 'ai',
        content: `AI调用失败:${error}`
      })
      console.error('AI 调用失败:', error)
    } finally {
      if (signal?.aborted) return // 如果是取消接口，不执行后续操作

      // 流式结束后，刷新消息和历史会话，并关闭流式状态
      await getSummaryMessage()
      await getHistorySession()
      setStreamBySession(pre => ({
        ...pre,
        [activeSessionId]: { isStreaming: false, content: '' }
      }))
    }
  }

  // 显示摘要按钮
  const handleOpenAbstract = () => {
    setIsOpenAbstract(pre => !pre)
  }

  // 鼠标滑动
  const handleMouseMove = (e: MouseEvent) => {
    if (!isDraggingRef.current) return
    const deltaX = e.clientX - startXRef.current // 计算出鼠标移动的距离
    let nextWidth = startWidthRef.current + deltaX // 把左侧宽度当前的距离加上计算出的鼠标移动距离，就是下一个的左侧宽度

    const minWidth = 320 // 最小宽度
    const maxWidth = 980 // 最大宽度

    if (nextWidth < minWidth) nextWidth = minWidth
    if (nextWidth > maxWidth) nextWidth = maxWidth

    setLeftWidth(nextWidth)
  }

  // 鼠标松开
  const handleMouseUp = () => {
    isDraggingRef.current = false // 设置为不再拖动

    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
  }

  // 鼠标按下
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    isDraggingRef.current = true // 设置为正在拖动

    startXRef.current = e.clientX // 获取鼠标按下时的位置
    startWidthRef.current = leftWidth // 获取左侧宽度

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  // 获取当前文章详情
  useEffect(() => {
    if (!id) return

    const abortController = new AbortController()
    abortControllerRef.current = abortController
    const signal = abortController.signal // 用于取消请求的

    const loadDetail = async () => {
      try {
        const res = await getCommunityByIdAPI(Number(id))
        if (signal.aborted) return

        setDetail(res.data)
        await initSummaryPage()
      } catch (error) {
        if (signal.aborted) return // 如果是取消接口，不执行后续操作

        console.error('获取文章详情失败:', error)
        navigate('/404')
      }
    }

    // 进入文章总结页时，拉取当前文章的总结消息和历史会话
    const initSummaryPage = async () => { // 初始化文章总结页
      try {
        const summaryRes = await getSummaryMessage()

        if (signal.aborted) return

        await getHistorySession()

        if (signal.aborted) return

        if (summaryRes.session_id == null) {
          setIsFirstSummary(true)
          await startInitialSummary(signal)
          setIsFirstSummary(false)
        }

      } catch (error) {
        if (signal.aborted) return
        console.error('初始化文章总结页失败:', error)
      }
    }

    void loadDetail()

    return () => {
      abortController.abort() // 组件卸载时，取消所有进行中的请求
      abortControllerRef.current = null // 清空引用
    }
  }, [id, getSummaryMessage, getHistorySession])

  // 进入界面 / 当开启一个新会话时 -> 自动滚动到底部
  useLayoutEffect(() => {
    if (messages.length === 0) return
    scrollToBottomAndLock()
  }, [messages.length])

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft} onClick={() => navigate('/')}>
          <img style={{ height: '60px' }} src="/imgs/logo.png" alt="logo" draggable="false" />
        </div>
        <div className={styles.headerRight} onClick={() => window.open('/community/publish')}>
          <PlusOutlined />
          <span>创作</span>
        </div>
      </header>

      <div className={styles.body} style={{ ['--left-width' as any]: `${leftWidth}px` }}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarTitle}>
            <div className={styles.sidebarTitleText}>{detail?.title || ''}</div>
            <div className={styles.sidebarMeta}>
              {detail?.name ? <span>{detail.name}</span> : null}
              {detail?.time ? <span>{formatDateTime(detail.time)}</span> : null}
            </div>
          </div>

          <div className={styles.summaryEntry}>
            <div className={styles.summaryEntryHeader}>
              <div className={styles.summaryEntryLeft}>
                <div className={styles.summaryIcon}>VIA</div>
                <span>文章摘要</span>
              </div>
              {isOpenAbstract ?
                <UpOutlined className={styles.summaryArrow} onClick={handleOpenAbstract} />
                :
                <DownOutlined className={styles.summaryArrow} onClick={handleOpenAbstract} />
              }
            </div>
            <div className={`${styles.summaryEntryContent} ${isOpenAbstract ? styles.open : ''}`}>
              <div>{detail?.abstract || ''}</div>
            </div>
          </div>

          <div className={styles.articleContainer}>
            <div className={styles.articleContent}>
              <Viewer value={detail?.content || ''} plugins={markdownPlugins} />
            </div>
          </div>
        </aside>

        <div className={styles.moveBtn} onMouseDown={handleMouseDown}></div>

        <main className={styles.main}>
          <div className={styles.mainTop}>
            <div className={styles.mainLeft}>
              <div className={styles.mainTitle}>对话</div>
              <div className={styles.mainHint}>内容由 AI 生成，仅供参考</div>
            </div>

            <div className={styles.mainRight} onClick={() => setIsShowDrawer(true)}>
              <div>历史记录</div>
              <RightOutlined />
            </div>
          </div>

          {/* 右侧历史记录抽屉 */}
          <Drawer
            title="历史记录"
            open={isShowDrawer}
            onClose={() => setIsShowDrawer(false)}
            closable={{ placement: 'end' }}
            getContainer={false}
            mask={false}
            size={320}
          >
            {!historyLoading ? (
              <div className={styles.historyCard}>
                {historySession.map(item => (
                  <div key={item.id} className={styles.historyItem} onClick={() => handleClickHistory(item.id!, item.source_id!)}>
                    <div className={styles.historyIconWrap}>
                      <MessageOutlined />
                    </div>
                    <div className={styles.historySessionTitle}>{item.session_title}</div>
                  </div>
                ))}
                <div className={styles.historyEnd}>没有更多数据</div>
              </div>
            ) : (
              <div className={styles.historyLoading}>加载中...</div>
            )}
          </Drawer>

          <div className={styles.mainContent}>
            {/* 对话消息列表：用户消息 + AI 历史回复 + 当前流式回复 */}
            <div className={styles.conversationList} ref={conversationRef} onScroll={onUserScroll}>
              {messages.map(message =>
                message.role === 'user' ? (
                  <div key={message.id} className={styles.questionRow}>
                    <div className={styles.questionBubble}>{message.content}</div>
                  </div>
                ) : (
                  <div key={message.id} className={styles.answerSection}>
                    <div className={styles.answerHeader}>
                      <div className={styles.answerHeaderLeft}>
                        <MessageOutlined />
                        <span>回答</span>
                      </div>
                    </div>

                    <div className={styles.answerBodyStatic}>
                      <div className={styles.answerMarkdown}>
                        <Viewer
                          value={normalizeMarkdownText(message.content)}
                          plugins={markdownPluginsNoHighlight}
                        />
                      </div>
                    </div>
                  </div>
                )
              )}

              {/* 当前正在流式生成的 AI 回复 */}
              {currentStream.isStreaming && (
                <div className={styles.answerSection}>
                  <div className={styles.answerHeader}>
                    <div className={styles.answerHeaderLeft}>
                      <MessageOutlined />
                      <span>回答</span>
                    </div>
                    <div className={styles.answerStatus}>
                      <LoadingOutlined spin />
                      <span>正在响应</span>
                    </div>
                  </div>

                  <div className={styles.answerBodyStatic}>
                    <div className={styles.answerMarkdown}>
                      {currentStream.content ? (
                        <Viewer
                          value={normalizeMarkdownText(currentStream.content)}
                          plugins={markdownPluginsNoHighlight}
                        />
                      ) : (
                        <div className={styles.answerNotice}>AI 已进入总结阶段，正在组织回答内容...</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 空状态 */}
              {!messages.length && !currentStream.isStreaming && (
                <div className={styles.emptyConversation}>
                  AI 总结结果会显示在这里，发送后即可开始生成。
                </div>
              )}
              <div ref={endRef} className={styles.scrollSentinel} aria-hidden="true" />
            </div>
          </div>

          {/* 底部输入区 */}
          <div className={styles.composer}>
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={e => handleInput(e.target.value)}
              onKeyDown={keydownQuestion}
              className={styles.composerInput}
              placeholder="还有不懂的地方，可以继续提问哦"
              disabled={currentStream.isStreaming || isFirstSummary}
            />
            <div className={styles.composerFooter}>
              <div className={styles.modelTag}>
                <img style={{ height: '20px' }} src="/imgs/deepseek-color.png" alt="ai" />
                <span>DeepSeek-v4</span>
              </div>
              <button
                type="button"
                disabled={isInputEmpty || currentStream.isStreaming || isFirstSummary}
                className={`${styles.sendButton} ${!isInputEmpty && !currentStream.isStreaming ? styles.activeBtn : ''}`}
                onClick={() => handleSubmit(abortControllerRef.current?.signal)}
              >
                {currentStream.isStreaming || isFirstSummary ? <LoadingOutlined /> : <ArrowRightOutlined />}
              </button>
            </div>
          </div>
        </main>
      </div>

      {/* 悬浮：向下滚动按钮 */}
      {showJumpToBottom && currentStream.isStreaming
        &&
        <aside className={styles.scrollDownBtn} onClick={scrollToBottomAndLock} >
          <ScrollDownButton />
        </aside>}
    </div>
  )
}

export default SummaryAI
