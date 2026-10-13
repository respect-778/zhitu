import type React from 'react'
import { useLayoutEffect, useRef } from 'react'
import { Dropdown } from 'antd'
import { PlusOutlined, CloseOutlined, ShareAltOutlined, DownOutlined } from '@ant-design/icons'
import type { VFile } from '@/types/path'
import styles from './index.module.less'

const DEFAULT_TAB_WIDTH = 200
const TAB_ACTIONS_WIDTH = 64

interface Props {
  tabs: VFile[]
  activeTabId: string | null
  showGraph: boolean
  graphActive: boolean
  restoring: boolean
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onCloseGraph: () => void
  onCloseAll: () => void
  onSelectGraph: () => void
  onNew: () => void
}

const TabBar: React.FC<Props> = ({ tabs, activeTabId, showGraph, graphActive, restoring, onSelect, onClose, onCloseGraph, onCloseAll, onSelectGraph, onNew }) => {
  const barRef = useRef<HTMLDivElement>(null)
  const knownTabsRef = useRef(new Set<Element>())
  const tabCount = tabs.length + Number(showGraph)

  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return
    if (restoring) delete bar.dataset.motion
    const fitTabs = () => {
      const available = Math.max(0, bar.clientWidth - TAB_ACTIONS_WIDTH)
      const width = tabCount ? Math.min(DEFAULT_TAB_WIDTH, available / tabCount) : 0
      bar.style.setProperty('--path-tab-width', `${width}px`)
      bar.style.setProperty('--path-tab-count', `${tabCount}`)
    }
    fitTabs()
    const tabElements = [...bar.querySelectorAll('[role="tab"]')]
    if (bar.dataset.motion === 'ready') {
      for (const tab of tabElements) {
        if (!knownTabsRef.current.has(tab)) tab.setAttribute('data-entering', 'true')
      }
    }
    knownTabsRef.current = new Set(tabElements)
    if (!restoring && bar.dataset.motion !== 'ready') {
      // Commit restored widths before enabling transitions; existing tabs never enter again.
      bar.getBoundingClientRect()
      bar.dataset.motion = 'ready'
    }
    const observer = new ResizeObserver(fitTabs)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [tabCount, restoring])

  return (
    <div ref={barRef} className={styles.tabBar} data-testid="path-tabs">
      <div className={styles.tabs} role="tablist" aria-label="打开的文件">
        {tabs.map(tab => (
          <div
            key={tab.id}
            role="tab"
            aria-label={tab.name}
            aria-selected={!graphActive && tab.id === activeTabId}
            title={tab.name}
            className={`${styles.tab} ${!graphActive && tab.id === activeTabId ? styles.active : ''}`}
            onClick={() => onSelect(tab.id)}
          >
            <div className={styles.tabLabel}>
              <span className={styles.tabName}>{tab.name}</span>
            </div>
            <button aria-label={`关闭 ${tab.name}`} className={styles.tabClose} onClick={e => { e.stopPropagation(); onClose(tab.id) }}>
              <CloseOutlined />
            </button>
          </div>
        ))}
        {showGraph && (
          <div data-testid="graph-tab" role="tab" aria-label="知识图谱" aria-selected={graphActive} title="知识图谱" className={`${styles.tab} ${graphActive ? styles.active : ''}`} onClick={onSelectGraph}>
            <div className={styles.tabLabel}>
              <ShareAltOutlined className={styles.graphIcon} />
              <span className={styles.tabName}>知识图谱</span>
            </div>
            <button aria-label="关闭 知识图谱" className={styles.tabClose} onClick={e => { e.stopPropagation(); onCloseGraph() }}>
              <CloseOutlined />
            </button>
          </div>
        )}
      </div>
      <button className={styles.tabAction} onClick={onNew} title="新建标签页" aria-label="新建标签页">
        <PlusOutlined />
      </button>
      <Dropdown
        trigger={['click']}
        placement="bottomRight"
        menu={{
          items: [{ key: 'close-all', label: '全部关闭', icon: <CloseOutlined />, disabled: tabCount === 0 }],
          onClick: onCloseAll,
        }}
      >
        <button className={`${styles.tabAction} ${styles.tabMenu}`} title="标签页操作" aria-label="标签页操作" aria-haspopup="menu">
          <DownOutlined />
        </button>
      </Dropdown>
    </div>
  )
}

export default TabBar
