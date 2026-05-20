import type React from 'react'
import type { Education, GlobalSettings } from '@/types/resume'
import SectionTitle from './SectionTitle'

interface Props { education: Education[]; globalSettings?: GlobalSettings; sectionTitle?: string }

const EducationSection: React.FC<Props> = ({ education, globalSettings, sectionTitle = '教育经历' }) => {
  const visible = education.filter(e => e.visible !== false)
  if (!visible.length) return null
  const g = globalSettings
  return (
    <div>
      <SectionTitle title={sectionTitle} globalSettings={g} />
      {visible.map(edu => (
        <div key={edu.id} style={{ marginTop: g?.paragraphSpacing || 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontWeight: 700, fontSize: (g?.headerSize || 15) + 'px' }}>{edu.school}</span>
            <span style={{ fontSize: (g?.baseFontSize || 13) + 'px', color: '#888' }}>{edu.startDate} - {edu.endDate}</span>
          </div>
          <div style={{ fontSize: (g?.baseFontSize || 13) + 'px', color: '#555', marginTop: 2 }}>
            {[edu.major, edu.degree].filter(Boolean).join(' · ')}
          </div>
          {edu.courses && (
            <div style={{ fontSize: (g?.baseFontSize || 13) + 'px', color: '#666', marginTop: 2 }}>
              主修课程：{edu.courses}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default EducationSection
