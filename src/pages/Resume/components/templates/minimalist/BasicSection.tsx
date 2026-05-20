import type React from 'react'
import type { BasicInfo, GlobalSettings } from '@/types/resume'
import { getBasicContactItems } from '@/utils/formatBasicField'

interface Props {
  basic: BasicInfo
  globalSettings?: GlobalSettings
}

const BasicSection: React.FC<Props> = ({ basic, globalSettings }) => {
  const layout = basic.layout || 'left'
  const subheaderSize = globalSettings?.subheaderSize || 16
  const baseFontSize = globalSettings?.baseFontSize || 14

  const fields = getBasicContactItems(basic)

  const isCenter = layout === 'center'
  const isRight = layout === 'right'

  return (
    <div style={{
      display: 'flex',
      flexDirection: isCenter ? 'column' : 'row',
      alignItems: isCenter ? 'center' : 'flex-start',
      justifyContent: isRight ? 'flex-end' : isCenter ? 'center' : 'space-between',
      gap: 16,
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: isCenter ? undefined : 1 }}>
        {basic.photo && basic.photoConfig?.visible && (
          <img
            src={basic.photo}
            alt={basic.name}
            style={{
              width: basic.photoConfig.width || 80,
              height: basic.photoConfig.height || 80,
              objectFit: 'cover',
              borderRadius: basic.photoConfig.borderRadius === 'full' ? '50%' : basic.photoConfig.borderRadius === 'medium' ? '8px' : 0,
              flexShrink: 0,
            }}
          />
        )}
        <div style={{ textAlign: isCenter ? 'center' : isRight ? 'right' : 'left' }}>
          {basic.name && (
            <div style={{ fontWeight: 700, fontSize: 28, lineHeight: 1.2, color: '#111' }}>{basic.name}</div>
          )}
          {basic.title && (
            <div style={{ fontSize: subheaderSize, color: '#555', marginTop: 4 }}>{basic.title}</div>
          )}
        </div>
      </div>

      {fields.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isCenter ? 'repeat(3, auto)' : 'repeat(2, auto)',
          gap: '4px 24px',
          fontSize: baseFontSize,
          color: '#4b5563',
          justifyContent: isCenter ? 'center' : undefined,
        }}>
          {fields.map(f => (
            <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
              <span>{f.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default BasicSection
