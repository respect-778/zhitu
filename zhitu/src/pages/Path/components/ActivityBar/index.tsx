import type React from 'react'
import {
  UserOutlined,
  ShareAltOutlined,
} from '@ant-design/icons'
import styles from './index.module.less'

interface Props {
  onShowMentor: () => void
  onShowGraph: () => void
}

const ActivityBar: React.FC<Props> = ({ onShowMentor, onShowGraph }) => (
  <div className={styles.activityBar} data-testid="path-activity-bar">
    <div className={styles.topIcons}>
      <button type="button" className={styles.iconBtn} onClick={onShowMentor} title="导师" aria-label="导师">
        <UserOutlined />
      </button>
      <button type="button" className={styles.iconBtn} onClick={onShowGraph} title="知识图谱" aria-label="知识图谱">
        <ShareAltOutlined />
      </button>
    </div>
  </div>
)

export default ActivityBar
