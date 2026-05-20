import type React from 'react'
import type { GlobalSettings } from '@/types/resume'

interface Props { title: string; globalSettings?: GlobalSettings }

const SectionTitle: React.FC<Props> = ({ title, globalSettings }) => {
  const g = globalSettings
  return (
    <h3 style={{
      fontSize: (g?.headerSize || 15) + 'px',
      fontWeight: 700,
      color: g?.themeColor || '#1677ff',
      margin: 0,
      marginBottom: g?.paragraphSpacing || 8,
    }}>
      {title}
    </h3>
  )
}

export default SectionTitle
