import type React from 'react'
import type { Experience, GlobalSettings } from '@/types/resume'
import SectionTitle from './SectionTitle'
import MarkdownContent from '../shared/MarkdownContent'

interface Props { experiences: Experience[]; globalSettings?: GlobalSettings; sectionTitle?: string }

const ExperienceSection: React.FC<Props> = ({ experiences, globalSettings, sectionTitle = '工作经历' }) => {
  const visible = experiences.filter(e => e.visible !== false)
  if (!visible.length) return null
  const g = globalSettings
  return (
    <div style={{ marginTop: g?.sectionSpacing || 20 }}>
      <SectionTitle title={sectionTitle} globalSettings={g} />
      {visible.map(exp => (
        <div key={exp.id} style={{ marginTop: g?.paragraphSpacing || 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontWeight: 700, fontSize: g?.subheaderSize || 15 }}>{exp.company}</span>
            <span style={{ fontSize: g?.baseFontSize || 13, color: '#888' }}>{exp.date}</span>
          </div>
          {exp.position && <div style={{ fontSize: g?.baseFontSize || 13, color: '#555', marginTop: 2 }}>{exp.position}</div>}
          {exp.details && (
            <div style={{ fontSize: g?.baseFontSize || 13, lineHeight: g?.lineHeight || 1.6, marginTop: 4, color: '#333' }}>
              <MarkdownContent content={exp.details} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default ExperienceSection
