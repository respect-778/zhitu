import type React from 'react'
import type { BasicInfo, GlobalSettings } from '@/types/resume'
import { getBasicContactItems } from '@/utils/formatBasicField'

interface Props { basic: BasicInfo; globalSettings: GlobalSettings }

const BasicSection: React.FC<Props> = ({ basic, globalSettings }) => {
  const g = globalSettings
  const themeColor = g.themeColor || '#1677ff'
  const contacts = getBasicContactItems(basic)

  return (
    <div style={{
      backgroundColor: themeColor,
      color: '#fff',
      padding: `${g.sectionSpacing || 20}px ${g.sectionSpacing || 20}px`,
      borderRadius: '0 0 24px 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {basic.photo && basic.photoConfig?.visible && (
          <div style={{
            width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
            border: '2px solid rgba(255,255,255,0.6)',
          }}>
            <img src={basic.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}
        <div style={{ flex: 1 }}>
          {basic.name && (
            <h1 style={{ fontSize: (g.headerSize || 15) * 2, fontWeight: 700, margin: 0, color: '#fff' }}>
              {basic.name}
            </h1>
          )}
          {basic.title && (
            <h2 style={{ fontSize: (g.headerSize || 15) + 2, fontWeight: 400, margin: '4px 0 0', color: 'rgba(255,255,255,0.9)' }}>
              {basic.title}
            </h2>
          )}
        </div>
      </div>
      {contacts.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 12, fontSize: g.baseFontSize || 13, color: 'rgba(255,255,255,0.85)' }}>
          {contacts.map(item => <span key={item.key}>{item.text}</span>)}
        </div>
      )}
    </div>
  )
}

export default BasicSection
