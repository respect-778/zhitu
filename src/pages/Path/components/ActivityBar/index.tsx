import type React from 'react'
import {
  FileOutlined,
  SearchOutlined,
  AimOutlined,
  UserOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ShareAltOutlined,
} from '@ant-design/icons'
import type { SidebarPanel } from '@/types/path'
import styles from './index.module.less'


interface Props {
  activePanel: SidebarPanel
  isClose: boolean
  showingGraph: boolean
  onPanelChange: (panel: SidebarPanel) => void
  onToggleSidebar: () => void
  onShowGraph: () => void
}

const ActivityBar: React.FC<Props> = ({ activePanel, isClose, showingGraph, onPanelChange, onToggleSidebar, onShowGraph }) => {
  const panels: { key: SidebarPanel; icon: React.ReactNode; title: string }[] = [
    { key: 'close', icon: isClose ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />, title: isClose ? '展开侧栏' : '收起侧栏' },
    { key: 'files', icon: <FileOutlined />, title: '文件浏览器' },
    { key: 'search', icon: <SearchOutlined />, title: '搜索' },
    { key: 'plan', icon: <AimOutlined />, title: '我的计划' },
    { key: 'mentor', icon: <UserOutlined />, title: '导师' },
  ]

  return (
    <div className={styles.activityBar}>
      <div className={styles.topIcons}>
        {panels.map(p => (
          <button
            key={p.key}
            className={`${styles.iconBtn} ${activePanel === p.key ? styles.active : ''}`}
            onClick={p.key === 'close' ? onToggleSidebar : () => onPanelChange(p.key)}
            title={p.title}
          >
            {p.icon}
          </button>
        ))}
        <button
          className={`${styles.iconBtn} ${showingGraph ? styles.active : ''}`}
          onClick={onShowGraph}
          title="关系图谱"
        >
          <ShareAltOutlined />
        </button>
      </div>
      <div className={styles.bottomIcons}>
        <button className={styles.iconBtn} title="设置">
          <SettingOutlined />
        </button>
      </div>
    </div>
  )
}

export default ActivityBar
