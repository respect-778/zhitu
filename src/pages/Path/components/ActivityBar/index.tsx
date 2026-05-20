import type React from 'react'
import {
  FileOutlined,
  SearchOutlined,
  AimOutlined,
  UserOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons'
import type { SidebarPanel } from '@/types/growth'
import styles from './index.module.less'


interface Props {
  activePanel: SidebarPanel      // 当前激活的侧栏面板
  isClose: boolean               // 侧栏是否已收起（控制图标方向）
  onPanelChange: (panel: SidebarPanel) => void  // 切换侧栏面板
  onToggleSidebar: () => void    // 展开/收起侧栏
}

/** 最左侧图标栏 — 顶部：侧栏开关 + 4个面板切换；底部：设置 */
const ActivityBar: React.FC<Props> = ({ activePanel, isClose, onPanelChange, onToggleSidebar }) => {
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
