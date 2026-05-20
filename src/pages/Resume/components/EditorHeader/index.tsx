import type React from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, Download } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { updateResumeTitle } from '@/store/modules/resumeStore'
import styles from './index.module.less'

interface Props {
  onExport: () => void
  exporting?: boolean
}

const EditorHeader: React.FC<Props> = ({ onExport, exporting }) => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const activeResumeId = useAppSelector(s => s.resume.activeResumeId)
  const resume = useAppSelector(s => s.resume.resumes.find(r => r.id === activeResumeId))
  const [title, setTitle] = useState(resume?.title ?? '')

  if (!resume) return null

  const handleTitleBlur = () => {
    if (title.trim() && title !== resume.title) dispatch(updateResumeTitle(title.trim()))
  }

  return (
    <div className={styles.header}>
      <div className={styles.left}>
        <button className={styles.backBtn} onClick={() => navigate('/resume')}>
          <ArrowLeft size={14} /> 返回
        </button>
        <input
          className={styles.titleInput}
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </div>
      <div className={styles.right}>
        <button className={styles.exportBtn} onClick={onExport} disabled={exporting}>
          <Download size={14} /> {exporting ? '导出中...' : '导出 PDF'}
        </button>
      </div>
    </div>
  )
}

export default EditorHeader
