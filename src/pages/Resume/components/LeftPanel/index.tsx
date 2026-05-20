import type React from 'react'
import { useMemo, useState } from 'react'
import { Reorder, useDragControls } from 'motion/react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveSection, updateMenuSections, updateGlobalSettings } from '@/store/modules/resumeStore'
import type { GlobalSettings, MenuSection } from '@/types/resume'
import { HolderOutlined, EyeOutlined, EyeInvisibleOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Popover } from 'antd'
import styles from './index.module.less'

const SECTION_ICONS: Record<string, string> = {
  basic: '👤', experience: '💼', education: '🎓',
  projects: '💻', skills: '⭐', selfEvaluation: '📝',
}

// 6 个默认模块 ID，不可删除
const DEFAULT_SECTION_IDS = ['basic', 'experience', 'education', 'projects', 'skills', 'selfEvaluation']

// 可添加的预设模块列表
const AVAILABLE_SECTIONS: { id: string; title: string; icon: string }[] = [
  { id: 'experience', title: '工作经历', icon: '💼' },
  { id: 'education', title: '教育背景', icon: '🎓' },
  { id: 'projects', title: '项目经历', icon: '💻' },
  { id: 'skills', title: '专业技能', icon: '⭐' },
  { id: 'selfEvaluation', title: '自我评价', icon: '📝' },
]
const THEME_COLORS = ['#000000', '#1A1A1A', '#333333', '#0047AB', '#8B0000', '#2E8B57', '#4B0082', '#FF4500', '#1677ff', '#d97706', '#059669', '#dc2626']
const FONTS = ['PingFang SC', 'Noto Sans SC', 'SimSun', 'Microsoft YaHei', 'Arial']

type NumberSettingKey = {
  [K in keyof GlobalSettings]-?: NonNullable<GlobalSettings[K]> extends number ? K : never
}[keyof GlobalSettings]

type SliderConfig = {
  label: string
  key: NumberSettingKey
  min: number
  max: number
  step?: number
  defaultValue: number
  fmt?: (value: number) => string
}

const TYPOGRAPHY_SLIDERS: SliderConfig[] = [
  { label: '正文', key: 'baseFontSize', min: 10, max: 18, defaultValue: 14 },
  { label: '标题', key: 'headerSize', min: 12, max: 24, defaultValue: 14 },
  { label: '副标题', key: 'subheaderSize', min: 11, max: 20, defaultValue: 14 },
  { label: '行高', key: 'lineHeight', min: 1, max: 2.5, step: 0.1, defaultValue: 1.6, fmt: (value: number) => value.toFixed(1) },
]

const SPACING_SLIDERS: SliderConfig[] = [
  { label: '页边距', key: 'pagePadding', min: 16, max: 72, defaultValue: 20 },
  { label: '章节间距', key: 'sectionSpacing', min: 8, max: 48, defaultValue: 20 },
  { label: '段落间距', key: 'paragraphSpacing', min: 2, max: 20, defaultValue: 20 },
]

function Card({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader} onClick={() => setOpen(o => !o)}>
        {title}
        <span className={`${styles.chevron} ${open ? styles.open : ''}`}>▼</span>
      </div>
      {open && <div className={styles.cardBody}>{children}</div>}
    </div>
  )
}

// 单个可拖拽 Section Item
function DraggableSectionItem({ section, isActive, onSelect, onToggle, onDelete }: {
  section: MenuSection
  isActive: boolean
  onSelect: () => void
  onToggle: () => void
  onDelete?: () => void
}) {
  const dragControls = useDragControls()
  const isDefault = DEFAULT_SECTION_IDS.includes(section.id)

  return (
    <Reorder.Item
      value={section}
      id={section.id}
      dragListener={false}
      dragControls={dragControls}
      className={`${styles.sectionItem} ${isActive ? styles.active : ''} ${!section.enabled ? styles.disabled : ''}`}
    >
      <span
        className={styles.dragHandle}
        onPointerDown={e => dragControls.start(e)}
      >
        <HolderOutlined />
      </span>
      <span className={styles.sectionIcon} onClick={onSelect}>{SECTION_ICONS[section.id] || '📄'}</span>
      <span className={styles.sectionLabel} onClick={onSelect}>{section.title}</span>
      <button className={styles.toggleBtn} onClick={e => { e.stopPropagation(); onToggle() }} title={section.enabled ? '隐藏' : '显示'}>
        {section.enabled ? <EyeOutlined /> : <EyeInvisibleOutlined />}
      </button>
      {!isDefault && onDelete && (
        <button className={styles.deleteBtn} onClick={e => { e.stopPropagation(); onDelete() }} title="删除模块">
          <DeleteOutlined />
        </button>
      )}
    </Reorder.Item>
  )
}

const LeftPanel: React.FC = () => {
  const dispatch = useAppDispatch()
  const activeResumeId = useAppSelector(s => s.resume.activeResumeId)
  const activeSection = useAppSelector(s => s.resume.activeSection)
  const resume = useAppSelector(s => s.resume.resumes.find(r => r.id === activeResumeId))
  const [addPopoverOpen, setAddPopoverOpen] = useState(false)

  // hooks 必须在 early return 之前调用，保证每次渲染顺序一致
  const sections = useMemo(() =>
    resume ? [...resume.menuSections].sort((a, b) => a.order - b.order) : []
    , [resume?.menuSections])

  const addableSections = useMemo(() => {
    const existingIds = new Set(sections.map(s => s.id))
    return AVAILABLE_SECTIONS.filter(s => !existingIds.has(s.id))
  }, [sections])

  if (!resume) return null
  const g = resume.globalSettings
  const set = (patch: Parameters<typeof updateGlobalSettings>[0]) => dispatch(updateGlobalSettings(patch))
  const setNumber = (key: NumberSettingKey, value: number) => set({ [key]: value } as Partial<GlobalSettings>)

  const basicSection = sections.find(s => s.id === 'basic')
  const draggableSections = sections.filter(s => s.id !== 'basic')

  const toggleSection = (id: string) => {
    if (id === 'basic') return
    dispatch(updateMenuSections(sections.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s)))
  }

  // 拖拽排序：basic 固定首位，其余按新顺序重新编号
  const handleReorder = (newOrder: MenuSection[]) => {
    const reordered = [
      ...(basicSection ? [basicSection] : []),
      ...newOrder,
    ].map((s, i) => ({ ...s, order: i }))
    dispatch(updateMenuSections(reordered))
  }

  // 删除自定义模块
  const handleDeleteSection = (id: string) => {
    const updated = sections.filter(s => s.id !== id).map((s, i) => ({ ...s, order: i }))
    dispatch(updateMenuSections(updated))
    if (activeSection === id) dispatch(setActiveSection('basic'))
  }

  // 添加预设模块
  const handleAddSection = (section: { id: string; title: string; icon: string }) => {
    const newSection: MenuSection = {
      id: section.id,
      title: section.title,
      icon: section.icon,
      enabled: true,
      order: sections.length,
    }
    dispatch(updateMenuSections([...sections, newSection]))
    setAddPopoverOpen(false)
  }

  const addPopoverContent = (
    <div className={styles.addPopover}>
      {addableSections.length === 0 ? (
        <div className={styles.addEmpty}>所有模块已添加</div>
      ) : (
        addableSections.map(s => (
          <div key={s.id} className={styles.addItem} onClick={() => handleAddSection(s)}>
            <span>{s.icon}</span>
            <span>{s.title}</span>
          </div>
        ))
      )}
    </div>
  )

  return (
    <div className={styles.panel}>
      <Card title="布局">
        {/* basic 固定不可拖 */}
        {basicSection && (
          <div
            className={`${styles.sectionItem} ${styles.basicItem} ${activeSection === 'basic' ? styles.active : ''}`}
            onClick={() => dispatch(setActiveSection('basic'))}
          >
            <span className={styles.sectionIcon}>{SECTION_ICONS.basic}</span>
            <span className={styles.sectionLabel}>{basicSection.title}</span>
          </div>
        )}

        {/* 可拖拽的 sections */}
        <Reorder.Group axis="y" values={draggableSections} onReorder={handleReorder} className={styles.reorderGroup}>
          {draggableSections.map(s => (
            <DraggableSectionItem
              key={s.id}
              section={s}
              isActive={activeSection === s.id}
              onSelect={() => { if (s.enabled) dispatch(setActiveSection(s.id)) }}
              onToggle={() => toggleSection(s.id)}
              onDelete={!DEFAULT_SECTION_IDS.includes(s.id) ? () => handleDeleteSection(s.id) : undefined}
            />
          ))}
        </Reorder.Group>

        {/* 添加模块按钮 */}
        <Popover
          content={addPopoverContent}
          trigger="click"
          open={addPopoverOpen}
          onOpenChange={setAddPopoverOpen}
          placement="bottom"
        >
          <button className={styles.addBtn}>
            <PlusOutlined /> 添加模块
          </button>
        </Popover>
      </Card>

      <Card title="主题色">
        <div className={styles.colorGrid}>
          {THEME_COLORS.map(c => (
            <div key={c} className={`${styles.colorDot} ${g.themeColor === c ? styles.active : ''}`}
              style={{ background: c }} onClick={() => set({ themeColor: c })} />
          ))}
        </div>
        <div className={styles.customColor}>
          <label>自定义</label>
          <input type="color" value={g.themeColor || '#000000'} onChange={e => set({ themeColor: e.target.value })} />
          <span>{g.themeColor}</span>
        </div>
      </Card>

      <Card title="排版">
        <select className={styles.fontSelect} value={g.fontFamily || 'PingFang SC'} onChange={e => set({ fontFamily: e.target.value })}>
          {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        {TYPOGRAPHY_SLIDERS.map(({ label, key, min, max, step, defaultValue, fmt }) => {
          const value = g[key] ?? defaultValue
          return (
            <div key={key} className={styles.row}>
              <label>{label}</label>
              <input type="range" min={min} max={max} step={step ?? 1} value={value}
                onChange={e => setNumber(key, +e.target.value)} />
              <span>{fmt ? fmt(value) : value}</span>
            </div>
          )
        })}
      </Card>

      <Card title="间距">
        {SPACING_SLIDERS.map(({ label, key, min, max, defaultValue }) => {
          const value = g[key] ?? defaultValue
          return (
            <div key={key} className={styles.row}>
              <label>{label}</label>
              <input type="range" min={min} max={max} value={value} onChange={e => setNumber(key, +e.target.value)} />
              <span>{value}</span>
            </div>
          )
        })}
      </Card>
    </div>
  )
}

export default LeftPanel
