import { useEffect, useRef, useSyncExternalStore } from 'react'
import { message } from 'antd'
import { useAppSelector } from '@/store/hooks'
import { personalDirectory } from '@/utils/personalDirectory'
import { personalSaveNotice } from '@/utils/personalSaveNotice'
import type { BackupKind } from '@/utils/personalDirectoryPlan'

export default function PersonalSaveStatus({ kind, notifyUnconfigured = false }: { kind: BackupKind; notifyUnconfigured?: boolean }) {
  const [messageApi, messageContext] = message.useMessage()
  const uid = useAppSelector(state => state.user.userId)
  const cloud = useAppSelector(state => kind === 'workspace' ? state.path : state.resume)
  const directory = useSyncExternalStore(personalDirectory.subscribe, personalDirectory.getStatus)
  const notifiedKeyRef = useRef<string | null>(null)
  const ready = Boolean(uid && cloud.storageUserId === uid && directory.userId === uid)
  const warningKey = `personal-directory-unconfigured-${kind}-${uid ?? 'anonymous'}`

  useEffect(() => {
    const shouldNotify = notifyUnconfigured && ready && directory.supported && !directory.name && cloud.syncStatus !== 'loading'
    if (shouldNotify && notifiedKeyRef.current !== warningKey) {
      notifiedKeyRef.current = warningKey
      void messageApi.warning({
        key: warningKey,
        content: '未配置本地文件夹，学习规划暂不会保存本地副本',
        duration: 5,
      })
      return
    }
    if (ready && directory.name && notifiedKeyRef.current === warningKey) {
      messageApi.destroy(warningKey)
      notifiedKeyRef.current = null
    }
  }, [cloud.syncStatus, directory.name, directory.supported, messageApi, notifyUnconfigured, ready, warningKey])

  useEffect(() => () => { messageApi.destroy(warningKey) }, [messageApi, warningKey])

  if (!ready) return null
  const notice = personalSaveNotice(directory, kind, cloud.syncStatus, cloud.revision)
  const color = notice.tone === 'success' ? '#389e0d' : notice.tone === 'warning' ? '#ad6800' : 'var(--text-secondary)'
  return <>
    {messageContext}
    <span role="status" aria-label={kind === 'workspace' ? '学习规划保存状态' : '简历保存状态'} aria-live="polite"
      title={cloud.syncError || directory.message} data-save-tone={notice.tone}
      style={{ display: 'inline-block', minWidth: 132, color, whiteSpace: 'nowrap' }}>{notice.text}</span>
  </>
}
