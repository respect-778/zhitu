import type React from "react";
import styles from "./index.module.less"
import { BulbOutlined, OpenAIOutlined, PlusCircleOutlined } from "@ant-design/icons";
import { useRef, useState } from "react";

const Chat: React.FC = () => {
  const today = [
    { id: 1, user: 'JavaScript 回车事件监听方法' }
  ]

  const yesterday = [
    { id: 1, user: 'React 列表渲染缺少 key 属性错误' }
  ]

  const sevendays = [
    { id: 1, user: 'AI向量与向量数据库详解' }
  ]

  const thirtydays = [
    { id: 1, user: 'React图片路径显示问题解决方案' }
  ]

  const [isthinking, setIsThinking] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)



  return (
    <div className={styles.container}>
      <div className={styles.left}>
        {/* 开启新对话 */}
        <div className={styles.newChat}>
          <div><PlusCircleOutlined /></div>
          <div>开启新对话</div>
        </div>
        {/* 历史记录 */}
        <div className={styles.historyChat}>
          <div className={styles.historyList}>
            <div className={styles.historyTitle}>今天</div>
            <div className={styles.historyCard}>
              {today.map(item => {
                return (
                  <div key={item.id} className={styles.historyItem}>{item.user}</div>
                )
              })
              }
            </div>
          </div>
          <div className={styles.historyList}>
            <div className={styles.historyTitle}>昨天</div>
            <div className={styles.historyCard}>
              {yesterday.map(item => {
                return (
                  <div key={item.id} className={styles.historyItem}>{item.user}</div>
                )
              })
              }
            </div>
          </div>
          <div className={styles.historyList}>
            <div className={styles.historyTitle}>7天内</div>
            <div className={styles.historyCard}>
              {sevendays.map(item => {
                return (
                  <div key={item.id} className={styles.historyItem}>{item.user}</div>
                )
              })
              }
            </div>
          </div>
          <div className={styles.historyList}>
            <div className={styles.historyTitle}>30天内</div>
            <div className={styles.historyCard}>
              {thirtydays.map(item => {
                return (
                  <div key={item.id} className={styles.historyItem}>{item.user}</div>
                )
              })
              }
            </div>
          </div>
        </div>
      </div>
      <div className={styles.right}>
        {/* ai 先导语 */}
        <div className={styles.introductory} style={{ display: 'flex', gap: '10px' }}>
          <div><OpenAIOutlined /></div>
          <div>今天有什么可以帮到你？</div>
        </div>
        {/* ai 聊天输入框 */}
        <div className={styles.chatBox} onClick={() => inputRef.current?.focus()}>
          {/* 输入框 */}
          <input ref={inputRef} className={styles.chatInput} type="text" placeholder="给 ai小助手 发送消息" />
          {/* 按钮 */}
          <div className={styles.chatSubmit}>
            <div onClick={(e) => {
              e.stopPropagation()
              setIsThinking(!isthinking)
            }} className={`${styles.chatThinking} ${isthinking ? styles.active : ''}`}><BulbOutlined /> 深度思考</div>
            <div onClick={(e) => {
              e.stopPropagation()
              // 提交逻辑
            }}><img className={styles.submitImg} src="/imgs/submit.png" draggable="false" alt="" /></div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Chat