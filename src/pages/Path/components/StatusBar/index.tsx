import type React from 'react'
import { UserOutlined, FileTextOutlined, EditOutlined } from '@ant-design/icons'
import styles from './index.module.less'

interface Props {
  mentorName?: string
  dayProgress?: string
  fileCount: number
  wordCount: number
}

/** 底部状态栏 — 左侧显示导师名称和进度，右侧显示笔记数和字数 */
const StatusBar: React.FC<Props> = ({ mentorName, dayProgress, fileCount, wordCount }) => {
  return (
    <div className={styles.statusBar}>
      <div className={styles.left}>
        {mentorName && (
          <span className={styles.item}>
            <UserOutlined className={styles.itemIcon} />
            {mentorName}
          </span>
        )}
        {dayProgress && (
          <span className={styles.item}>
            {dayProgress}
          </span>
        )}
      </div>
      <div className={styles.right}>
        <span className={styles.item}>
          <FileTextOutlined className={styles.itemIcon} />
          {fileCount} 篇笔记
        </span>
        <span className={styles.item}>
          <EditOutlined className={styles.itemIcon} />
          {wordCount} 字
        </span>
      </div>
    </div>
  )
}

export default StatusBar
