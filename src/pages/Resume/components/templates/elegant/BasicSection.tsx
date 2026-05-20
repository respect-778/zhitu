import type React from 'react'
import type { BasicInfo, GlobalSettings } from '@/types/resume'
import { getBasicContactItems } from '@/utils/formatBasicField'

interface Props { basic: BasicInfo; globalSettings: GlobalSettings }

const BasicSection: React.FC<Props> = ({ basic, globalSettings }) => {
  const g = globalSettings
  const contacts = getBasicContactItems(basic)

  return (
    <div style={{ textAlign: 'center', paddingBottom: g.sectionSpacing || 20 }}>
      {basic.photo && basic.photoConfig?.visible && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', overflow: 'hidden' }}>
            <img src={basic.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        </div>
      )}
      {basic.name && <h1 style={{ fontSize: (g.headerSize || 15) * 2, fontWeight: 700, margin: 0, color: '#222' }}>{basic.name}</h1>}
      {basic.title && <h2 style={{ fontSize: (g.headerSize || 15) + 2, fontWeight: 400, margin: '4px 0 0', color: '#555' }}>{basic.title}</h2>}
      {contacts.length > 0 && (
        <div style={{ fontSize: g.baseFontSize || 13, color: '#666', marginTop: 10 }}>
          {contacts.map(item => item.text).join(' | ')}
        </div>
      )}
    </div>
  )
}

export default BasicSection
