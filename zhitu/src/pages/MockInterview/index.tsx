import { useEffect, useState } from 'react'
import styles from './index.module.less'

const INTERVIEW_PATH = '/mock-interview'

export default function InterviewPortal() {
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12_000)
    async function connect() {
      try {
        const response = await fetch(`${INTERVIEW_PATH}/api/health`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        const body: unknown = await response.json()
        if (
          !response.ok ||
          !body ||
          typeof body !== 'object' ||
          !('ok' in body) ||
          body.ok !== true
        ) {
          throw new Error('Interview service unavailable')
        }
        if (!cancelled) setStatus('ready')
      } catch {
        if (!cancelled) setStatus('error')
      } finally {
        clearTimeout(timeout)
      }
    }
    void connect()
    return () => {
      cancelled = true
      clearTimeout(timeout)
      controller.abort()
    }
  }, [attempt])

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        {status === 'ready' ? (
          <iframe
            className={styles.frame}
            src={`${INTERVIEW_PATH}/setup`}
            title="模拟面试练习"
            allow="microphone; autoplay"
          />
        ) : (
          <div
            className={styles.status}
            role={status === 'error' ? 'alert' : 'status'}
          >
            <h2>
              {status === 'error'
                ? '暂时无法连接模拟面试'
                : '正在准备模拟面试…'}
            </h2>
            {status === 'error' && (
              <>
                <p>请稍后重试，或联系管理员。</p>
                <button
                  type="button"
                  onClick={() => { setStatus('loading'); setAttempt((value) => value + 1) }}
                >
                  重新连接
                </button>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
