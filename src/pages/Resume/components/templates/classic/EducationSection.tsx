import type React from 'react'
import type { Education, GlobalSettings } from '@/types/resume'
import SectionTitle from './SectionTitle'
import MarkdownContent from '../shared/MarkdownContent'

interface Props {
  education: Education[]
  globalSettings?: GlobalSettings
  sectionTitle?: string
}

const EducationSection: React.FC<Props> = ({ education, globalSettings, sectionTitle = '教育背景' }) => {
  const visible = education.filter(e => e.visible !== false)
  if (!visible.length) return null
  const g = globalSettings
  return (
    <div style={{ marginTop: g?.sectionSpacing || 20 }}>
      <SectionTitle title={sectionTitle} globalSettings={g} />
      {visible.map(edu => (
        <div key={edu.id} style={{ marginTop: g?.paragraphSpacing || 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontWeight: 700, fontSize: g?.subheaderSize || 15 }}>{edu.school}</span>
            <span style={{ fontSize: g?.baseFontSize || 13, color: '#888' }}>
              {edu.startDate}{edu.endDate ? ` - ${edu.endDate}` : ''}
            </span>
          </div>
          <div style={{ fontSize: g?.baseFontSize || 13, color: '#555', marginTop: 2 }}>
            {[edu.major, edu.degree, edu.gpa ? `GPA ${edu.gpa}` : ''].filter(Boolean).join(' · ')}
          </div>
          {edu.courses && (
            <div style={{ fontSize: g?.baseFontSize || 13, color: '#666', marginTop: 2 }}>
              主修课程：{edu.courses}
            </div>
          )}
          {edu.description && (
            <div style={{ fontSize: g?.baseFontSize || 13, lineHeight: g?.lineHeight || 1.6, marginTop: 4, color: '#333' }}>
              <MarkdownContent content={edu.description} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default EducationSection
