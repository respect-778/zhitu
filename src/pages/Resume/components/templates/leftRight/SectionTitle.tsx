import type React from 'react'
import type { GlobalSettings } from '@/types/resume'

interface Props { title: string; globalSettings?: GlobalSettings }

const SectionTitle: React.FC<Props> = ({ title, globalSettings }) => {
  const g = globalSettings
  const themeColor = g?.themeColor || '#1677ff'
  return (
    <div style={{ position: 'relative', marginBottom: g?.paragraphSpacing || 8 }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: themeColor, opacity: 0.1, borderRadius: 2 }} />
      <h3 style={{
        position: 'relative', margin: 0,
        borderLeft: `3px solid ${themeColor}`,
        paddingLeft: 12, paddingTop: 4, paddingBottom: 4,
        fontSize: (g?.headerSize || 15) + 'px', fontWeight: 700, color: themeColor,
      }}>
        {title}
      </h3>
    </div>
  )
}

export default SectionTitle
