import { useSyncExternalStore } from 'react'
import { useAppSelector } from '@/store/hooks'
import { personalDirectory } from '@/utils/personalDirectory'
import { personalSaveNotice } from '@/utils/personalSaveNotice'
import type { BackupKind } from '@/utils/personalDirectoryPlan'

export default function PersonalSaveStatus({ kind }: { kind: BackupKind }) {
  const uid = useAppSelector(state => state.user.userId)
  const cloud = useAppSelector(state => kind === 'workspace' ? state.path : state.resume)
  const directory = useSyncExternalStore(personalDirectory.subscribe, personalDirectory.getStatus)
  if (!uid || cloud.storageUserId !== uid || directory.userId !== uid) return null
  const notice = personalSaveNotice(directory, kind, cloud.syncStatus, cloud.revision)
  const color = notice.tone === 'success' ? '#389e0d' : notice.tone === 'warning' ? '#ad6800' : 'var(--text-secondary)'
  return <span role="status" aria-label={kind === 'workspace' ? '学习规划保存状态' : '简历保存状态'} aria-live="polite"
    title={cloud.syncError || directory.message} data-save-tone={notice.tone}
    style={{ display: 'inline-block', minWidth: 132, color, whiteSpace: 'nowrap' }}>{notice.text}</span>
}
