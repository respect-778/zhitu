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
  onSectionClick?: (sectionId: string) => void
  activeSection?: string
}

const ACTIVE_BG = 'rgba(22, 119, 255, 0.06)'

const MinimalistTemplate: React.FC<Props> = ({ data, onSectionClick, activeSection }) => {
  const { basic, education, experience, projects, skillContent, selfEvaluationContent, menuSections, globalSettings } = data
  const enabled = [...menuSections].filter(s => s.enabled).sort((a, b) => a.order - b.order)

  const sectionTitle = (id: string) => menuSections.find(s => s.id === id)?.title

  const renderSection = (id: string) => {
    const isActive = activeSection === id
    const clickProps = onSectionClick ? { onClick: () => onSectionClick(id), style: { cursor: 'pointer', borderRadius: 6, transition: 'background 0.2s', background: isActive ? ACTIVE_BG : 'transparent' } } : {}
    switch (id) {
      case 'basic': return <div key={id} {...clickProps}><BasicSection basic={basic} globalSettings={globalSettings} /></div>
      case 'experience': return <div key={id} {...clickProps}><ExperienceSection experiences={experience} globalSettings={globalSettings} sectionTitle={sectionTitle('experience')} /></div>
      case 'education': return <div key={id} {...clickProps}><EducationSection education={education} globalSettings={globalSettings} sectionTitle={sectionTitle('education')} /></div>
      case 'projects': return <div key={id} {...clickProps}><ProjectSection projects={projects} globalSettings={globalSettings} sectionTitle={sectionTitle('projects')} /></div>
      case 'skills': return <div key={id} {...clickProps}><SkillSection content={skillContent} globalSettings={globalSettings} sectionTitle={sectionTitle('skills')} /></div>
      case 'selfEvaluation': return <div key={id} {...clickProps}><SelfEvaluationSection content={selfEvaluationContent} globalSettings={globalSettings} sectionTitle={sectionTitle('selfEvaluation')} /></div>
      default: return null
    }
  }

  return (
    <div style={{ fontFamily: globalSettings.fontFamily || 'PingFang SC, Noto Sans SC, sans-serif', color: '#222' }}>
      {enabled.map(s => renderSection(s.id))}
    </div>
  )
}

export default MinimalistTemplate
