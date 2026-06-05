import type React from 'react'
import { PlusOutlined, CloseOutlined, ShareAltOutlined } from '@ant-design/icons'
import type { VFile } from '@/types/path'
import styles from './index.module.less'

interface Props {
  tabs: VFile[]
  activeTabId: string | null
  showGraph: boolean
  graphActive: boolean
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onCloseGraph: () => void
  onSelectGraph: () => void
  onNew: () => void
}

const TabBar: React.FC<Props> = ({ tabs, activeTabId, showGraph, graphActive, onSelect, onClose, onCloseGraph, onSelectGraph, onNew }) => {
  return (
    <div className={styles.tabBar}>
      <div className={styles.tabs}>
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`${styles.tab} ${!graphActive && tab.id === activeTabId ? styles.active : ''}`}
            onClick={() => onSelect(tab.id)}
          >
            <span className={styles.tabName}>{tab.name}</span>
            <button className={styles.tabClose} onClick={e => { e.stopPropagation(); onClose(tab.id) }}>
              <CloseOutlined />
            </button>
          </div>
        ))}
        {showGraph && (
          <div className={`${styles.tab} ${graphActive ? styles.active : ''}`} onClick={onSelectGraph}>
            <ShareAltOutlined style={{ fontSize: 11, marginRight: 5, flexShrink: 0 }} />
            <span className={styles.tabName}>关系图谱</span>
            <button className={styles.tabClose} onClick={e => { e.stopPropagation(); onCloseGraph() }}>
              <CloseOutlined />
            </button>
          </div>
        )}
        <button className={styles.newTabBtn} onClick={onNew} title="新建标签页">
          <PlusOutlined />
        </button>
      </div>
    </div>
  )
}

export default TabBar
