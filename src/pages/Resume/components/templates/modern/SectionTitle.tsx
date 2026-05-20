import type React from 'react'
import type { GlobalSettings } from '@/types/resume'

interface Props { title: string; globalSettings?: GlobalSettings; sidebar?: boolean }

const SectionTitle: React.FC<Props> = ({ title, globalSettings, sidebar }) => (
  <h3 style={{
    fontSize: (globalSettings?.headerSize || 14) + 'px',
    fontWeight: 700,
    color: sidebar ? '#fff' : (globalSettings?.themeColor || '#000'),
    borderBottom: `1.5px solid ${sidebar ? 'rgba(255,255,255,0.4)' : (globalSettings?.themeColor || '#000')}`,
    paddingBottom: 4,
    marginBottom: globalSettings?.paragraphSpacing || 8,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    margin: 0,
  }}>
    {title}
  </h3>
)

export default SectionTitle
