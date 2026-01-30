import { ArrowUpOutlined, BulbOutlined, LoadingOutlined } from "@ant-design/icons"
import styles from './index.module.less'
import { useEffect, useRef, useState } from "react"
import { addChatMessageAPI, callChatStreamAPI, getChatMessageAPI } from "@/api/chat"
import type { IChatMessage, IChatSession } from "@/types/chat"
import { useOutletContext, useParams } from "react-router"


const ChatId = () => {
  const [mode, setmode] = useState(0) // 是否选中思考模型，默认 0 为不选择
  const inputRef = useRef<HTMLInputElement>(null) // 输入框 dom 实例
  const [searchValue, setSearchValue] = useState('') // 输入框内容
  const [isInputEmpty, setIsInputEmpty] = useState(true) // 输入框是否为空，默认为空
  const [isStreaming, setIsStreaming] = useState(false) // 是否正在流式生成中
  const [streamingContent, setStreamingContent] = useState('') // 正在流式生成的 AI 内容
  const { id } = useParams() // 获取动态路由 id
  const [messages, setMessages] = useState<IChatMessage[]>([]) // 聊天消息列表
  const chatContainerRef = useRef<HTMLDivElement>(null) // 聊天容器 ref，用于自动滚动
  const { historySession, getNewMessage } = useOutletContext<{ // 获取到 父组件 中的历史记录数据
    historySession: IChatSession[], // 从父组件那，拿到历史会话记录栏数据，这里用来显示 会话记录 title 在对话记录上面
    getNewMessage: boolean // 当父组件传递过来的这个 prop 发生了改变，就调用子组件的 getCurrentChatMessage 方法
  }>()

  // 深度思考模式
  const handleThinking = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    setmode(mode === 0 ? 1 : 0)
  }

  // 获取当前输入框最新值 并 监听输入框是否为空
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value)
    if (e.target.value.trim() !== '') {
      setIsInputEmpty(false) // 输入框不为空
    } else {
      setIsInputEmpty(true) // 输入框为空
    }
  }

  // useImperativeHandle()

  // 获取当前 会话id 对应的聊天记录
  const getCurrentChatMessage = async () => {
    try {
      const res = await getChatMessageAPI(parseInt(id!))
      setMessages(res.data)
    } catch (error) {
      console.error('获取聊天记录失败:', error)
    }
  }

  // 自动滚动到底部
  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }

  // 监听消息变化和流式内容变化，自动滚动
  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingContent])

  // handleSubmit 统一提交问题逻辑 （子路由里 不需要 创建聊天会话）
  const handleSubmit = async () => {
    // 输入框为空，直接返回
    if (searchValue.trim() === '') return
    // 输入框不为空时处理
    const userMessage = searchValue // user 的提问

    // 1. 创建 user 聊天记录
    try {
      await addChatMessageAPI({ session_id: parseInt(id!), role: 'user', content: userMessage }) // 创建 用户 聊天记录
      getCurrentChatMessage() // 获取最新消息列表
    } catch (error) {
      console.log(error)
    }

    setSearchValue('') // 提交后，清空输入框
    setIsInputEmpty(true) // 输入框为空

    // 2. 流式调用 ai 大模型
    setIsStreaming(true) // 开始流式生成
    setStreamingContent('') // 清空之前的流式内容

    try {
      await callChatStreamAPI(
        mode,
        userMessage,
        parseInt(id!),
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
      setIsStreaming(false) // 流式生成结束
      setStreamingContent('') // 清空流式内容
      getCurrentChatMessage() // 刷新消息列表（后端已保存 AI 回复）
    }
  }

  // 点击按钮 -> 提交问题
  const clickQuestion = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    handleSubmit() // 提交
  }

  // 回车 -> 提交问题
  const keydownQuestion = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { // 回车按键
      handleSubmit() // 提交
    }
  }

  // 当 动态路由 id 发生改变，就调用方法，获取当前 会话id 下的聊天记录
  useEffect(() => {
    getCurrentChatMessage() // 获取到当前 会话id 的数据，显示在界面中
  }, [id, getNewMessage])


  return (
    <div className={styles.container}>
      {/* 聊天对话框 */}
      <div className={styles.top}>
        <div className={styles.title}>{historySession.find(item => item.id === parseInt(id!))?.session_title}</div>
        <div className={styles.chatConversation} ref={chatContainerRef}>
          {/* 历史消息 */}
          {messages.map((message) => (
            <div
              key={message.id}
              className={message.role === 'user' ? styles.userQuestion : styles.aiReply}
            >
              {message.content}
            </div>
          ))}
          {/* 正在流式生成的 AI 消息 */}
          {isStreaming && (
            <div className={styles.aiReply}>
              <div className={styles.streamingContent}>
                {streamingContent}
                <span className={styles.cursor}>▋</span>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className={styles.bottom}>
        {/* ai 聊天输入框 */}
        <div className={styles.chatBox} onClick={() => inputRef.current?.focus()}>
          {/* 输入框 */}
          <input
            ref={inputRef}
            value={searchValue}
            onKeyDown={keydownQuestion}
            onChange={handleInputChange}
            className={styles.chatInput}
            type="text"
            placeholder="给 ai小助手 发送消息"
            disabled={isStreaming} // 生成中时禁用输入
          />
          {/* 按钮 */}
          <div className={styles.chatSubmit}>
            <div onClick={handleThinking} className={`${styles.chatThinking} ${mode ? styles.active : ''}`}>
              <BulbOutlined /> 深度思考
            </div>
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
