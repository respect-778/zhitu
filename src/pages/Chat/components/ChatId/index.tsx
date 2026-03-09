import { ArrowUpOutlined, BulbOutlined, DownOutlined, LoadingOutlined, DownCircleOutlined } from "@ant-design/icons"
import styles from './index.module.less'
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { addChatMessageAPI, callChatStreamAPI, getChatMessageAPI } from "@/api/chat"
import type { IChatMessage, IChatSession } from "@/types/chat"
import { useOutletContext, useParams } from "react-router"
import { Dropdown, Space } from "antd"
import type { MenuProps } from "antd/lib"
import { Viewer } from "@bytemd/react"
import { markdownPlugins, normalizeMarkdownText } from "@/utils/markdown"
import { useStreamingAutoFollow } from "@/hooks/useStreamingAutoFollow"


const ChatId = () => {
  const { id } = useParams() // 获取动态路由
  const sessionId = parseInt(id!) // 获取当前会话id
  const [mode, setmode] = useState(0) // 是否选中思考模型，默认 0 为不选择
  const inputRef = useRef<HTMLTextAreaElement>(null) // 输入框 dom 实例
  const [searchValue, setSearchValue] = useState('') // 输入框内容
  const [isInputEmpty, setIsInputEmpty] = useState(true) // 输入框是否为空，默认为空
  const [isStreaming, setIsStreaming] = useState(false) // 是否正在流式生成中
  const [streamingContent, setStreamingContent] = useState('') // 正在流式生成的 AI 内容
  const [messages, setMessages] = useState<IChatMessage[]>([]) // 聊天消息列表
  const { historySession, searchValueFa, isNewChat, handleNewChatComplete, getHistoryChatSession } = useOutletContext<{ // 获取到 父组件 中的历史记录数据
    historySession: IChatSession[], // 从父组件那，拿到历史会话记录栏数据，这里用来显示 会话记录 title 在对话记录上面
    searchValueFa: string,
    isNewChat: boolean,
    handleNewChatComplete: () => void,
    getHistoryChatSession: () => void
  }>()
  const [llmItem, setLLMItem] = useState('glm-4.6')


  const items: MenuProps['items'] = [
    {
      key: '1',
      label: <div onClick={() => setLLMItem('glm-4.6')}>glm-4.6</div>
    },
    {
      key: '2',
      label: <div onClick={() => setLLMItem('deepseek-r1')}>deepseek-r1</div>
    },
  ]

  // ai回复时，自动跟随 ai 的 hook
  const {
    containerRef: chatContainerRef,
    endRef,
    showJumpToBottom,
    onUserScroll,
    scrollToBottomAndLock
  } = useStreamingAutoFollow({
    isStreaming,
    depKey: `${messages.length}-${streamingContent.length}`,
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

    // 新问题提交时，优先锁定到底部，确保马上跟随 AI 回复区域
    scrollToBottomAndLock()

    // 1. 创建 user 聊天记录
    try {
      await addChatMessageAPI({ session_id: sessionId, role: 'user', content: userMessage }) // 创建 用户 聊天记录
      await getCurrentChatMessage() // 获取最新消息列表
      scrollToBottomAndLock()
    } catch (error) {
      console.log(error)
    }

    setSearchValue('') // 提交后，清空输入框
    setIsInputEmpty(true) // 输入框为空

    // 2. 流式调用 ai 大模型
    setIsStreaming(true) // 开始流式生成

    try {
      await callChatStreamAPI(
        mode,
        userMessage,
        sessionId,
        (content) => {
          // 每次收到新内容就更新
          setStreamingContent(content)
        },
        (error) => {
          console.error('流式调用错误:', error)
        }
      )
    } catch (error) {
      console.error('AI 调用失败:', error)
      // 如果流式调用失败，显示错误信息
      setStreamingContent('当前网络不稳定，请再试试看')
    } finally {
      handleNewChatComplete() // 通知父组件调用此函数 -> 设置当前聊天为 不是新聊天
      getHistoryChatSession() // 通过父组件传递过来的方法 -> 获取最新历史记录
      await getCurrentChatMessage() // 刷新消息列表（后端已保存 AI 回复）
      setIsStreaming(false) // 流式生成结束
      setStreamingContent('') // 清空流式内容
      scrollToBottomAndLock() // 回复结束后停留在最新回复位置
    }
  }

  // 点击按钮 -> 提交问题
  const clickQuestion = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    handleSubmit() // 提交
  }

  // 回车 -> 提交问题
  const keydownQuestion = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') { // 回车按键
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


  return (
    <div className={styles.container}>
      {/* 聊天对话框 */}
      <div className={styles.top}>
        <div className={styles.title}>{historySession.find(item => item.id === sessionId)?.session_title}</div>
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
                      plugins={markdownPlugins}
                    />
                  </div>
                )}
            </div>
          ))}
          {/* 正在流式生成的 AI 消息 */}
          {isStreaming && (
            <div className={styles.aiReply}>
              <div className={styles.streamingContent}>
                <div className={styles.markdownContent}>
                  {streamingContent
                    ? (
                      <Viewer
                        value={normalizeMarkdownText(streamingContent)}
                        plugins={markdownPlugins}
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
        {showJumpToBottom && (
          <div className={styles.jumpToBottomBtn} onClick={scrollToBottomAndLock}>
            <DownCircleOutlined />
          </div>
        )}
      </div>
      <div className={styles.bottom}>
        {/* ai 聊天输入框 */}
        <div className={styles.chatBox} onClick={() => inputRef.current?.focus()}>
          {/* 输入框 */}
          <textarea
            ref={inputRef}
            value={searchValue}
            onKeyDown={keydownQuestion}
            onChange={handleInputChange}
            className={styles.chatInput}
            placeholder="给 ai小助手 发送消息"
            disabled={isStreaming} // 生成中时禁用输入
          />
          {/* 按钮 */}
          <div className={styles.chatSubmit}>
            <div onClick={handleThinking} className={`${styles.chatThinking} ${mode ? styles.active : ''}`}>
              <BulbOutlined /> 深度思考
            </div>

            <Dropdown menu={{ items }} trigger={['click']} placement="top">
              <div className={styles.llmMode}>
                <Space>
                  {llmItem}
                  <DownOutlined />
                </Space>
              </div>
            </Dropdown>
            <div onClick={clickQuestion}>
              <div className={`${styles.submitImg} ${isInputEmpty || isStreaming ? styles.inputActive : ''} `}>
                {isStreaming ? <LoadingOutlined /> : <ArrowUpOutlined />}
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

