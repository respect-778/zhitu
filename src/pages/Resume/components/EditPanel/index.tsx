import type React from 'react'
import type { BasicInfo } from '@/types/resume'
import { useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  updateBasicInfo, addEducation, updateEducation, removeEducation,
  addExperience, updateExperience, removeExperience,
  addProject, updateProject, removeProject,
  updateSkillContent, updateSelfEvaluation,
} from '@/store/modules/resumeStore'
import { Input, Button } from 'antd'
import { PlusOutlined, DeleteOutlined, SignatureOutlined } from '@ant-design/icons'
import AIPolishModal from '../AIPolishModal'
import styles from './index.module.less'

const { TextArea } = Input

// 记录当前要润色的字段，以及润色后如何写回对应 Redux 数据。
interface PolishModalState {
  open: boolean
  content: string
  fieldType: string
  onApply: (val: string) => void
}

const EditPanel: React.FC = () => {
  const dispatch = useAppDispatch()
  const activeResumeId = useAppSelector(s => s.resume.activeResumeId)
  const activeSection = useAppSelector(s => s.resume.activeSection)
  const resume = useAppSelector(s => s.resume.resumes.find(r => r.id === activeResumeId))
  const fileRef = useRef<HTMLInputElement>(null)

  const [polishModal, setPolishModal] = useState<PolishModalState>({ open: false, content: '', fieldType: '', onApply: () => { } })

  // 打开润色弹窗：保存原文、字段类型和当前字段的写回函数。
  const openPolishModal = (content: string, fieldType: string, onApply: (val: string) => void) => {
    setPolishModal({ open: true, content, fieldType, onApply })
  }

  const closePolishModal = () => {
    setPolishModal(prev => ({ ...prev, open: false }))
  }

  // 弹窗确认后，调用打开弹窗时传入的写回逻辑。
  const applyPolishedContent = (value: string) => {
    polishModal.onApply(value)
    closePolishModal()
  }

  if (!resume) return null
  const { basic, education, experience, projects, skillContent, selfEvaluationContent } = resume

  // 上传图片
  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => dispatch(updateBasicInfo({ photo: ev.target?.result as string }))
    reader.readAsDataURL(file)
  }

  // 基本信息
  const renderBasicContactField = (
    label: string,
    prefixKey: keyof Pick<BasicInfo, 'emailPrefix' | 'phonePrefix' | 'locationPrefix' | 'agePrefix'>,
    valueKey: keyof Pick<BasicInfo, 'email' | 'phone' | 'location' | 'age'>,
    placeholder?: string,
  ) => (
    <div className={styles.field}>
      <label>{label}</label>
      <div className={styles.prefixedField}>
        <Input
          className={styles.prefixInput}
          value={basic[prefixKey] || ''}
          placeholder="前缀"
          onChange={e => dispatch(updateBasicInfo({ [prefixKey]: e.target.value }))}
        />
        <Input
          value={basic[valueKey] || ''}
          placeholder={placeholder}
          onChange={e => dispatch(updateBasicInfo({ [valueKey]: e.target.value }))}
        />
      </div>
    </div>
  )

  const renderSection = () => {
    if (activeSection === 'basic') return (
      <div className={styles.panel}>
        <div className={styles.sectionTitle}>基本信息</div>
        <div className={styles.field}>
          <label>头像</label>
          <div className={styles.avatarUpload} onClick={() => fileRef.current?.click()}>
            {basic.photo
              ? <img src={basic.photo} alt="avatar" className={styles.avatarImg} />
              : <span className={styles.avatarPlaceholder}>点击上传</span>
            }
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhoto} />
        </div>
        <div className={styles.field}><label>姓名</label><Input value={basic.name} onChange={e => dispatch(updateBasicInfo({ name: e.target.value }))} /></div>
        <div className={styles.field}><label>职位</label><Input value={basic.title} onChange={e => dispatch(updateBasicInfo({ title: e.target.value }))} /></div>
        {renderBasicContactField('邮箱', 'emailPrefix', 'email', 'zhangsan@example.com')}
        {renderBasicContactField('电话', 'phonePrefix', 'phone', '138-0000-0000')}
        {renderBasicContactField('所在地', 'locationPrefix', 'location', '北京')}
        {renderBasicContactField('年龄', 'agePrefix', 'age', '例如：24')}
      </div>
    )

    if (activeSection === 'education') return (
      <div className={styles.panel}>
        <div className={styles.sectionTitle}>教育背景</div>
        {education.map(edu => (
          <div key={edu.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <span>{edu.school || '新学校'}</span>
              <button className={styles.deleteBtn} onClick={() => dispatch(removeEducation(edu.id))}><DeleteOutlined /></button>
            </div>
            <div className={styles.field}><label>学校</label><Input value={edu.school} onChange={e => dispatch(updateEducation({ id: edu.id, data: { school: e.target.value } }))} /></div>
            <div className={styles.field}><label>专业</label><Input value={edu.major} onChange={e => dispatch(updateEducation({ id: edu.id, data: { major: e.target.value } }))} /></div>
            <div className={styles.field}><label>学历</label><Input value={edu.degree} onChange={e => dispatch(updateEducation({ id: edu.id, data: { degree: e.target.value } }))} /></div>
            <div className={styles.row}>
              <div className={styles.field}><label>开始</label><Input value={edu.startDate} onChange={e => dispatch(updateEducation({ id: edu.id, data: { startDate: e.target.value } }))} placeholder="2020.09" /></div>
              <div className={styles.field}><label>结束</label><Input value={edu.endDate} onChange={e => dispatch(updateEducation({ id: edu.id, data: { endDate: e.target.value } }))} placeholder="2024.06" /></div>
            </div>
            <div className={styles.field}>
              <label>主修课程</label>
              <TextArea rows={2} value={edu.courses || ''} onChange={e => dispatch(updateEducation({ id: edu.id, data: { courses: e.target.value } }))} placeholder="数据结构、计算机网络、操作系统" />
              <Button type="link" size="small" icon={<SignatureOutlined />} className={styles.polishBtn} onClick={() => openPolishModal(edu.courses || '', '主修课程', val => dispatch(updateEducation({ id: edu.id, data: { courses: val } })))}>AI 润色</Button>
            </div>
          </div>
        ))}
        <Button icon={<PlusOutlined />} block onClick={() => dispatch(addEducation({ school: '', major: '', degree: '', startDate: '', endDate: '' }))}>添加教育经历</Button>
      </div>
    )

    if (activeSection === 'experience') return (
      <div className={styles.panel}>
        <div className={styles.sectionTitle}>工作经历</div>
        {experience.map(exp => (
          <div key={exp.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <span>{exp.company || '新公司'}</span>
              <button className={styles.deleteBtn} onClick={() => dispatch(removeExperience(exp.id))}><DeleteOutlined /></button>
            </div>
            <div className={styles.field}><label>公司</label><Input value={exp.company} onChange={e => dispatch(updateExperience({ id: exp.id, data: { company: e.target.value } }))} /></div>
            <div className={styles.field}><label>职位</label><Input value={exp.position} onChange={e => dispatch(updateExperience({ id: exp.id, data: { position: e.target.value } }))} /></div>
            <div className={styles.field}><label>时间</label><Input value={exp.date} onChange={e => dispatch(updateExperience({ id: exp.id, data: { date: e.target.value } }))} placeholder="2022.07 - 至今" /></div>
            <div className={styles.field}>
              <label>描述</label>
              <TextArea rows={4} value={exp.details} onChange={e => dispatch(updateExperience({ id: exp.id, data: { details: e.target.value } }))} placeholder="支持 Markdown 语法" />
              <Button type="link" size="small" icon={<SignatureOutlined />} className={styles.polishBtn} onClick={() => openPolishModal(exp.details, '工作经历描述', val => dispatch(updateExperience({ id: exp.id, data: { details: val } })))}>AI 润色</Button>
            </div>
          </div>
        ))}
        <Button icon={<PlusOutlined />} block onClick={() => dispatch(addExperience({ company: '', position: '', date: '', details: '' }))}>添加工作经历</Button>
      </div>
    )

    if (activeSection === 'projects') return (
      <div className={styles.panel}>
        <div className={styles.sectionTitle}>项目经历</div>
        {projects.map(proj => (
          <div key={proj.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <span>{proj.name || '新项目'}</span>
              <button className={styles.deleteBtn} onClick={() => dispatch(removeProject(proj.id))}><DeleteOutlined /></button>
            </div>
            <div className={styles.field}><label>项目名</label><Input value={proj.name} onChange={e => dispatch(updateProject({ id: proj.id, data: { name: e.target.value } }))} /></div>
            <div className={styles.field}><label>角色</label><Input value={proj.role} onChange={e => dispatch(updateProject({ id: proj.id, data: { role: e.target.value } }))} /></div>
            <div className={styles.field}><label>链接名称</label><Input value={proj.linkLabel || ''} onChange={e => dispatch(updateProject({ id: proj.id, data: { linkLabel: e.target.value } }))} placeholder="例如：GitHub" /></div>
            <div className={styles.field}><label>项目链接</label><Input value={proj.link || ''} onChange={e => dispatch(updateProject({ id: proj.id, data: { link: e.target.value } }))} placeholder="github.com/username/project" /></div>
            <div className={styles.field}><label>时间</label><Input value={proj.date} onChange={e => dispatch(updateProject({ id: proj.id, data: { date: e.target.value } }))} /></div>
            <div className={styles.field}>
              <label>描述</label>
              <TextArea rows={4} value={proj.description} onChange={e => dispatch(updateProject({ id: proj.id, data: { description: e.target.value } }))} placeholder="支持 Markdown 语法" />
              <Button type="link" size="small" icon={<SignatureOutlined />} className={styles.polishBtn} onClick={() => openPolishModal(proj.description, '项目描述', val => dispatch(updateProject({ id: proj.id, data: { description: val } })))}>AI 润色</Button>
            </div>
          </div>
        ))}
        <Button icon={<PlusOutlined />} block onClick={() => dispatch(addProject({ name: '', role: '', date: '', description: '', link: '', linkLabel: '', visible: true }))}>添加项目经历</Button>
      </div>
    )

    if (activeSection === 'skills') return (
      <div className={styles.panel}>
        <div className={styles.sectionTitle}>专业技能</div>
        <div className={styles.field}>
          <label>技能描述</label>
          <TextArea rows={6} value={skillContent} onChange={e => dispatch(updateSkillContent(e.target.value))} placeholder="支持 Markdown 语法" />
          <Button type="link" size="small" icon={<SignatureOutlined />} className={styles.polishBtn} onClick={() => openPolishModal(skillContent, '专业技能', val => dispatch(updateSkillContent(val)))}>AI 润色</Button>
        </div>
      </div>
    )

    if (activeSection === 'selfEvaluation') return (
      <div className={styles.panel}>
        <div className={styles.sectionTitle}>自我评价</div>
        <div className={styles.field}>
          <label>自我评价</label>
          <TextArea rows={6} value={selfEvaluationContent} onChange={e => dispatch(updateSelfEvaluation(e.target.value))} placeholder="支持 Markdown 语法" />
          <Button type="link" size="small" icon={<SignatureOutlined />} className={styles.polishBtn} onClick={() => openPolishModal(selfEvaluationContent, '自我评价', val => dispatch(updateSelfEvaluation(val)))}>AI 润色</Button>
        </div>
      </div>
    )

    return null
  }

  return (
    <>
      {renderSection()}
      <AIPolishModal
        open={polishModal.open}
        content={polishModal.content}
        fieldType={polishModal.fieldType}
        onClose={closePolishModal}
        onApply={applyPolishedContent}
      />
    </>
  )
}

export default EditPanel
