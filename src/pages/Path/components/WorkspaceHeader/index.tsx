import type React from 'react'
import { FileOutlined, MenuFoldOutlined, MenuUnfoldOutlined, SearchOutlined } from '@ant-design/icons'
import type { SidebarPanel } from '@/types/path'
import styles from './index.module.less'

interface Props {
  activePanel: SidebarPanel
  sidebarVisible: boolean
  onPanelChange: (panel: 'files' | 'search') => void
  onToggleSidebar: () => void
}

const WorkspaceHeader: React.FC<Props> = ({ activePanel, sidebarVisible, onPanelChange, onToggleSidebar }) => (
  <div className={styles.header} data-testid="path-top-navigation">
    <button
      type="button"
      className={styles.iconButton}
      onClick={onToggleSidebar}
      title={sidebarVisible ? '收起侧栏' : '展开侧栏'}
      aria-label={sidebarVisible ? '收起侧栏' : '展开侧栏'}
    >
      {sidebarVisible ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
    </button>
    <div className={styles.navigation}>
      <button
        type="button"
        className={`${styles.iconButton} ${activePanel === 'files' ? styles.active : ''}`}
        onClick={() => onPanelChange('files')}
        title="文件列表"
        aria-label="文件列表"
        aria-pressed={activePanel === 'files'}
      >
        <FileOutlined />
      </button>
      <button
        type="button"
        className={`${styles.iconButton} ${activePanel === 'search' ? styles.active : ''}`}
        onClick={() => onPanelChange('search')}
        title="搜索"
        aria-label="搜索"
        aria-pressed={activePanel === 'search'}
      >
        <SearchOutlined />
      </button>
    </div>
  </div>
)

export default WorkspaceHeader
