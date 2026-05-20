import type React from 'react'
import type { ResumeData } from '@/types/resume'
import { useRef, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Modal, Input, message, Popconfirm } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { createResume, deleteResume, loadUserResumes, setActiveResume } from '@/store/modules/resumeStore'
import { TEMPLATES, getTemplateComponent } from './components/templates'
import { DEFAULT_RESUME_DATA } from '@/types/resume'
import useCarouselControls from '@/hooks/useCarouselControls'
import styles from './index.module.less'

const A4_WIDTH = 794
const BLUE_AVATAR_TEMPLATES = new Set(['minimalist', 'classic', 'modern', 'editorial'])
const BLUE_AVATAR = '/imgs/resume-avatar-blue.jpg'
const WHITE_AVATAR = '/imgs/resume-avatar-white.jpg'


function getPreviewAvatar(templateId: string) {
  return BLUE_AVATAR_TEMPLATES.has(templateId) ? BLUE_AVATAR : WHITE_AVATAR
}

function buildMockData(templateId: string): ResumeData {
  return {
    ...DEFAULT_RESUME_DATA,
    id: `preview-${templateId}`,
    createdAt: '',
    updatedAt: '',
    basic: {
      ...DEFAULT_RESUME_DATA.basic,
      name: '张三',
      title: '前端工程师 · 5年经验',
      email: 'zhangsan@example.com',
      emailPrefix: '邮箱',
      phone: '138-0000-0000',
      phonePrefix: '电话',
      location: '北京·朝阳区',
      locationPrefix: '地点',
      age: '26',
      agePrefix: '年龄',
      photo: getPreviewAvatar(templateId),
    },
    experience: [
      {
        id: '1', company: '字节跳动', position: '高级前端工程师', date: '2022.07 - 至今',
        details: '负责抖音 Web 端核心业务模块开发，主导性能优化专项，首屏加载从 3.2s 降至 1.8s，提速 40%\n推动组件库建设，封装 30+ 通用组件，覆盖 8 个业务线，研发效率提升 25%\n设计并落地微前端架构，实现多团队并行开发，部署效率提升 60%', visible: true,
      },
      {
        id: '2', company: '阿里巴巴', position: '前端工程师', date: '2020.07 - 2022.06',
        details: '参与淘宝商品详情页重构，引入 SSR 方案，SEO 流量提升 18%，首屏 LCP 降至 1.2s\n负责 A/B 实验平台前端搭建，支撑日均千万级实验流量，实验迭代周期缩短 40%\n优化 Webpack 构建配置，Bundle 体积减少 35%，CI 构建时间从 8min 降至 3min', visible: true,
      },
    ],
    education: [
      {
        id: '1', school: '北京大学', major: '计算机科学与技术', degree: '本科',
        startDate: '2016.09', endDate: '2020.06', visible: true,
        description: 'GPA 3.8/4.0，连续三年获一等奖学金；ACM 校赛银奖',
      },
    ],
    projects: [
      {
        id: '1', name: '企业级低代码平台', role: '前端负责人', date: '2023.03 - 2023.09',
        link: 'github.com/zhangsan/lowcode',
        linkLabel: 'github.com/zhangsan/lowcode',
        description: '设计并实现拖拽式页面搭建引擎，基于 React DnD 和 JSON Schema 驱动渲染\n支持 50+ 物料组件和自定义扩展，接入 10 个业务线，月活用户 2000+\n实现操作历史回溯（Undo/Redo）和实时协同编辑功能', visible: true,
      },
      {
        id: '2', name: '跨端组件库 UniUI', role: '核心开发者', date: '2022.01 - 2022.12',
        link: '',
        linkLabel: '',
        description: '基于 Monorepo 架构搭建跨端组件库，覆盖 Web、H5、小程序三端\n编写完善的单元测试与文档站点，测试覆盖率达 92%，NPM 周下载量 5000+', visible: true,
      },
    ],
    skillContent: '前端框架：React 18/19、Vue 3、Next.js、TypeScript\n工程化：Webpack 5、Vite、Rollup、Turborepo、pnpm\n跨端：Taro、React Native、Electron\n后端 & 数据库：Node.js、Express、MySQL、Redis、MongoDB\n其他：Git、Docker、CI/CD、Nginx、性能优化、微前端',
    selfEvaluationContent: '5 年前端开发经验，深耕大型 Web 应用架构设计与性能优化，具备从 0 到 1 搭建前端基础设施的能力。\n熟悉 React 生态与工程化体系，有丰富的组件库建设和微前端实践经验。\n良好的技术文档习惯和 Code Review 意识，擅长跨团队协作与技术方案推动。',
    templateId,
  } as ResumeData
}

// 简历模板-封面页
function TemplatePreviewCard({ templateId, name, desc, onUse }: {
  templateId: string; name: string; desc: string; onUse: (prefill: Partial<ResumeData>) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.22)
  const Template = getTemplateComponent(templateId)
  const mockData = buildMockData(templateId)

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width
      if (w > 0) setScale(w / A4_WIDTH)
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  return (
    <div className={styles.tplCard}>
      <div className={styles.tplPreview} ref={containerRef}>
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '794px',
          transform: `scale(${scale})`, transformOrigin: 'top left',
          padding: (templateId === 'modern' || templateId === 'creative') ? 0 : `${mockData.globalSettings.pagePadding}px`,
          boxSizing: 'border-box',
          fontFamily: mockData.globalSettings.fontFamily,
          backgroundColor: '#fff',
          pointerEvents: 'none',
          minHeight: '1123px',
        }}>
          <Template data={mockData} />
        </div>
      </div>
      <div className={styles.tplInfo}>
        <span className={styles.tplName}>{name}</span>
        <span className={styles.tplDesc}>{desc}</span>
      </div>
      <button className={styles.tplUseBtn} onClick={() => onUse(mockData)}>使用此模板</button>
    </div>
  )
}

// 我的简历-封面页组件
function ResumePreviewCard({ resume, onOpen, onDelete, formatDate }: {
  resume: ResumeData; onOpen: (id: string) => void; onDelete: (id: string) => void; formatDate: (iso: string) => string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.22)
  const Template = getTemplateComponent(resume.templateId)

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width
      if (w > 0) setScale(w / A4_WIDTH)
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const isPaddedTemplate = resume.templateId !== 'modern' && resume.templateId !== 'creative'

  return (
    <div className={styles.card} onClick={() => onOpen(resume.id)}>
      <div className={styles.tplPreview} ref={containerRef}>
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '794px',
          transform: `scale(${scale})`, transformOrigin: 'top left',
          padding: isPaddedTemplate ? `${resume.globalSettings.pagePadding}px` : 0,
          boxSizing: 'border-box',
          fontFamily: resume.globalSettings.fontFamily,
          backgroundColor: '#fff',
          pointerEvents: 'none',
          minHeight: '1123px',
        }}>
          <Template data={resume} />
        </div>
      </div>
      <div className={styles.cardInfo}>
        <div className={styles.cardTitle}>{resume.title}</div>
        <div className={styles.cardDate}>更新于 {formatDate(resume.updatedAt)}</div>
      </div>
      <div className={styles.cardActions} onClick={e => e.stopPropagation()}>
        <button className={styles.actionBtn} onClick={() => onOpen(resume.id)}>
          <EditOutlined /> 编辑
        </button>
        <Popconfirm title="确认删除这份简历？" onConfirm={() => onDelete(resume.id)} okText="删除" cancelText="取消">
          <button className={`${styles.actionBtn} ${styles.danger}`}><DeleteOutlined /></button>
        </Popconfirm>
      </div>
    </div>
  )
}

const Resume: React.FC = () => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const userId = useAppSelector(state => state.user.userId)
  const resumes = useAppSelector(state => state.resume.resumes)
  const resumeStorageUserId = useAppSelector(state => state.resume.storageUserId)
  const currentUserResumes = resumeStorageUserId === userId ? resumes : []

  const [newTitle, setNewTitle] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [prefillData, setPrefillData] = useState<Partial<ResumeData>>({})
  const [showTitleModal, setShowTitleModal] = useState(false)

  const templateCarousel = useCarouselControls(TEMPLATES.length)
  const resumeCarousel = useCarouselControls(currentUserResumes.length)

  // 进入简历页时加载当前用户自己的本地简历。
  useEffect(() => {
    if (userId && resumeStorageUserId !== userId) {
      dispatch(loadUserResumes(userId))
    }
  }, [dispatch, userId, resumeStorageUserId])

  const handleUseTemplate = (templateId: string, prefill: Partial<ResumeData> = {}) => {
    setSelectedTemplate(templateId)
    setPrefillData(prefill)
    setNewTitle('我的简历')
    setShowTitleModal(true)
  }

  const handleCreate = () => {
    if (!userId || resumeStorageUserId !== userId) return message.warning('用户信息加载中，请稍后再试')
    if (!newTitle.trim()) return message.warning('请输入简历标题')
    const id = crypto.randomUUID()
    dispatch(createResume({ id, title: newTitle.trim(), templateId: selectedTemplate, prefill: prefillData }))
    setShowTitleModal(false)
    navigate(`/resume/${id}`)
  }

  const handleOpen = (id: string) => {
    dispatch(setActiveResume(id))
    navigate(`/resume/${id}`)
  }

  const handleDelete = (id: string) => {
    dispatch(deleteResume(id))
    message.success('已删除')
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className={styles.container}>
      <div className={styles.page}>

        {/* 模板区 */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>简历模板</h2>
            <span className={styles.sectionSub}>选择一个模板开始创建</span>
          </div>
          <div className={styles.carouselShell}>
            {templateCarousel.canScrollLeft && (
              <button className={`${styles.carouselArrow} ${styles.leftArrow}`} onClick={() => templateCarousel.scrollBy(-1)}><LeftOutlined /></button>
            )}
            <div className={styles.tplCarousel} ref={templateCarousel.ref}>
              {TEMPLATES.map(t => (
                <TemplatePreviewCard
                  key={t.id}
                  templateId={t.id}
                  name={t.name}
                  desc={t.desc}
                  onUse={(prefill) => handleUseTemplate(t.id, prefill)}
                />
              ))}
            </div>
            {templateCarousel.canScrollRight && (
              <button className={`${styles.carouselArrow} ${styles.rightArrow}`} onClick={() => templateCarousel.scrollBy(1)}><RightOutlined /></button>
            )}
          </div>
        </div>

        <div className={styles.divider} />

        {/* 我的简历区 */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>我的简历</h2>
            <span className={styles.sectionSub}>开始编写你的简历</span>
          </div>
          <div className={styles.carouselShell}>
            {resumeCarousel.canScrollLeft && (
              <button className={`${styles.carouselArrow} ${styles.leftArrow}`} onClick={() => resumeCarousel.scrollBy(-1)}><LeftOutlined /></button>
            )}
            <div className={styles.resumeCarousel} ref={resumeCarousel.ref}>
              <div className={styles.addCard} onClick={() => handleUseTemplate('minimalist')}>
                <PlusOutlined className={styles.addIcon} />
                <span>新建简历</span>
              </div>
              {currentUserResumes.map(resume => (
                <ResumePreviewCard
                  key={resume.id}
                  resume={resume}
                  onOpen={handleOpen}
                  onDelete={handleDelete}
                  formatDate={formatDate}
                />
              ))}
            </div>
            {resumeCarousel.canScrollRight && (
              <button className={`${styles.carouselArrow} ${styles.rightArrow}`} onClick={() => resumeCarousel.scrollBy(1)}><RightOutlined /></button>
            )}
          </div>
        </div>

        <Modal title="简历标题" open={showTitleModal} onOk={handleCreate} onCancel={() => setShowTitleModal(false)} okText="创建" cancelText="取消" centered>
          <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="输入简历标题" onPressEnter={handleCreate} autoFocus />
        </Modal>
      </div>
    </div>
  )
}

export default Resume
