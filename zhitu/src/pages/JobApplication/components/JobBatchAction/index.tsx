import { useRef, useState } from 'react'
import { requestJobAction, type JobActionRequest, type JobActionSelection } from '@/api/jobApplication/jobActions'
import styles from '@/pages/JobApplication/index.module.less'

export default function JobBatchAction({ action, selection, disabled, selecting, selectedCount, onStart, onCancel }: {
  action: JobActionRequest['action']
  selection: () => JobActionSelection
  disabled: boolean
  selecting: boolean
  selectedCount: number
  onStart: () => void
  onCancel: () => void
}) {
  const pending = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  async function submit() {
    if (pending.current) return
    if (!selecting) {
      setMessage('')
      onStart()
      return
    }
    if (selectedCount === 0) return
    pending.current = true
    setSubmitting(true)
    try {
      const result = await requestJobAction({ version: 1, operationId: crypto.randomUUID(), action, selection: selection() })
      setMessage(result.status === 'blocked' ? result.message : '任务已创建，可在工作台查看进度。')
      onCancel()
    } catch { setMessage('暂时无法发起操作，请稍后重试。') }
    finally { pending.current = false; setSubmitting(false) }
  }
  return <div className={styles.batchAction}>
    <div className={styles.batchControls}>
      <button type="button" className={styles.batchButton} disabled={disabled || submitting || (selecting && selectedCount === 0)} onClick={() => { void submit() }}>{action === 'greet' ? '一键打招呼' : '一键投递'}</button>
      {selecting && <>
        <span className={styles.selectionCount} aria-live="polite">已选 {selectedCount} 个岗位</span>
        <button type="button" className={styles.cancelSelection} disabled={submitting} onClick={() => { setMessage(''); onCancel() }}>取消选择</button>
      </>}
    </div>
    {message && <p role="status">{message}</p>}
  </div>
}
