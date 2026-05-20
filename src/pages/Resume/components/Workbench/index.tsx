import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { loadUserResumes, setActiveResume } from '@/store/modules/resumeStore'
import EditorHeader from '../EditorHeader'
import LeftPanel from '../LeftPanel'
import EditPanel from '../EditPanel'
import PreviewPanel from '../PreviewPanel'
import styles from './index.module.less'

const Workbench: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const userId = useAppSelector(s => s.user.userId)
  const resumes = useAppSelector(s => s.resume.resumes)
  const resumeStorageUserId = useAppSelector(s => s.resume.storageUserId)
  const resume = resumeStorageUserId === userId ? resumes.find(r => r.id === id) : undefined
  const previewRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)

  // 直接打开编辑页时，也要先加载当前用户自己的简历列表。
  useEffect(() => {
    if (userId && resumeStorageUserId !== userId) {
      dispatch(loadUserResumes(userId))
    }
  }, [dispatch, userId, resumeStorageUserId])

  // 当前用户没有这份简历时，回到简历列表页。
  useEffect(() => {
    if (!id) return
    if (!userId || resumeStorageUserId !== userId) return
    if (!resume) { navigate('/resume'); return }
    dispatch(setActiveResume(id))
  }, [id, userId, resumeStorageUserId, resume, dispatch, navigate])

  const handleExport = async () => {
    if (!previewRef.current) return
    setExporting(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(previewRef.current, { scale: 2, useCORS: true, backgroundColor: '#fff' })
      const link = document.createElement('a')
      link.download = `${resume?.title || '简历'}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (e) {
      console.error(e)
    } finally {
      setExporting(false)
    }
  }

  if (!resume) return null

  return (
    <div className={styles.workbench}>
      <EditorHeader onExport={handleExport} exporting={exporting} />
      <div className={styles.body}>
        <div className={styles.side}>
          <LeftPanel />
        </div>
        <div className={styles.edit}>
          <EditPanel />
        </div>
        <div className={styles.preview}>
          <PreviewPanel resume={resume} previewRef={previewRef} />
        </div>
      </div>
    </div>
  )
}

export default Workbench
