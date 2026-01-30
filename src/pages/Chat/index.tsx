import type React from "react";
import styles from "./index.module.less"
import { ArrowUpOutlined, BulbOutlined, DeleteOutlined, EditOutlined, EllipsisOutlined, OpenAIOutlined, PlusCircleOutlined, ShareAltOutlined } from "@ant-design/icons";
import { useEffect, useRef, useState } from "react";
import { Outlet, useNavigate, useParams } from "react-router";
import { addChatMessageAPI, addChatSessionAPI, callChatStreamAPI, delChatSessionAPI, getHistorySessionAPI } from "@/api/chat";
import { useAppSelector } from "@/store/hooks";
import type { IChatSession } from "@/types/chat";
import type { MenuProps } from "antd";
import { isTimeInRange } from "@/utils/isTimeInRange";
import { Dropdown, Modal } from "antd";


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
  const [isModalOpen, setIsModalOpen] = useState(false); // 是否弹出多功能框
  const [getNewMessage, setGetNewMessage] = useState(false) // 控制子组件，调用获取全部聊天记录的接口


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

  // 重命名
  const handleResetName = (e: any) => {
    e.domEvent.stopPropagation()
  }

  // 分享
  const handleShare = (e: any) => {
    e.domEvent.stopPropagation()
  }

  // 打开删除弹窗
  const handleDel = (e: any) => {
    setIsModalOpen(true)
    e.domEvent.stopPropagation()
  }

  // 多功能弹窗按钮
  const multiDropdown: MenuProps['items'] = [
    {
      key: '0',
      onClick: handleResetName,
      label: (
        <div style={{ padding: '3px 2px' }}>
          <span style={{ paddingRight: '7px' }}><EditOutlined /></span>
          <span>重命名</span>
        </div>
      )
    },
    {
      key: '1',
      onClick: handleShare,
      label: (
        <div style={{ padding: '3px 2px' }}>
          <span style={{ paddingRight: '7px' }}><ShareAltOutlined /></span>
          <span>分享</span>
        </div>
      )
    },
    {
      key: '2',
      onClick: handleDel,
      label: (
        <div>
          <span style={{ paddingRight: '7px', color: '#ff4d4f' }}><DeleteOutlined /></span>
          <span style={{ color: '#ff4d4f' }}>删除</span>
        </div>
      )
    },
  ]

  // 删除会话记录 （进入界面 -> 没有调用方法）
  const delChatSession = async () => {
    await delChatSessionAPI(parseInt(id!))
    setIsModalOpen(false)
    navigate('/chat') // 删除后回到起始页去
    getHistoryChatSession() // 重新加载一次历史对话框
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

    // 2. 创建 user 聊天记录
    try {
      await addChatMessageAPI({ session_id: sessionId, role: 'user', content: userMessage }) // 创建 用户 聊天记录
    } catch (error) {
      console.log(error)
    }

    // 3. 先跳转到会话页面（让用户看到界面）
    navigate(`/chat/${sessionId}`)

    // 4. 流式调用 ai 大模型（在后台继续，结果会通过数据库更新到页面）
    try {
      await callChatStreamAPI(
        mode,
        userMessage,
        sessionId,
        () => { /* 流式回调，但页面已跳转，这里不需要处理 */ },
        async (error) => {
          console.error('AI 流式调用错误:', error)
          // 失败时创建一条错误消息
          await addChatMessageAPI({ session_id: sessionId, role: 'ai', content: '当前网络不稳定，请再试试看' })
        }
      )
    } catch (error) {
      console.error('AI 调用失败:', error)
    }

    setGetNewMessage(!getNewMessage) // 控制子组件去调用 getCurrentChatMessage 接口方法，刷新界面
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
                    if (isTimeInRange(item.updated_at!, day)) { // 给历史记录按照时间进行分类
                      return (
                        <div key={item.id} onClick={() => handleClickHistory(item.id!)} className={`${styles.historyItem} ${historyActive && historyActive == item.id ? styles.historyActive : ''}`}>
                          <div className={`${styles.historySessionTitle} ${historyActive && historyActive == item.id ? styles.historyActive : ''}`}>{item.session_title}</div>
                          <Dropdown menu={{ items: multiDropdown }} trigger={['click']}><div className={styles.historyBtn}><EllipsisOutlined /></div></Dropdown>
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
        <Outlet context={{ historySession, getNewMessage }} />
      }

      <Modal
        title="永久删除对话"
        closable={{ 'aria-label': '关闭对话框' }}
        open={isModalOpen}
        onOk={delChatSession}
        onCancel={() => setIsModalOpen(false)}
        okText={'删除'}
        cancelText={'取消'}
        width={'450px'}
        centered={true}
      >
        <p>删除后，该对话将不可恢复，由该对话生成的分享链接也将失效。确认删除吗？</p>
      </Modal>
    </div >
  )
}

export default Chat