import type React from 'react'
import type { GlobalSettings } from '@/types/resume'

interface Props { title: string; globalSettings?: GlobalSettings }

const SectionTitle: React.FC<Props> = ({ title, globalSettings }) => (
  <h3 style={{
    fontSize: (globalSettings?.headerSize || 15) + 'px',
    fontWeight: 700,
    color: globalSettings?.themeColor || '#000',
    borderBottom: `1.5px solid ${globalSettings?.themeColor || '#000'}`,
    paddingBottom: 4,
    marginBottom: globalSettings?.paragraphSpacing || 8,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  }}>
    {title}
  </h3>
)

export default SectionTitle
