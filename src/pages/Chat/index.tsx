import type React from "react";
import styles from "./index.module.less"
import { ArrowUpOutlined, BulbOutlined, EllipsisOutlined, OpenAIOutlined, PlusCircleOutlined } from "@ant-design/icons";
import { useEffect, useRef, useState } from "react";
import { Outlet, useNavigate, useParams } from "react-router";
import { addChatMessageAPI, addChatSessionAPI, callChatAPI, delChatSessionAPI, getHistorySessionAPI } from "@/api/chat";
import { useAppSelector } from "@/store/hooks";
import type { IChatSession } from "@/types/chat";
import { isTimeInRange } from "@/utils/isTimeInRange";

type TimeRange = '今天' | '昨天' | '7天内' | '30天内';

const Chat: React.FC = () => {
  const days: TimeRange[] = ['今天', '昨天', '7天内', '30天内']
  const { id } = useParams() // 获取动态路由 id
  const navigate = useNavigate()
  const [mode, setMode] = useState(0) // 是否选中思考模型，默认 0 为不选择
  const inputRef = useRef<HTMLInputElement>(null) // 输入框 dom 实例
  const [searchValue, setSearchValue] = useState('') // 输入框内容
  const [historyActive, setHistoryActive] = useState(parseInt(id!)) // 是否点击了其中某个历史会话
  const [isInputEmpty, setIsInputEmpty] = useState(true) // 输入框是否为空，默认为空
  const [historySession, setHistorySession] = useState<IChatSession[]>([]) // 历史记录数据
  const userInfo = useAppSelector(state => state.user.userInfo) // 获取用户 id


  // 开启新对话 （进入界面 -> 没有调用方法）
  const handleNewChat = () => {
    setHistoryActive(0)
    navigate('/chat')
  }

  // 深度思考模式 （进入界面 -> 没有调用方法）
  const handleThinking = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    setMode(mode === 0 ? 1 : 0)
  }

  // 获取当前输入框最新值 并 监听输入框是否为空 （进入界面 -> 没有调用方法）
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value)
    if (e.target.value.trim() !== '') {
      setIsInputEmpty(false) // 输入框不为空
    } else {
      setIsInputEmpty(true) // 输入框为空
    }
  }

  // 点击任意历史会话记录 （进入界面 -> 没有调用方法）
  const handleClickHistory = (id: number) => {
    setHistoryActive(id) // 设置选中历史记录高亮
    navigate(`/chat/${id}`)
  }

  // 点击多功能按钮，弹出选项框 （进入界面 -> 没有调用方法）
  const handleMultifunctional = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation() // 阻止点击事件冒泡
  }

  // 删除会话记录 （进入界面 -> 没有调用方法）
  const delChatSession = async () => {
    // await delChatSessionAPI()
  }

  //  获取历史对话框中对应 会话 id 的聊天记录 （进入界面 -> 在 dom 渲染完成之后，就会调用一次）
  const getHistoryChatSession = async () => {
    const res = await getHistorySessionAPI()
    setHistorySession(res.data)
  }

  // handleSubmit 统一提交问题逻辑 （进入界面 -> 没有调用方法）
  const handleSubmit = async () => {
    // 输入框为空，直接返回
    if (searchValue.trim() === '') return
    // 输入框不为空时处理
    const userMessage = searchValue // user 的提问
    setSearchValue('') // 提交后，清空输入框
    setIsInputEmpty(true) // 输入框为空

    // 1. 创建聊天会话
    let sessionId = 0
    try {
      const user_id = parseInt(userInfo.data.id)
      const sessionRes = await addChatSessionAPI({ user_id, session_title: userMessage }) // 创建聊天会话
      sessionId = sessionRes.data.session_id
    } catch (error) {
      console.log(error)
      return // 如果聊天会话创建失败，就终止
    }

    // 2. 调用 ai 大模型
    let aiMessage = ''
    try {
      const res = await callChatAPI(mode, userMessage) // 调用 ai
      aiMessage = res.data // ai 的回复
    } catch (error) {
      console.log(error)
    }

    // 3. 创建聊天记录
    try {
      await addChatMessageAPI({ session_id: sessionId, role: 'user', content: userMessage }) // 创建 用户 聊天记录
      await addChatMessageAPI({ session_id: sessionId, role: 'ai', content: aiMessage }) // 创建 ai 聊天记录
    } catch (error) {
      console.log(error)
    }

    // 跳转到对应会话id界面
    navigate(`/chat/${sessionId}`)
  }

  // 点击按钮 -> 提交问题 （进入界面 -> 没有调用方法）
  const clickQuestion = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    handleSubmit() // 提交
  }

  // 回车 -> 提交问题 （进入界面 -> 没有调用方法）
  const keydownQuestion = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { // 回车按键
      handleSubmit() // 提交
    }
  }

  // 在 dom 渲染完成之后或动态路由 id 发生变化的时候，会调用方法
  useEffect(() => {
    // 这里会有一个思考：为什么要依赖 id 呢，只在组件第一次渲染完之后调用一次 获取到历史记录不就好了吗？
    // 这里需要考虑的点是，当用户是创建一个新会话的情况下，当用户点击提交问题之后，会发现历史记录并不是最新的，这里就需要依赖 id，拿到最新的历史记录。
    getHistoryChatSession()
  }, [id])


  return (
    <div className={styles.container}>
      <div className={styles.left}>
        {/* 开启新对话 */}
        <div onClick={handleNewChat} className={styles.newChat}>
          <div><PlusCircleOutlined /></div>
          <div>开启新对话</div>
        </div>
        {/* 历史记录 */}
        <div className={styles.historyChat}>
          {days.map(day => {
            return (
              <div key={day} className={styles.historyList}>
                <div className={styles.historyTitle}>{day}</div>
                <div className={styles.historyCard}>
                  {historySession.map(item => {
                    if (isTimeInRange(item.created_at!, day)) { // 给历史记录按照时间进行分类
                      return (
                        <div key={item.id} onClick={() => handleClickHistory(item.id!)} className={`${styles.historyItem} ${historyActive && historyActive == item.id ? styles.historyActive : ''}`}>
                          <div className={`${styles.historySessionTitle} ${historyActive && historyActive == item.id ? styles.historyActive : ''}`}>{item.session_title}</div>
                          <div onClick={handleMultifunctional} className={styles.historyBtn}><EllipsisOutlined /></div>
                        </div>
                      )
                    }
                  })
                  }
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {id === undefined ?
        <div className={styles.right}>
          {/* ai 先导语 */}
          <div className={styles.introductory} style={{ display: 'flex', gap: '10px' }}>
            <div><OpenAIOutlined /></div>
            <div>今天有什么可以帮到你？</div>
          </div>
          {/* ai 聊天输入框 */}
          <div className={styles.chatBox} onClick={() => inputRef.current?.focus()}>
            {/* 输入框 */}
            <input ref={inputRef} value={searchValue} onKeyDown={keydownQuestion} onChange={handleInputChange} className={styles.chatInput} type="text" placeholder="给 ai小助手 发送消息" />
            {/* 按钮 */}
            <div className={styles.chatSubmit}>
              <div onClick={handleThinking} className={`${styles.chatThinking} ${mode === 1 ? styles.active : ''}`}><BulbOutlined /> 深度思考</div>
              <div onClick={clickQuestion}><div className={`${styles.submitImg} ${isInputEmpty ? styles.inputActive : ''} `}><ArrowUpOutlined /></div></div>
            </div>
          </div>
        </div>
        :
        /* 通过 context 属性传递数据 */
        <Outlet context={{ historySession }} />
      }
    </div >
  )
}

export default Chat