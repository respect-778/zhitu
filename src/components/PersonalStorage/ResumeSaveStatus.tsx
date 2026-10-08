import { useEffect } from 'react'
import { Button, message } from 'antd'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { flushResumes, loadUserResumes, recoverResumes } from '@/store/modules/resumeStore'
import PersonalSaveStatus from './PersonalSaveStatus'

export default function ResumeSaveStatus() {
  const dispatch = useAppDispatch()
  const uid = useAppSelector(state => state.user.userId)
  const resume = useAppSelector(state => state.resume)
  useEffect(() => {
    if (!uid) return
    const unload = () => { void flushResumes(true) }
    const focus = () => { void dispatch(loadUserResumes(uid)) }
    window.addEventListener('pagehide', unload)
    window.addEventListener('focus', focus)
    return () => { window.removeEventListener('pagehide', unload); window.removeEventListener('focus', focus); void flushResumes() }
  }, [uid, dispatch])
  if (!uid || uid !== resume.storageUserId) return null
  const recover = () => { void dispatch(recoverResumes(uid)).unwrap().catch(error => message.error(error.message || '恢复失败，草稿仍保留')) }
  return <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12 }}>
    <PersonalSaveStatus kind="resumes" />
    {(resume.syncStatus === 'error' || resume.syncStatus === 'conflict') && <Button size="small" onClick={recover}>{resume.syncStatus === 'conflict' ? '保留副本并更新' : '重试同步'}</Button>}
  </div>
}
