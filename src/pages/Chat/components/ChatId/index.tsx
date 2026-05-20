import { ArrowUpOutlined, BulbOutlined, SearchOutlined, XFilled } from "@ant-design/icons"
import styles from './index.module.less'
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { addChatMessageAPI, callChatStreamAPI, getChatMessageAPI } from "@/api/chat"
import type { IChatMessage, IChatSession } from "@/types/chat"
import { useNavigate, useOutletContext, useParams } from "react-router"
import { Space } from "antd"
import { Viewer } from "@bytemd/react"
import { markdownPluginsNoHighlight, normalizeMarkdownText } from "@/utils/markdown"
import { useStreamingAutoFollow } from "@/hooks/useStreamingAutoFollow"
import { useAutoResizeTextarea } from "@/hooks/useAutoResizeTextarea"
import { getStore } from "@/utils/store"
import ScrollDownButton from "@/components/ScrollDownButton"


type ChatStreamState = {
  isStreaming: boolean
  content: string
  isSearching?: boolean
  searchQuery?: string
  sources?: Array<{ title: string, url: string }>
}
type PendingFirstMessage = {
  sessionUuid: string
  content: string
  mode: number
}
type SubmitOptions = {
  sessionUuid?: string
  content?: string
  mode?: number
}

const ChatId = () => {
  const { id } = useParams() // 获取动态路由
  const sessionUuid = id ?? '' // 获取当前会话uuid
  const navigate = useNavigate()
  const [mode, setmode] = useState(0) // 是否选中思考模型，默认 0 为不选择
  const [searchValue, setSearchValue] = useState('') // 输入框内容
  const { textareaRef } = useAutoResizeTextarea({ value: searchValue, minHeight: 44, maxHeight: 280 })
  const [isInputEmpty, setIsInputEmpty] = useState(true) // 输入框是否为空，默认为空
  const {
    historySession,
    pendingFirstMessageBySession,
    handleNewChatComplete,
    getHistoryChatSession,
    streamBySession,
    setStreamBySession,
    messagesBySession,
    setMessagesBySession,
    abortControllerMapRef
  } = useOutletContext<{ // 从父组件中拿状态和方法 
    historySession: IChatSession[], // 从父组件那，拿到历史会话记录栏数据，这里用来显示 会话记录 title 在对话记录上面
    pendingFirstMessageBySession: Record<string, PendingFirstMessage>,
    handleNewChatComplete: (sessionUuid?: string) => void,
    getHistoryChatSession: () => void,
    streamBySession: Record<string, ChatStreamState>,
    setStreamBySession: React.Dispatch<React.SetStateAction<Record<string, ChatStreamState>>>,
    messagesBySession: Record<string, IChatMessage[]>,
    setMessagesBySession: React.Dispatch<React.SetStateAction<Record<string, IChatMessage[]>>>,
    abortControllerMapRef: React.MutableRefObject<Record<string, AbortController | undefined>>
  }>()
  const pendingFirstMessage = pendingFirstMessageBySession[sessionUuid]
  const currentMessages = messagesBySession[sessionUuid] ?? []
  const currentStream = streamBySession[sessionUuid] ?? { isStreaming: false, content: '' } // 获取当前会话的流式字典信息
  const currentSessionTitle = historySession.find(item => item.uuid === sessionUuid)?.session_title ?? ''

  const currentSessionUuidRef = useRef(sessionUuid)
  currentSessionUuidRef.current = sessionUuid
  const consumedPendingRef = useRef<Record<string, boolean>>({}) // 防止新会话首条消息重复消费

  const isTempAiMessage = (message?: IChatMessage) =>
    message?.role === 'ai' && typeof message.id === 'number' && message.id < 0

  const createTempAiMessage = (content: string): IChatMessage => ({
    id: -Date.now(),
    role: 'ai',
    content,
    thinking_mode: 0,
    created_at: new Date().toISOString()
  })

  const mergeMessagesWithLocalPartial = (serverMessages: IChatMessage[], localMessages: IChatMessage[]) => {
    const lastLocalMessage = localMessages[localMessages.length - 1]
    const lastServerMessage = serverMessages[serverMessages.length - 1]

    if (isTempAiMessage(lastLocalMessage) && lastServerMessage?.role !== 'ai') {
      return [...serverMessages, lastLocalMessage]
    }

    return serverMessages
  }

  const upsertLocalAiMessage = (targetSessionUuid: string, content: string) => {
    if (!content.trim()) return

    setMessagesBySession(pre => {
      const messages = pre[targetSessionUuid] ?? []
      const lastMessage = messages[messages.length - 1]

      if (isTempAiMessage(lastMessage)) {
        return {
          ...pre,
          [targetSessionUuid]: [...messages.slice(0, -1), { ...lastMessage, content }]
        }
      }

      return {
        ...pre,
        [targetSessionUuid]: [...messages, createTempAiMessage(content)]
      }
    })
  }

  // ai回复时，自动跟随 ai 的 hook
  const {
    containerRef: chatContainerRef,
    endRef,
    showJumpToBottom,
    onUserScroll,
    scrollToBottomAndLock
  } = useStreamingAutoFollow({
    isStreaming: currentStream.isStreaming,
    depKey: `${currentMessages.length}-${currentStream.content.length}`,
    bottomThreshold: 24,
  })

  // 切换深度思考模式
  const handleThinking = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    setmode(mode === 0 ? 1 : 0)
  }

  // 获取当前输入框最新值 并 监听输入框是否为空
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSearchValue(e.target.value)
    if (e.target.value.trim() !== '') {
      setIsInputEmpty(false) // 输入框不为空
    } else {
      setIsInputEmpty(true) // 输入框为空
    }
  }

  // 获取指定会话对应的聊天记录
  const getCurrentChatMessage = async (targetSessionUuid = sessionUuid) => {
    if (!targetSessionUuid) {
      navigate('/chat', { replace: true })
      return
    }

    try {
      const res = await getChatMessageAPI(targetSessionUuid)
      setMessagesBySession(pre => ({
        ...pre,
        [targetSessionUuid]: mergeMessagesWithLocalPartial(res.data, pre[targetSessionUuid] ?? [])
      }))
    } catch (error) {
      if (currentSessionUuidRef.current === targetSessionUuid) {
        navigate('/chat', { replace: true })
      }
      console.error('获取聊天记录失败:', error)

    }
  }

  // handleSubmit 统一提交问题逻辑 （子路由里 不需要 创建聊天会话）（这里分 新对话 和 旧对话）
  const handleSubmit = async (options: SubmitOptions = {}) => {
    const activeSessionUuid = options.sessionUuid ?? sessionUuid

    if (!activeSessionUuid) {
      navigate('/chat', { replace: true })
      return
    }

    const userMessage = options.content ?? searchValue
    const currentMode = options.mode ?? mode
    if (userMessage.trim() === '') return

    // 新问题提交时，优先锁定到底部，确保马上跟随 AI 回复区域
    if (currentSessionUuidRef.current === activeSessionUuid) {
      scrollToBottomAndLock()
    }

    // 1. 创建 user 聊天记录
    try {
      await addChatMessageAPI({ session_uuid: activeSessionUuid, role: 'user', content: userMessage }) // 创建 用户 聊天记录
      await getCurrentChatMessage(activeSessionUuid) // 获取最新消息列表
      if (currentSessionUuidRef.current === activeSessionUuid) {
        scrollToBottomAndLock()
      }
    } catch (error) {
      console.log(error)
    }

    if (currentSessionUuidRef.current === activeSessionUuid) {
      setSearchValue('') // 提交后，清空输入框
    }

    // 开启流式生成并记录当前开启流式的会话id
    setStreamBySession(pre => ({ ...pre, [activeSessionUuid]: { isStreaming: true, content: '' } }))

    // 2. 流式调用 ai 大模型
    const controller = new AbortController()
    abortControllerMapRef.current[activeSessionUuid] = controller

    let streamedContent = ''

    try {
      streamedContent = await callChatStreamAPI(
        currentMode,
        userMessage,
        activeSessionUuid,
        (content) => {
          // 每次收到新内容就更新（保留搜索状态）
          setStreamBySession(pre => ({ ...pre, [activeSessionUuid]: { ...pre[activeSessionUuid], isStreaming: true, content } }))
        },
        (query) => {
          // 更新搜索状态
          setStreamBySession(pre => ({
            ...pre, [activeSessionUuid]: { ...pre[activeSessionUuid], isSearching: true, searchQuery: query }
          }))
        },
        (sources) => {
          // 更新搜索结果
          setStreamBySession(pre => ({
            ...pre, [activeSessionUuid]: { ...pre[activeSessionUuid], sources }
          }))
        },
        (error) => {
          console.error('流式调用错误:', error)
        },
        false,
        controller.signal
      )
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }
      await addChatMessageAPI({ session_uuid: activeSessionUuid, role: 'ai', content: `AI调用失败:${error}` })
      console.error('AI 调用失败:', error)
    } finally {
      const hasStreamedContent = streamedContent.trim() !== ''

      handleNewChatComplete(activeSessionUuid) // 通知父组件清理该会话的待发送首条消息

      if (hasStreamedContent) {
        upsertLocalAiMessage(activeSessionUuid, streamedContent)
      }

      if (currentSessionUuidRef.current === activeSessionUuid) {
        setIsInputEmpty(true)
      }
      setStreamBySession(pre => ({ ...pre, [activeSessionUuid]: { ...pre[activeSessionUuid], isStreaming: false, content: '' } })) // 结束流式生成并清空内容（保留搜索状态）
      if (abortControllerMapRef.current[activeSessionUuid] === controller) {
        delete abortControllerMapRef.current[activeSessionUuid]
      }

      if (hasStreamedContent || controller.signal.aborted) {
        await new Promise(resolve => setTimeout(resolve, 300))
      }

      await getCurrentChatMessage(activeSessionUuid) // 刷新消息列表（后端已保存 AI 回复）
      getHistoryChatSession() // 通过父组件传递过来的方法 -> 获取最新历史记录
    }
  }

  // 点击按钮 -> 提交问题
  const clickQuestion = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    handleSubmit() // 提交
  }

  // 回车 -> 提交问题
  const keydownQuestion = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return // 防 中文输入法回车误发送

    if (e.key === 'Enter' && !e.shiftKey) { // Enter 且没按 Shift：阻止默认换行，执行发送
      e.preventDefault()
      handleSubmit() // 提交
    }
  }

  // 暂停回复按钮
  const handleStopGeneration = () => {
    abortControllerMapRef.current[sessionUuid]?.abort()
  }

  // 进入到界面滚动到底部
  useLayoutEffect(() => {
    // 这里需要考虑的是：在组件挂载完之后，ai聊天框这里还需要加载出聊天记录，所以如果不先让聊天记录加载出来
    // 那么滚动到底部的效果就是在聊天记录都没有出现的情况下就触发了，也就导致了后续聊天记录加载出来时，发现没有滚动到底部的效果。
    if (currentMessages.length === 0) return
    scrollToBottomAndLock()
  }, [currentMessages.length])

  // 当 动态路由 id 发生改变，就调用方法，获取当前 会话id 下的聊天记录
  useEffect(() => {
    getCurrentChatMessage() // 获取到当前 会话id 的数据，显示在界面中
  }, [sessionUuid])

  // 只匹配当前会话的首条待发送消息
  useEffect(() => {
    if (!pendingFirstMessage || pendingFirstMessage.sessionUuid !== sessionUuid) return
    if (consumedPendingRef.current[pendingFirstMessage.sessionUuid]) return

    consumedPendingRef.current[pendingFirstMessage.sessionUuid] = true
    handleNewChatComplete(pendingFirstMessage.sessionUuid)
    handleSubmit({
      sessionUuid: pendingFirstMessage.sessionUuid,
      content: pendingFirstMessage.content,
      mode: pendingFirstMessage.mode
    })
  }, [pendingFirstMessage, sessionUuid])

  // // 流式结束后再统一高亮代码，避免流式阶段高频闪烁与滚动抖动
  // useLayoutEffect(() => {
  //   if (currentStream.isStreaming) return

  //   const container = chatContainerRef.current
  //   if (!container) return

  //   const codeBlocks = container.querySelectorAll<HTMLElement>('.markdown-body pre code')
  //   codeBlocks.forEach((block) => {
  //     if (!block.classList.contains('hljs')) {
  //       hljs.highlightElement(block)
  //     }
  //   })
  // }, [currentMessages, currentStream.isStreaming, sessionUuid])


  return (
    <div className={styles.container}>
      {/* 聊天对话框 */}
      <div className={styles.top}>
        <div className={styles.title}>{currentSessionTitle}</div>
        <div className={styles.chatConversation} ref={chatContainerRef} onScroll={onUserScroll}>
          {/* 历史消息 */}
          {currentMessages.map((message, index) => (
            <div
              key={message.id}
              className={message.role === 'user' ? styles.userQuestion : styles.aiReply}
            >
              {/* 流式结束后，在最后一条 AI 消息上保留搜索状态栏 */}
              {message.role === 'ai' && index === currentMessages.length - 1 && !currentStream.isStreaming && currentStream.sources && currentStream.sources.length > 0 && (
                <div className={styles.searchStatusBar}>
                  <div className={styles.searchStatusLeft}>
                    <SearchOutlined className={styles.searchIcon} />
                    <span className={styles.searchLabel}>搜索网页</span>
                    <span className={styles.searchDivider} />
                    <span className={styles.searchQuery}>{currentStream.sources.map(s => s.title).join(' ')}</span>
                  </div>
                  <div className={styles.searchStatusRight}>
                    {currentStream.sources.length} 个结果
                  </div>
                </div>
              )}
              {message.role === 'user'
                ? message.content
                : (
                  <div className={styles.markdownContent}>
                    <Viewer
                      value={normalizeMarkdownText(message.content)}
                      plugins={markdownPluginsNoHighlight}
                    />
                  </div>
                )
              }
            </div>
          ))}
          {/* 正在流式生成的 AI 消息 */}
          {currentStream.isStreaming && (
            <div className={styles.aiReply}>
              {/* 搜索状态栏 */}
              {currentStream.isSearching && (
                <div className={styles.searchStatusBar}>
                  <div className={styles.searchStatusLeft}>
                    <SearchOutlined className={styles.searchIcon} />
                    <span className={styles.searchLabel}>搜索网页</span>
                    <span className={styles.searchDivider} />
                    <span className={styles.searchQuery}>
                      {currentStream.sources && currentStream.sources.length > 0
                        ? currentStream.sources.map(s => s.title).join(' ')
                        : currentStream.searchQuery
                      }
                    </span>
                  </div>
                  {currentStream.sources && currentStream.sources.length > 0 && (
                    <div className={styles.searchStatusRight}>
                      {currentStream.sources.length} 个结果
                    </div>
                  )}
                </div>
              )}
              {currentStream.content ? (
                <div className={styles.streamingContent}>
                  <div className={styles.markdownContent}>
                    <Viewer
                      value={normalizeMarkdownText(currentStream.content)}
                      plugins={markdownPluginsNoHighlight}
                    />
                  </div>
                </div>
              ) : (
                <div className={styles.cursorBlock}>
                  <span className={styles.cursorInline}>▋</span>
                </div>
              )}
            </div>
          )}
          <div ref={endRef} className={styles.scrollSentinel} aria-hidden="true" />
        </div>
        {showJumpToBottom && currentStream.isStreaming && (
          <div onClick={scrollToBottomAndLock} style={{ position: 'fixed', bottom: '162px' }}>
            <ScrollDownButton />
          </div>
        )}
      </div>
      <div className={styles.bottom}>
        {/* ai 聊天输入框 */}
        <div className={styles.chatBoxId} onClick={() => textareaRef.current?.focus()}>
          {/* 输入框 */}
          <textarea
            ref={textareaRef}
            value={searchValue}
            onKeyDown={keydownQuestion}
            onChange={handleInputChange}
            className={styles.chatInput}
            placeholder="给 ai小助手 发送消息"
            disabled={currentStream.isStreaming} // 生成中时禁用输入
          />
          {/* 按钮 */}
          <div className={styles.chatSubmit}>
            <div onClick={handleThinking} className={`${styles.chatThinking} ${mode ? styles.active : ''}`}>
              <BulbOutlined /> 深度思考
            </div>

            <div className={styles.llmMode}>
              <Space>
                {getStore('aiName') || '未配置'}
              </Space>
            </div>
            <div onClick={currentStream.isStreaming ? handleStopGeneration : clickQuestion}>
              <div className={`${styles.submitImg} ${isInputEmpty ? styles.inputActive : ''} ${currentStream.isStreaming ? styles.stopActive : ''} `}>
                {currentStream.isStreaming ? <XFilled /> : <ArrowUpOutlined />}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ fontSize: '12px', fontWeight: '300', textAlign: 'center', marginTop: '5px' }}>内容由 AI 生成，请仔细甄别</div>
    </div>

  )
}

export default ChatId

