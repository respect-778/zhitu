import type React from 'react'
import type { BasicInfo, GlobalSettings } from '@/types/resume'
import { getBasicContactItems } from '@/utils/formatBasicField'

interface Props { basic: BasicInfo; globalSettings?: GlobalSettings }

const BasicSection: React.FC<Props> = ({ basic, globalSettings }) => {
  const g = globalSettings

  const fields = getBasicContactItems(basic)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: '#fff' }}>
      {basic.photo && basic.photoConfig?.visible && (
        <img src={basic.photo} alt={basic.name} style={{
          width: basic.photoConfig.width || 90,
          height: basic.photoConfig.height || 90,
          objectFit: 'cover',
          borderRadius: basic.photoConfig.borderRadius === 'full' ? '50%' : basic.photoConfig.borderRadius === 'medium' ? '8px' : 0,
        }} />
      )}
      <div style={{ textAlign: 'center' }}>
        {basic.name && <div style={{ fontWeight: 700, fontSize: 22, lineHeight: 1.2, color: '#fff' }}>{basic.name}</div>}
        {basic.title && <div style={{ fontSize: g?.subheaderSize || 14, color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>{basic.title}</div>}
      </div>
      {fields.length > 0 && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6, fontSize: g?.baseFontSize || 13, color: 'rgba(255,255,255,0.85)' }}>
          {fields.map(f => (
            <div key={f.key} style={{ display: 'flex', gap: 6 }}>
              <span style={{ wordBreak: 'break-all' }}>{f.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default BasicSection
