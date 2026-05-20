import type React from 'react'
import type { BasicInfo, GlobalSettings } from '@/types/resume'
import { getBasicContactItems } from '@/utils/formatBasicField'

interface Props { basic: BasicInfo; globalSettings: GlobalSettings }

const BasicSection: React.FC<Props> = ({ basic, globalSettings }) => {
  const g = globalSettings
  const contacts = getBasicContactItems(basic)

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: g.sectionSpacing || 20 }}>
      <div>
        {basic.name && <h1 style={{ fontSize: (g.headerSize || 15) * 2, fontWeight: 700, margin: 0 }}>{basic.name}</h1>}
        {basic.title && <h2 style={{ fontSize: (g.headerSize || 15) + 2, fontWeight: 400, margin: '4px 0 0', color: '#555' }}>{basic.title}</h2>}
        {contacts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 10, fontSize: g.baseFontSize || 13, color: '#666' }}>
            {contacts.map(item => <span key={item.key}>{item.text}</span>)}
          </div>
        )}
      </div>
      {basic.photo && basic.photoConfig?.visible && (
        <div style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
          <img src={basic.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}
    </div>
  )
}

export default BasicSection
