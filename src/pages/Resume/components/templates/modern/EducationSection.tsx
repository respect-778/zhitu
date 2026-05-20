import type React from 'react'
import type { Education, GlobalSettings } from '@/types/resume'
import SectionTitle from './SectionTitle'

interface Props { education: Education[]; globalSettings?: GlobalSettings; sectionTitle?: string; sidebar?: boolean }

const EducationSection: React.FC<Props> = ({ education, globalSettings, sectionTitle = '教育背景', sidebar }) => {
  const visible = education.filter(e => e.visible !== false)
  if (!visible.length) return null
  const g = globalSettings
  const textColor = sidebar ? 'rgba(255,255,255,0.9)' : '#333'
  const mutedColor = sidebar ? 'rgba(255,255,255,0.6)' : '#888'
  return (
    <div style={{ marginTop: g?.sectionSpacing || 20 }}>
      <SectionTitle title={sectionTitle} globalSettings={g} sidebar={sidebar} />
      {visible.map(edu => (
        <div key={edu.id} style={{ marginTop: g?.paragraphSpacing || 6 }}>
          <div style={{ fontWeight: 700, fontSize: g?.subheaderSize || 14, color: textColor }}>{edu.school}</div>
          <div style={{ fontSize: g?.baseFontSize || 12, color: mutedColor, marginTop: 2 }}>
            {[edu.major, edu.degree].filter(Boolean).join(' · ')}
          </div>
          <div style={{ fontSize: g?.baseFontSize || 12, color: mutedColor, marginTop: 1 }}>
            {edu.startDate}{edu.endDate ? ` - ${edu.endDate}` : ''}
          </div>
          {edu.courses && (
            <div style={{ fontSize: g?.baseFontSize || 12, color: mutedColor, marginTop: 2 }}>
              主修课程：{edu.courses}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default EducationSection
