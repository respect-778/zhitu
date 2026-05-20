import type React from 'react'
import type { ResumeData } from '@/types/resume'
import BasicSection from './BasicSection'
import ExperienceSection from './ExperienceSection'
import EducationSection from './EducationSection'
import ProjectSection from './ProjectSection'
import SkillSection from './SkillSection'
import SelfEvaluationSection from './SelfEvaluationSection'

interface Props {
  data: ResumeData
  onSectionClick?: (id: string) => void
  activeSection?: string
}

const ACTIVE_BG = 'rgba(22, 119, 255, 0.06)'

const TimelineTemplate: React.FC<Props> = ({ data, onSectionClick, activeSection }) => {
  const { basic, education, experience, projects, skillContent, selfEvaluationContent, menuSections, globalSettings } = data
  const enabled = [...menuSections].filter(s => s.enabled).sort((a, b) => a.order - b.order)
  const title = (id: string) => menuSections.find(s => s.id === id)?.title
  const click = (id: string) => onSectionClick ? { onClick: () => onSectionClick(id), style: { cursor: 'pointer', borderRadius: 6, transition: 'background 0.2s', background: activeSection === id ? ACTIVE_BG : 'transparent' } } : {}
  const themeColor = globalSettings.themeColor || '#1677ff'

  const TimelineItem = ({ children }: { children: React.ReactNode }) => (
    <div style={{ position: 'relative', paddingLeft: 24, marginTop: globalSettings.sectionSpacing || 20 }}>
      <div style={{ position: 'absolute', left: 5, top: 10, bottom: 0, width: 2, backgroundColor: '#e5e7eb' }} />
      <div style={{ position: 'absolute', left: 0, top: 6, width: 12, height: 12, borderRadius: '50%', backgroundColor: themeColor }} />
      {children}
    </div>
  )

  const renderSection = (id: string) => {
    switch (id) {
      case 'basic':
        return <div key={id} {...click(id)}><BasicSection basic={basic} globalSettings={globalSettings} /></div>
      case 'experience':
        return <div key={id} {...click(id)}><TimelineItem><ExperienceSection experiences={experience} globalSettings={globalSettings} sectionTitle={title('experience')} /></TimelineItem></div>
      case 'education':
        return <div key={id} {...click(id)}><TimelineItem><EducationSection education={education} globalSettings={globalSettings} sectionTitle={title('education')} /></TimelineItem></div>
      case 'projects':
        return <div key={id} {...click(id)}><TimelineItem><ProjectSection projects={projects} globalSettings={globalSettings} sectionTitle={title('projects')} /></TimelineItem></div>
      case 'skills':
        return <div key={id} {...click(id)}><TimelineItem><SkillSection content={skillContent} globalSettings={globalSettings} sectionTitle={title('skills')} /></TimelineItem></div>
      case 'selfEvaluation':
        return <div key={id} {...click(id)}><TimelineItem><SelfEvaluationSection content={selfEvaluationContent} globalSettings={globalSettings} sectionTitle={title('selfEvaluation')} /></TimelineItem></div>
      default: return null
    }
  }

  return (
    <div style={{ paddingLeft: 6 }}>
      {enabled.map(s => renderSection(s.id))}
    </div>
  )
}

export default TimelineTemplate
