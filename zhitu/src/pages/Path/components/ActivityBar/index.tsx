import type React from 'react'
import {
  UserOutlined,
  ShareAltOutlined,
  SafetyCertificateOutlined,
  FileUnknownOutlined,
} from '@ant-design/icons'
import type { SidebarPanel } from '@/types/path'
import styles from './index.module.less'

interface Props {
  onShowMentor: () => void
  onShowGraph: () => void
  onShowPermissions: () => void
  onShowMarkdownGuide: () => void
  activePanel: SidebarPanel
}

const ActivityBar: React.FC<Props> = ({ onShowMentor, onShowGraph, onShowPermissions, onShowMarkdownGuide, activePanel }) => (
  <div className={styles.activityBar} data-testid="path-activity-bar">
    <div className={styles.topIcons}>
      <button type="button" className={styles.iconBtn} onClick={onShowMentor} title="导师" aria-label="导师" aria-pressed={activePanel === 'mentor'}>
        <UserOutlined />
      </button>
      <button type="button" className={styles.iconBtn} onClick={onShowGraph} title="知识图谱" aria-label="知识图谱">
        <ShareAltOutlined />
      </button>
      <button type="button" className={styles.iconBtn} onClick={onShowPermissions} title="Agent 权限" aria-label="Agent 权限" aria-pressed={activePanel === 'permissions'}>
        <SafetyCertificateOutlined />
      </button>
      <button type="button" className={styles.iconBtn} onClick={onShowMarkdownGuide} title="Markdown 说明" aria-label="Markdown 说明" aria-pressed={activePanel === 'markdown-guide'}>
        <FileUnknownOutlined />
      </button>
    </div>
  </div>
)

export default ActivityBar
