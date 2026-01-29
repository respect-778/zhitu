import { ArrowUpOutlined, BulbOutlined } from "@ant-design/icons"
import styles from './index.module.less'
import { useEffect, useRef, useState } from "react"
import { addChatMessageAPI, callChatAPI, getChatMessageAPI } from "@/api/chat"
import type { IChatMessage, IChatSession } from "@/types/chat"
import { useOutletContext, useParams } from "react-router"


const ChatId = () => {
  const [mode, setmode] = useState(0) // 是否选中思考模型，默认 0 为不选择
  const inputRef = useRef<HTMLInputElement>(null) // 输入框 dom 实例
  const [searchValue, setSearchValue] = useState('') // 输入框内容
  const [isInputEmpty, setIsInputEmpty] = useState(true) // 输入框是否为空，默认为空
  const { id } = useParams() // 获取动态路由 id
  const [messages, setMessages] = useState<IChatMessage[]>([]) // 聊天消息列表
  const { historySession } = useOutletContext<{ // 获取到 父组件 中的历史记录数据
    historySession: IChatSession[]
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

  // 获取当前 会话id 对应的聊天记录
  const getCurrentChatMessage = async () => {
    try {
      const res = await getChatMessageAPI(parseInt(id!))
      setMessages(res.data)
    } catch (error) {
      console.error('获取聊天记录失败:', error)
    }
  }

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

    // 2. 调用 ai 大模型
    let aiMessage = ''
    try {
      const res = await callChatAPI(mode, userMessage) // 调用 ai
      aiMessage = res.data // ai 的回复
    } catch (error) {
      console.log(error)
    }

    // 3. 创建 ai 聊天记录
    try {
      await addChatMessageAPI({ session_id: parseInt(id!), role: 'ai', content: aiMessage }) // 创建 ai 聊天记录
      getCurrentChatMessage() // 获取最新消息列表
    } catch (error) {
      console.log(error)
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
  }, [id])


  return (
    <div className={styles.container}>
      {/* 聊天对话框 */}
      <div className={styles.top}>
        <div className={styles.title}>{historySession.find(item => item.id === parseInt(id!))?.session_title}</div>
        <div className={styles.chatConversation}>
          {messages.map((message) => (
            <div
              key={message.id}
              className={message.role === 'user' ? styles.userQuestion : styles.aiReply}
            >
              {message.content}
            </div>
          ))}
        </div>
      </div>
      <div className={styles.bottom}>
        {/* ai 聊天输入框 */}
        <div className={styles.chatBox} onClick={() => inputRef.current?.focus()}>
          {/* 输入框 */}
          <input ref={inputRef} value={searchValue} onKeyDown={keydownQuestion} onChange={handleInputChange} className={styles.chatInput} type="text" placeholder="给 ai小助手 发送消息" />
          {/* 按钮 */}
          <div className={styles.chatSubmit}>
            <div onClick={handleThinking} className={`${styles.chatThinking} ${mode ? styles.active : ''}`}><BulbOutlined /> 深度思考</div>
            <div onClick={clickQuestion}><div className={`${styles.submitImg} ${isInputEmpty ? styles.inputActive : ''} `}><ArrowUpOutlined /></div></div>
          </div>
        </div>
      </div>
      <div style={{ fontSize: '12px', fontWeight: '300', textAlign: 'center', marginTop: '5px' }}>内容由 AI 生成，请仔细甄别</div>
    </div>

  )
}

export default ChatId