import type React from 'react'
import type { Project, GlobalSettings } from '@/types/resume'
import SectionTitle from './SectionTitle'
import ProjectLink from '../ProjectLink'
import MarkdownContent from '../shared/MarkdownContent'

interface Props {
  projects: Project[]
  globalSettings?: GlobalSettings
  sectionTitle?: string
}

const ProjectSection: React.FC<Props> = ({ projects, globalSettings, sectionTitle = '项目经历' }) => {
  const visible = projects.filter(p => p.visible !== false)
  if (!visible.length) return null
  const g = globalSettings
  return (
    <div style={{ marginTop: g?.sectionSpacing || 20 }}>
      <SectionTitle title={sectionTitle} globalSettings={g} />
      {visible.map(proj => (
        <div key={proj.id} style={{ marginTop: g?.paragraphSpacing || 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontWeight: 700, fontSize: g?.subheaderSize || 15 }}>{proj.name}</span>
            <span style={{ fontSize: g?.baseFontSize || 13, color: '#888' }}>{proj.date}</span>
          </div>
          {proj.role && <div style={{ fontSize: g?.baseFontSize || 13, color: '#555', marginTop: 2 }}>{proj.role}</div>}
          <ProjectLink project={proj} globalSettings={g} />
          {proj.description && (
            <div style={{ fontSize: g?.baseFontSize || 13, lineHeight: g?.lineHeight || 1.6, marginTop: 4, color: '#333' }}>
              <MarkdownContent content={proj.description} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default ProjectSection
