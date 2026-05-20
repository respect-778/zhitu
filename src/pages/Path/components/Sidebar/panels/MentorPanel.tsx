import type React from 'react'
import { useNavigate } from 'react-router'
import { UserOutlined, MessageOutlined, SwapOutlined } from '@ant-design/icons'
import { MENTORS } from '@/pages/Path/data/mentors'
import styles from './MentorPanel.module.less'

interface Props {
  mentorId: string | null
}

const MentorPanel: React.FC<Props> = ({ mentorId }) => {
  const navigate = useNavigate()
  const mentor = MENTORS.find(m => m.id === mentorId) ?? MENTORS[0]

  const mentalModels: Record<string, string[]> = {
    feynman: ['第一性原理', '费曼学习法', '简化思维', '类比推理'],
    naval: ['杠杆思维', '复利效应', '特定知识', '长期博弈'],
    'paul-graham': ['做不可扩展的事', '快速迭代', '保持简单', '独立思考'],
    zhangxuefeng: ['选择大于努力', '信息差认知', '路径规划', '风险评估'],
    'elon-musk': ['第一性原理', '10倍思维', '跨领域迁移', '快速失败'],
  }

  const models = mentalModels[mentor.id] ?? []

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <UserOutlined className={styles.headerIcon} />
        <span>我的导师</span>
      </div>

      <div className={styles.card}>
        <div className={styles.avatar}>
          <UserOutlined className={styles.avatarIcon} />
        </div>
        <div className={styles.name}>{mentor.nameZh}</div>
        <div className={styles.nameEn}>{mentor.name}</div>
        <div className={styles.tagline}>"{mentor.tagline}"</div>
        <div className={styles.category}>{mentor.category}</div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>思维模型</div>
        <div className={styles.modelList}>
          {models.map(model => (
            <div key={model} className={styles.modelTag}>{model}</div>
          ))}
        </div>
      </div>

      <div className={styles.actions}>
        <button className={styles.actionBtn} onClick={() => navigate('/chat')}>
          <MessageOutlined /> 去对话
        </button>
        <button className={styles.actionBtnSecondary}>
          <SwapOutlined /> 更换导师
        </button>
      </div>
    </div>
  )
}

export default MentorPanel
