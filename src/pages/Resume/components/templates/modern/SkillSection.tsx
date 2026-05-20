import type React from 'react'
import type { GlobalSettings } from '@/types/resume'
import SectionTitle from './SectionTitle'
import MarkdownContent from '../shared/MarkdownContent'

interface Props { content: string; globalSettings?: GlobalSettings; sectionTitle?: string; sidebar?: boolean }

const SkillSection: React.FC<Props> = ({ content, globalSettings, sectionTitle = '专业技能', sidebar }) => {
  if (!content) return null
  const g = globalSettings
  return (
    <div style={{ marginTop: g?.sectionSpacing || 20 }}>
      <SectionTitle title={sectionTitle} globalSettings={g} sidebar={sidebar} />
      <div style={{ fontSize: g?.baseFontSize || 13, lineHeight: g?.lineHeight || 1.6, color: sidebar ? 'rgba(255,255,255,0.85)' : '#333' }}>
        <MarkdownContent content={content} />
      </div>
    </div>
  )
}

export default SkillSection
