import type React from 'react'
import type { BasicInfo, GlobalSettings } from '@/types/resume'
import { getBasicContactItems } from '@/utils/formatBasicField'

interface Props {
  basic: BasicInfo
  globalSettings?: GlobalSettings
}

const BasicSection: React.FC<Props> = ({ basic, globalSettings }) => {
  const g = globalSettings
  const headerSize = (g?.headerSize || 20) * 2

  const fields = getBasicContactItems(basic)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {basic.name && (
            <h1 style={{
              fontWeight: 700, fontSize: headerSize, lineHeight: 1.1, marginBottom: 8,
              letterSpacing: '0.05em', color: '#000', margin: 0,
            }}>
              {basic.name}
            </h1>
          )}
        </div>
        {basic.photo && basic.photoConfig?.visible && (
          <div style={{ flexShrink: 0 }}>
            <img src={basic.photo} alt={basic.name} style={{
              width: basic.photoConfig.width || 100,
              height: basic.photoConfig.height || 100,
              objectFit: 'cover',
              borderRadius: basic.photoConfig.borderRadius === 'full' ? '50%' : basic.photoConfig.borderRadius === 'medium' ? '8px' : 0,
            }} />
          </div>
        )}
      </div>

      <div style={{ width: '100%', height: 3, backgroundColor: g?.themeColor || '#000', margin: '16px 0' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 10 }}>
        {basic.title && (
          <div style={{ flex: '0 0 auto', minWidth: 100 }}>
            <h2 style={{
              fontWeight: 400, fontSize: g?.subheaderSize || 16, lineHeight: 1.3,
              color: '#4b5563', letterSpacing: '0.02em', margin: 0,
            }}>
              {basic.title}
            </h2>
          </div>
        )}
        {fields.length > 0 && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '8px 24px',
            fontSize: g?.baseFontSize || 14, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            {fields.map(f => (
              <span key={f.key}>{f.text}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default BasicSection
