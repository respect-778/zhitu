import type React from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveSection, updateMenuSections } from '@/store/modules/resumeStore'
import type { MenuSection } from '@/types/resume'
import styles from './index.module.less'

const SECTION_ICONS: Record<string, string> = {
  basic: '👤', experience: '💼', education: '🎓',
  projects: '💻', skills: '⭐', selfEvaluation: '📝',
}

const SidePanel: React.FC = () => {
  const dispatch = useAppDispatch()
  const activeResumeId = useAppSelector(state => state.resume.activeResumeId)
  const activeSection = useAppSelector(state => state.resume.activeSection)
  const resume = useAppSelector(state => state.resume.resumes.find(r => r.id === activeResumeId))

  if (!resume) return null

  const sections = [...resume.menuSections].sort((a, b) => a.order - b.order)

  const toggleSection = (id: string) => {
    if (id === 'basic') return
    const updated = sections.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s)
    dispatch(updateMenuSections(updated))
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelTitle}>简历章节</div>
      {sections.map((section: MenuSection) => (
        <div
          key={section.id}
          className={`${styles.item} ${activeSection === section.id ? styles.active : ''} ${!section.enabled ? styles.disabled : ''}`}
          onClick={() => { if (section.enabled) dispatch(setActiveSection(section.id)) }}
        >
          <span className={styles.icon}>{SECTION_ICONS[section.id] || '📄'}</span>
          <span className={styles.label}>{section.title}</span>
          {section.id !== 'basic' && (
            <button
              className={styles.toggle}
              onClick={e => { e.stopPropagation(); toggleSection(section.id) }}
              title={section.enabled ? '隐藏' : '显示'}
            >
              {section.enabled ? '●' : '○'}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

export default SidePanel
