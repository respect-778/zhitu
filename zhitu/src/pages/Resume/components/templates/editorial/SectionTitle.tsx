import type React from 'react'
import type { GlobalSettings } from '@/types/resume'

interface Props { title: string; globalSettings?: GlobalSettings }

const SectionTitle: React.FC<Props> = ({ title, globalSettings }) => (
  <div style={{ width: '100%', marginBottom: globalSettings?.paragraphSpacing || 8 }}>
    <h3 style={{
      fontSize: (globalSettings?.headerSize || 15) + 'px',
      fontWeight: 700,
      color: globalSettings?.themeColor || '#8e8e8e',
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
      margin: 0,
    }}>
      {title}
    </h3>
  </div>
)

export default SectionTitle
