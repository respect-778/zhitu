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

const EditorialTemplate: React.FC<Props> = ({ data, onSectionClick, activeSection }) => {
  const { basic, education, experience, projects, skillContent, selfEvaluationContent, menuSections, globalSettings } = data
  const enabled = [...menuSections].filter(s => s.enabled).sort((a, b) => a.order - b.order)
  const title = (id: string) => menuSections.find(s => s.id === id)?.title
  const click = (id: string) => onSectionClick ? { onClick: () => onSectionClick(id), style: { cursor: 'pointer', borderRadius: 6, transition: 'background 0.2s', background: activeSection === id ? ACTIVE_BG : 'transparent' } } : {}

  const renderSection = (id: string) => {
    switch (id) {
      case 'basic': return <div key={id} {...click(id)}><BasicSection basic={basic} globalSettings={globalSettings} /></div>
      case 'experience': return <div key={id} {...click(id)}><ExperienceSection experiences={experience} globalSettings={globalSettings} sectionTitle={title('experience')} /></div>
      case 'education': return <div key={id} {...click(id)}><EducationSection education={education} globalSettings={globalSettings} sectionTitle={title('education')} /></div>
      case 'projects': return <div key={id} {...click(id)}><ProjectSection projects={projects} globalSettings={globalSettings} sectionTitle={title('projects')} /></div>
      case 'skills': return <div key={id} {...click(id)}><SkillSection content={skillContent} globalSettings={globalSettings} sectionTitle={title('skills')} /></div>
      case 'selfEvaluation': return <div key={id} {...click(id)}><SelfEvaluationSection content={selfEvaluationContent} globalSettings={globalSettings} sectionTitle={title('selfEvaluation')} /></div>
      default: return null
    }
  }

  return (
    <div style={{
      fontFamily: globalSettings.fontFamily || 'PingFang SC, Noto Sans SC, sans-serif',
      color: '#222',
      backgroundColor: '#FAF8F5',
      margin: `-${globalSettings.pagePadding || 40}px`,
      padding: `${globalSettings.pagePadding || 40}px`,
      paddingTop: `${(globalSettings.pagePadding || 40) + 16}px`,
      minHeight: '1123px',
    }}>
      {enabled.map(s => renderSection(s.id))}
    </div>
  )
}

export default EditorialTemplate
