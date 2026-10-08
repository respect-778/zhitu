import type React from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, Download } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { updateResumeTitle } from '@/store/modules/resumeStore'
import styles from './index.module.less'
import ResumeSaveStatus from '@/components/PersonalStorage/ResumeSaveStatus'

interface Props {
  onExport: () => void
  exporting?: boolean
}

const EditorHeader: React.FC<Props> = ({ onExport, exporting }) => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const activeResumeId = useAppSelector(s => s.resume.activeResumeId)
  const resume = useAppSelector(s => s.resume.resumes.find(r => r.id === activeResumeId))

  if (!resume) return null

  const handleTitleBlur = () => {
    const title = resume.title.trim() || '我的简历'
    if (title !== resume.title) dispatch(updateResumeTitle(title))
  }

  return (
    <div className={styles.header}>
      <div className={styles.left}>
        <button className={styles.backBtn} onClick={() => navigate('/resume')}>
          <ArrowLeft size={14} /> 返回
        </button>
        <input
          className={styles.titleInput}
          aria-label="简历名称"
          value={resume.title}
          onChange={e => dispatch(updateResumeTitle(e.target.value))}
          onBlur={handleTitleBlur}
          onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </div>
      <div className={styles.right}>
        <ResumeSaveStatus />
        <button className={styles.exportBtn} onClick={onExport} disabled={exporting}>
          <Download size={14} /> {exporting ? '导出中...' : '导出 PDF'}
        </button>
      </div>
    </div>
  )
}

export default EditorHeader
