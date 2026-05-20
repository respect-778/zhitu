import type React from 'react'
import { PlusOutlined, CloseOutlined } from '@ant-design/icons'
import type { VFile } from '@/types/growth'
import styles from './index.module.less'

interface Props {
  tabs: VFile[]
  activeTabId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
}

/** 标签栏 — 显示已打开的文件标签页，支持切换、关闭和新建 */
const TabBar: React.FC<Props> = ({ tabs, activeTabId, onSelect, onClose, onNew }) => {
  return (
    <div className={styles.tabBar}>
      <div className={styles.tabs}>
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`${styles.tab} ${tab.id === activeTabId ? styles.active : ''}`}
            onClick={() => onSelect(tab.id)}
          >
            <span className={styles.tabName}>{tab.name}</span>
            <button
              className={styles.tabClose}
              onClick={e => { e.stopPropagation(); onClose(tab.id) }}
            >
              <CloseOutlined />
            </button>
          </div>
        ))}
        <button className={styles.newTabBtn} onClick={onNew} title="新建标签页">
          <PlusOutlined />
        </button>
      </div>
    </div>
  )
}

export default TabBar
