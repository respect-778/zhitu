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

const ModernTemplate: React.FC<Props> = ({ data, onSectionClick, activeSection }) => {
  const { basic, education, experience, projects, skillContent, selfEvaluationContent, menuSections, globalSettings } = data
  const enabled = [...menuSections].filter(s => s.enabled).sort((a, b) => a.order - b.order)
  const title = (id: string) => menuSections.find(s => s.id === id)?.title
  const click = (id: string) => onSectionClick ? { onClick: () => onSectionClick(id), style: { cursor: 'pointer', borderRadius: 6, transition: 'background 0.2s', background: activeSection === id ? ACTIVE_BG : 'transparent' } } : {}

  const themeColor = globalSettings.themeColor || '#1677ff'
  const sidebarSections = enabled.filter(s => s.id === 'basic' || s.id === 'education' || s.id === 'skills')
  const mainSections = enabled.filter(s => s.id !== 'basic' && s.id !== 'education' && s.id !== 'skills')

  const renderSidebar = (id: string) => {
    switch (id) {
      case 'basic': return <div key={id} {...click(id)}><BasicSection basic={basic} globalSettings={globalSettings} /></div>
      case 'education': return <div key={id} {...click(id)}><EducationSection education={education} globalSettings={globalSettings} sectionTitle={title('education')} sidebar /></div>
      case 'skills': return <div key={id} {...click(id)}><SkillSection content={skillContent} globalSettings={globalSettings} sectionTitle={title('skills')} sidebar /></div>
      default: return null
    }
  }

  const renderMain = (id: string) => {
    switch (id) {
      case 'experience': return <div key={id} {...click(id)}><ExperienceSection experiences={experience} globalSettings={globalSettings} sectionTitle={title('experience')} /></div>
      case 'projects': return <div key={id} {...click(id)}><ProjectSection projects={projects} globalSettings={globalSettings} sectionTitle={title('projects')} /></div>
      case 'selfEvaluation': return <div key={id} {...click(id)}><SelfEvaluationSection content={selfEvaluationContent} globalSettings={globalSettings} sectionTitle={title('selfEvaluation')} /></div>
      default: return null
    }
  }

  return (
    <div style={{
      fontFamily: globalSettings.fontFamily || 'PingFang SC, Noto Sans SC, sans-serif',
      display: 'table',
      width: '100%',
      tableLayout: 'fixed',
      minHeight: '1123px',
    }}>
      <div style={{ display: 'table-row' }}>
        {/* 左侧彩色边栏 */}
        <div style={{
          display: 'table-cell',
          width: '33%',
          backgroundColor: themeColor,
          padding: `${globalSettings.sectionSpacing || 20}px 16px`,
          verticalAlign: 'top',
        }}>
          {sidebarSections.map(s => renderSidebar(s.id))}
        </div>
        {/* 右侧主内容 */}
        <div style={{
          display: 'table-cell',
          width: '67%',
          backgroundColor: '#fff',
          padding: `${globalSettings.sectionSpacing || 20}px 20px`,
          verticalAlign: 'top',
        }}>
          {mainSections.map(s => renderMain(s.id))}
        </div>
      </div>
    </div>
  )
}

export default ModernTemplate
