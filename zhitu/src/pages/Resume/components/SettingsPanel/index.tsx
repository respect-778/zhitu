import type React from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { updateGlobalSettings } from '@/store/modules/resumeStore'
import styles from './index.module.less'

const THEME_COLORS = ['#000000', '#1A1A1A', '#333333', '#0047AB', '#8B0000', '#2E8B57', '#4B0082', '#FF4500', '#1677ff', '#d97706', '#059669', '#dc2626']
const FONTS = ['PingFang SC', 'Noto Sans SC', 'SimSun', 'Microsoft YaHei', 'Arial']

const SettingsPanel: React.FC = () => {
  const dispatch = useAppDispatch()
  const activeResumeId = useAppSelector(s => s.resume.activeResumeId)
  const resume = useAppSelector(s => s.resume.resumes.find(r => r.id === activeResumeId))

  if (!resume) return null
  const g = resume.globalSettings
  const set = (patch: Parameters<typeof updateGlobalSettings>[0]) => dispatch(updateGlobalSettings(patch))

  return (
    <div className={styles.panel}>
      {/* 主题色 */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>主题颜色</div>
        <div className={styles.colorGrid}>
          {THEME_COLORS.map(c => (
            <div
              key={c}
              className={`${styles.colorDot} ${g.themeColor === c ? styles.active : ''}`}
              style={{ background: c }}
              onClick={() => set({ themeColor: c })}
            />
          ))}
        </div>
        <div className={styles.customColor}>
          <label>自定义</label>
          <input type="color" value={g.themeColor || '#000000'} onChange={e => set({ themeColor: e.target.value })} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{g.themeColor}</span>
        </div>
      </div>

      <div className={styles.divider} />

      {/* 字体 */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>字体</div>
        <select className={styles.fontSelect} value={g.fontFamily || 'PingFang SC'} onChange={e => set({ fontFamily: e.target.value })}>
          {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      <div className={styles.divider} />

      {/* 字号 */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>字号</div>
        {([
          { label: '正文', key: 'baseFontSize', min: 10, max: 18 },
          { label: '标题', key: 'headerSize', min: 12, max: 24 },
          { label: '副标题', key: 'subheaderSize', min: 11, max: 20 },
        ] as const).map(({ label, key, min, max }) => (
          <div key={key} className={styles.sliderRow}>
            <label>{label}</label>
            <input type="range" min={min} max={max} value={g[key] ?? 14} onChange={e => set({ [key]: +e.target.value })} />
            <span>{g[key] ?? 14}</span>
          </div>
        ))}
      </div>

      <div className={styles.divider} />

      {/* 间距 */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>间距</div>
        {([
          { label: '页边距', key: 'pagePadding', min: 16, max: 72 },
          { label: '章节间距', key: 'sectionSpacing', min: 8, max: 48 },
          { label: '段落间距', key: 'paragraphSpacing', min: 2, max: 20 },
        ] as const).map(({ label, key, min, max }) => (
          <div key={key} className={styles.sliderRow}>
            <label>{label}</label>
            <input type="range" min={min} max={max} value={g[key] ?? 20} onChange={e => set({ [key]: +e.target.value })} />
            <span>{g[key] ?? 20}</span>
          </div>
        ))}
      </div>

      <div className={styles.divider} />

      {/* 行高 */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>行高</div>
        <div className={styles.sliderRow}>
          <label>行高</label>
          <input type="range" min={1} max={2.5} step={0.1} value={g.lineHeight ?? 1.6} onChange={e => set({ lineHeight: +e.target.value })} />
          <span>{(g.lineHeight ?? 1.6).toFixed(1)}</span>
        </div>
      </div>
    </div>
  )
}

export default SettingsPanel
