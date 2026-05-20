import type React from 'react'
import type { GlobalSettings } from '@/types/resume'
import SectionTitle from './SectionTitle'
import MarkdownContent from '../shared/MarkdownContent'

interface Props {
  content?: string
  globalSettings?: GlobalSettings
  sectionTitle?: string
}

const SelfEvaluationSection: React.FC<Props> = ({ content, globalSettings, sectionTitle = '自我评价' }) => {
  if (!content?.trim()) return null
  const g = globalSettings
  return (
    <div style={{ marginTop: g?.sectionSpacing || 20 }}>
      <SectionTitle title={sectionTitle} globalSettings={g} />
      <div style={{ fontSize: g?.baseFontSize || 13, lineHeight: g?.lineHeight || 1.6, color: '#333', marginTop: g?.paragraphSpacing || 6 }}>
        <MarkdownContent content={content} />
      </div>
    </div>
  )
}

export default SelfEvaluationSection
