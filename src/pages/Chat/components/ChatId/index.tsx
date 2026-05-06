import { ArrowUpOutlined, BulbOutlined, LoadingOutlined } from "@ant-design/icons"
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


const ChatId = () => {
  const { id } = useParams() // 获取动态路由
  const sessionId = parseInt(id!) // 获取当前会话id
  const navigate = useNavigate()
  const [mode, setmode] = useState(0) // 是否选中思考模型，默认 0 为不选择
  const [searchValue, setSearchValue] = useState('') // 输入框内容
  const { textareaRef } = useAutoResizeTextarea({ value: searchValue, minHeight: 44, maxHeight: 280 })
  const [isInputEmpty, setIsInputEmpty] = useState(true) // 输入框是否为空，默认为空
  const [messages, setMessages] = useState<IChatMessage[]>([]) // 聊天消息列表
  const { historySession, searchValueFa, isNewChat, handleNewChatComplete, getHistoryChatSession, streamBySession, setStreamBySession } = useOutletContext<{ // 从父组件中拿状态和方法 
    historySession: IChatSession[], // 从父组件那，拿到历史会话记录栏数据，这里用来显示 会话记录 title 在对话记录上面
    searchValueFa: string,
    isNewChat: boolean,
    handleNewChatComplete: () => void,
    getHistoryChatSession: () => void,
    streamBySession: Record<number, { isStreaming: boolean, content: string }>,
    setStreamBySession: React.Dispatch<React.SetStateAction<Record<number, { isStreaming: boolean, content: string }>>>
  }>()
  const currentStream = streamBySession[sessionId] ?? { isStreaming: false, content: '' } // 获取当前会话的流式字典信息
  const titleRef = useRef<HTMLDivElement>(null)
  const [isTitleOverflow, setIsTitleOverflow] = useState(false)
  const currentSessionTitle = historySession.find(item => item.id === sessionId)?.session_title ?? ''


  // ai回复时，自动跟随 ai 的 hook
  const {
    containerRef: chatContainerRef,
    endRef,
    showJumpToBottom,
    onUserScroll,
    scrollToBottomAndLock
  } = useStreamingAutoFollow({
    isStreaming: currentStream.isStreaming,
    depKey: `${messages.length}-${currentStream.content.length}`,
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

  // 获取当前 会话id 对应的聊天记录
  const getCurrentChatMessage = async () => {
    try {
      const res = await getChatMessageAPI(sessionId)
      setMessages(res.data)
    } catch (error) {
      navigate('/chat', { replace: true })
      console.error('获取聊天记录失败:', error)

    }
  }

  // handleSubmit 统一提交问题逻辑 （子路由里 不需要 创建聊天会话）（这里分 新对话 和 旧对话）
  const handleSubmit = async () => {
    if (isNewChat) {
      if (searchValueFa.trim() === '') return
    } else {
      // 输入框为空，直接返回
      if (searchValue.trim() === '') return
    }

    let userMessage = ''
    if (isNewChat) {
      userMessage = searchValueFa
    } else {
      userMessage = searchValue
    }

    const activeSessionId = sessionId

    // 新问题提交时，优先锁定到底部，确保马上跟随 AI 回复区域
    scrollToBottomAndLock()

    // 1. 创建 user 聊天记录
    try {
      await addChatMessageAPI({ session_id: activeSessionId, role: 'user', content: userMessage }) // 创建 用户 聊天记录
      getCurrentChatMessage() // 获取最新消息列表
      scrollToBottomAndLock()
    } catch (error) {
      console.log(error)
    }

    setSearchValue('') // 提交后，清空输入框

    // 开启流式生成并记录当前开启流式的会话id
    setStreamBySession(pre => ({ ...pre, [activeSessionId]: { isStreaming: true, content: '' } }))

    // 2. 流式调用 ai 大模型
    try {
      await callChatStreamAPI(
        mode,
        userMessage,
        activeSessionId,
        (content) => {
          // 每次收到新内容就更新
          setStreamBySession(pre => ({ ...pre, [activeSessionId]: { isStreaming: true, content } }))
        },
        (error) => {
          console.error('流式调用错误:', error)
        }
      )
    } catch (error) {
      await addChatMessageAPI({ session_id: activeSessionId, role: 'ai', content: `AI调用失败:${error}` })
      console.error('AI 调用失败:', error)
    } finally {
      handleNewChatComplete() // 通知父组件调用此函数 -> 设置当前聊天不是 新聊天
      getHistoryChatSession() // 通过父组件传递过来的方法 -> 获取最新历史记录
      getCurrentChatMessage() // 刷新消息列表（后端已保存 AI 回复）
      setIsInputEmpty(true)
      setStreamBySession(pre => ({ ...pre, [activeSessionId]: { isStreaming: false, content: '' } })) // 结束流式生成并清空当前流式内容。
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

  // 进入到界面滚动到底部
  useLayoutEffect(() => {
    // 这里需要考虑的是：在组件挂载完之后，ai聊天框这里还需要加载出聊天记录，所以如果不先让聊天记录加载出来
    // 那么滚动到底部的效果就是在聊天记录都没有出现的情况下就触发了，也就导致了后续聊天记录加载出来时，发现没有滚动到底部的效果。
    if (messages.length === 0) return
    scrollToBottomAndLock()
  }, [messages.length])

  // 当 动态路由 id 发生改变，就调用方法，获取当前 会话id 下的聊天记录
  useEffect(() => {
    getCurrentChatMessage() // 获取到当前 会话id 的数据，显示在界面中
  }, [sessionId])

  // 如果当前是新会话，才调用一次
  useEffect(() => {
    if (isNewChat) {
      handleSubmit()
    }
  }, [isNewChat])

  useLayoutEffect(() => {
    const el = titleRef.current
    if (!el) return
    setIsTitleOverflow(el.scrollWidth > el.clientWidth)
  }, [currentSessionTitle])

  useEffect(() => {
    const handleResize = () => {
      const el = titleRef.current
      if (!el) return
      setIsTitleOverflow(el.scrollWidth > el.clientWidth)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [currentSessionTitle])

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
  // }, [messages, currentStream.isStreaming, sessionId])


  return (
    <div className={styles.container}>
      {/* 聊天对话框 */}
      <div className={styles.top}>
        <div ref={titleRef} className={`${styles.title} ${isTitleOverflow ? styles.titleOverflow : ''}`}>{currentSessionTitle}</div>
        <div className={styles.chatConversation} ref={chatContainerRef} onScroll={onUserScroll}>
          {/* 历史消息 */}
          {messages.map((message) => (
            <div
              key={message.id}
              className={message.role === 'user' ? styles.userQuestion : styles.aiReply}
            >
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
              <div className={styles.streamingContent}>
                <div className={styles.markdownContent}>
                  {currentStream.content
                    ? (
                      <Viewer
                        value={normalizeMarkdownText(currentStream.content)}
                        plugins={markdownPluginsNoHighlight}
                      />
                    )
                    : (
                      <span className={styles.cursorInline}>▋</span>
                    )}
                </div>
              </div>
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
            <div onClick={clickQuestion}>
              <div className={`${styles.submitImg} ${isInputEmpty || currentStream.isStreaming ? styles.inputActive : ''} `}>
                {currentStream.isStreaming ? <LoadingOutlined /> : <ArrowUpOutlined />}
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

