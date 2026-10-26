import type React from 'react'
import type { ResumeData } from '@/types/resume'
import { getTemplateComponent } from '../templates'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveSection } from '@/store/modules/resumeStore'
import styles from './index.module.less'

interface Props {
  resume: ResumeData
  previewRef?: React.RefObject<HTMLDivElement | null>
}

const PreviewPanel: React.FC<Props> = ({ resume, previewRef }) => {
  const dispatch = useAppDispatch()
  const activeSection = useAppSelector(s => s.resume.activeSection)
  const { globalSettings } = resume
  const pagePadding = globalSettings.pagePadding || 40
  const Template = getTemplateComponent(resume.templateId)

  return (
    <div className={styles.wrapper}>
      <div
        ref={previewRef}
        className={styles.page}
        style={{ padding: pagePadding + 'px', fontFamily: globalSettings.fontFamily || 'PingFang SC, Noto Sans SC, sans-serif' }}
      >
        <Template
          data={resume}
          onSectionClick={id => dispatch(setActiveSection(id))}
          activeSection={activeSection}
        />
      </div>
    </div>
  )
}

export default PreviewPanel
