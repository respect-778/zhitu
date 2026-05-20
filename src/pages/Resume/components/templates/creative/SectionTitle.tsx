import type React from 'react'
import type { GlobalSettings } from '@/types/resume'

interface Props { title: string; globalSettings?: GlobalSettings }

const SectionTitle: React.FC<Props> = ({ title, globalSettings }) => {
  const g = globalSettings
  return (
    <h3 style={{
      display: 'inline-block',
      padding: '4px 14px',
      borderRadius: 4,
      backgroundColor: g?.themeColor || '#1677ff',
      color: '#fff',
      fontSize: (g?.headerSize || 15) + 'px',
      fontWeight: 700,
      marginBottom: g?.paragraphSpacing || 8,
      letterSpacing: '0.03em',
    }}>
      {title}
    </h3>
  )
}

export default SectionTitle
