import { useEffect, useRef, useState } from 'react'
import { autofillProfiles } from '@/utils/jobApplication/autofillProfiles'
import { assertEmailResumeCurrent, emailProviders, getEmailReceipt, sendEmailApplication, type EmailApplication, type EmailReceipt } from '@/api/jobApplication/emailApplications'
import styles from '@/pages/JobApplication/components/OfficialAutofillAction/index.module.less'

export default function EmailApplicationPanel({ applications, onBusyChange }: { applications: EmailApplication[]; onBusyChange: (busy: boolean) => void }) {
  const [drafts, setDrafts] = useState(applications)
  const [provider, setProvider] = useState('qq')
  const [account, setAccount] = useState('')
  const [authorizationCode, setAuthorizationCode] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [receipts, setReceipts] = useState<Record<string, EmailReceipt>>({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [stale, setStale] = useState(false)
  const sending = useRef(false)
  useEffect(() => {
    setDrafts(applications); setReceipts({}); setAttachment(null); setStale(false)
    return autofillProfiles().subscribe(() => {
      try { applications.forEach(assertEmailResumeCurrent) }
      catch { setStale(true); setDrafts([]); setReceipts({}); setAccount(''); setAuthorizationCode(''); setAttachment(null); setMessage('简历或账号已变更，请重新生成邮件。') }
    })
  }, [applications])
  function edit(index: number, key: 'subject' | 'body', value: string) {
    setDrafts(previous => previous.map((draft, at) => at === index ? { ...draft, [key]: value } : draft))
  }
  async function send(draft: EmailApplication) {
    if (sending.current) return
    if (!account || !authorizationCode || !attachment) { setMessage('请填写发件邮箱、SMTP客户端授权码，并选择当前简历附件。'); return }
    sending.current = true; setBusy(true); onBusyChange(true); setMessage('')
    try {
      const result = await sendEmailApplication(draft, provider, account, authorizationCode, attachment)
      setReceipts(previous => ({ ...previous, [draft.operationId]: result }))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '邮件发送结果待确认，请查询发送结果。')
    } finally { sending.current = false; setBusy(false); onBusyChange(false); setAuthorizationCode('') }
  }
  async function query(draft: EmailApplication) {
    try {
      const receipt = await getEmailReceipt(draft.operationId)
      setReceipts(previous => ({ ...previous, [draft.operationId]: receipt }))
    } catch (error) { setMessage(error instanceof Error ? error.message : '发送状态暂不可用。') }
  }
  if (stale) return <p role="status">简历或账号已变更，请重新生成邮件。</p>
  return <section className={styles.emailPanel} aria-label="邮箱投递">
    <h3>邮箱投递</h3>
    <p>使用 {applications[0]?.resumeTitle}。请附上当前版本的 PDF 或 Word 文件，核对邮件后发送。</p>
    <div className={styles.emailAccount}>
      <label>发件服务 <select value={provider} disabled={busy || stale} onChange={event => setProvider(event.target.value)}>{emailProviders.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label>发件邮箱 <input type="email" value={account} disabled={busy || stale} onChange={event => setAccount(event.target.value)} autoComplete="off" /></label>
      <label>SMTP客户端授权码 <input type="password" value={authorizationCode} disabled={busy || stale} onChange={event => setAuthorizationCode(event.target.value)} autoComplete="new-password" /></label>
      <label>当前简历附件 <input type="file" accept=".pdf,.doc,.docx" disabled={busy || stale} onChange={event => setAttachment(event.target.files?.[0] || null)} /></label>
    </div>
    {message && <p role="status">{message}</p>}
    {drafts.map((draft, index) => {
      const receipt = receipts[draft.operationId]
      const locked = busy || stale || Boolean(receipt)
      return <article key={draft.operationId} className={styles.emailDraft}>
        <h4>{draft.job.company} · {draft.job.title}</h4>
        <p>收件人 {draft.channel.recipient} · <a href={`${draft.channel.origin}${draft.channel.pathname}`} target="_blank" rel="noreferrer">官网邮箱依据</a></p>
        <label>邮件主题 <input value={draft.subject} disabled={locked} onChange={event => edit(index, 'subject', event.target.value)} maxLength={250} /></label>
        <label>邮件正文 <textarea value={draft.body} disabled={locked} onChange={event => edit(index, 'body', event.target.value)} maxLength={16000} rows={7} /></label>
        <button type="button" disabled={locked} onClick={() => { void send(draft) }}>发送邮件</button>
        {receipt && <><p role="status">{receipt.message}</p><button type="button" disabled={busy} onClick={() => { void query(draft) }}>查询发送结果</button></>}
        {receipt?.state === 'failed' && <button type="button" disabled={busy || stale} onClick={() => setDrafts(previous => previous.map(item => item.operationId === draft.operationId ? { ...item, operationId: crypto.randomUUID() } : item))}>准备重新发送</button>}
      </article>
    })}
  </section>
}
