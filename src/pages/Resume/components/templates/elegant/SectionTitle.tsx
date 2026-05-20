import type React from 'react'
import type { GlobalSettings } from '@/types/resume'

interface Props { title: string; globalSettings?: GlobalSettings }

const SectionTitle: React.FC<Props> = ({ title, globalSettings }) => {
  const g = globalSettings
  const themeColor = g?.themeColor || '#000'
  return (
    <div style={{ position: 'relative', textAlign: 'center', marginBottom: g?.paragraphSpacing || 8 }}>
      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, backgroundColor: themeColor, opacity: 0.3 }} />
      <h3 style={{
        position: 'relative', display: 'inline-block', backgroundColor: '#fff',
        padding: '0 16px', fontSize: (g?.headerSize || 15) + 'px', fontWeight: 700, color: themeColor, margin: 0,
      }}>
        {title}
      </h3>
    </div>
  )
}

export default SectionTitle
