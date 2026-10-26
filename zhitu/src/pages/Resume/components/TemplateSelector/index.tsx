import type React from 'react'
import { Modal } from 'antd'
import styles from './index.module.less'

const TEMPLATES = [
  { id: 'minimalist', name: '极简', desc: '简洁清晰，适合技术岗' },
  { id: 'modern', name: '现代', desc: '时尚大方，适合设计岗' },
  { id: 'classic', name: '经典', desc: '传统稳重，适合传统行业' },
  { id: 'creative', name: '创意', desc: '个性突出，适合创意岗' },
  { id: 'elegant', name: '优雅', desc: '精致细腻，适合高端岗位' },
  { id: 'left-right', name: '左右分栏', desc: '信息密度高，适合经验丰富者' },
  { id: 'editorial', name: '编辑风', desc: '排版精美，适合媒体岗' },
  { id: 'timeline', name: '时间线', desc: '经历清晰，适合展示成长' },
]

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (templateId: string) => void
}

const TemplateSelector: React.FC<Props> = ({ open, onClose, onSelect }) => {
  return (
    <Modal
      title="选择简历模板"
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
    >
      <div className={styles.grid}>
        {TEMPLATES.map(t => (
          <div key={t.id} className={styles.card} onClick={() => onSelect(t.id)}>
            <div className={styles.preview}>
              <span className={styles.previewLabel}>{t.name}</span>
            </div>
            <div className={styles.info}>
              <div className={styles.name}>{t.name}</div>
              <div className={styles.desc}>{t.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

export default TemplateSelector
