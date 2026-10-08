export type WorkspaceSyncStatus = 'loading' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict'

export interface SaveSnapshot<Data> {
  data: Data | null
  revision: number
}

export interface SaveState<Data> {
  revision: number | null
  pending: Data | null
  savedData: Data | null
  status: WorkspaceSyncStatus
  message: string
  current?: SaveSnapshot<Data>
}

interface SaveJob<Data> extends SaveState<Data> {
  sequence: number
  timer?: ReturnType<typeof setTimeout>
  running?: Promise<void>
  flushRequested?: boolean
  keepaliveRequested?: boolean
}

export class WorkspaceSaveQueue<Data> {
  private jobs = new Map<string, SaveJob<Data>>()
  private send: (userId: string, data: Data, revision: number, keepalive: boolean) => Promise<SaveSnapshot<Data>>
  private onChange: (userId: string, state: SaveState<Data>) => void
  private delay: number

  constructor(
    send: (userId: string, data: Data, revision: number, keepalive: boolean) => Promise<SaveSnapshot<Data>>,
    onChange: (userId: string, state: SaveState<Data>) => void,
    delay = 1500,
  ) { this.send = send; this.onChange = onChange; this.delay = delay }

  peek(userId: string): SaveState<Data> | undefined {
    const job = this.jobs.get(userId)
    if (!job) return undefined
    return { revision: job.revision, pending: job.pending, savedData: job.savedData, status: job.status, message: job.message, current: job.current }
  }

  initialize(userId: string, snapshot: SaveSnapshot<Data>, draft?: { data: Data; revision: number | null }) {
    let job = this.jobs.get(userId)
    if (job?.running || (job?.revision !== null && job?.revision !== undefined && snapshot.revision < job.revision)) return
    if (!job) {
      job = { revision: snapshot.revision, pending: null, savedData: snapshot.data, sequence: 0, status: 'saved', message: '' }
      this.jobs.set(userId, job)
    }
    if (draft && !job.pending) {
      job.pending = draft.data
      job.revision = draft.revision
      job.sequence++
    }
    if (job.pending) {
      if (job.revision !== snapshot.revision) {
        if (job.timer) clearTimeout(job.timer)
        job.status = 'conflict'
        job.current = snapshot
        job.message = '工作区已更新，本地修改已保留，请保留为副本后更新'
        this.onChange(userId, this.peek(userId)!)
      } else {
        job.status = 'pending'
        job.message = ''
        this.onChange(userId, this.peek(userId)!)
        this.schedule(userId, job)
      }
    } else {
      job.revision = snapshot.revision
      job.savedData = snapshot.data
      job.status = 'saved'
      job.message = ''
      job.current = undefined
      this.onChange(userId, this.peek(userId)!)
    }
  }

  enqueue(userId: string, data: Data, revision: number | null) {
    let job = this.jobs.get(userId)
    if (!job) {
      job = { revision, pending: null, savedData: null, status: 'pending', message: '', sequence: 0 }
      this.jobs.set(userId, job)
    }
    job.pending = data
    job.sequence++
    if (job.status !== 'conflict') {
      job.status = job.revision === null ? 'error' : (job.running ? 'saving' : 'pending')
      job.message = job.revision === null ? '尚未取得工作区版本，本地修改已保留，请重试加载' : ''
    }
    this.onChange(userId, this.peek(userId)!)
    if (job.status === 'pending') this.schedule(userId, job)
  }

  private schedule(userId: string, job: SaveJob<Data>) {
    if (job.timer) clearTimeout(job.timer)
    job.timer = setTimeout(() => { void this.flush(userId) }, this.delay)
  }

  flush(userId: string, keepalive = false): Promise<void> {
    const job = this.jobs.get(userId)
    if (!job) return Promise.resolve()
    if (job.timer) clearTimeout(job.timer)
    if (job.running) {
      job.flushRequested = true
      job.keepaliveRequested = job.keepaliveRequested || keepalive
      return job.running
    }
    if (!job.pending || job.status === 'conflict' || job.revision === null) return Promise.resolve()
    const data = job.pending
    const revision = job.revision
    const sequence = job.sequence
    job.status = 'saving'
    job.message = ''
    this.onChange(userId, this.peek(userId)!)
    job.running = Promise.resolve().then(() => this.send(userId, data, revision, keepalive)).then(snapshot => {
      job.revision = snapshot.revision
      job.savedData = snapshot.data
      if (job.sequence === sequence) job.pending = null
      job.status = job.pending ? 'pending' : 'saved'
      job.message = ''
    }).catch((error: unknown) => {
      const failure = error as { response?: { status?: number; data?: { message?: string; current?: SaveSnapshot<Data> } }; message?: string }
      job.status = failure.response?.status === 409 ? 'conflict' : 'error'
      job.current = failure.response?.data?.current
      job.message = failure.response?.data?.message || '保存失败，本地修改已保留，可重新尝试同步'
    }).finally(() => {
      job.running = undefined
      this.onChange(userId, this.peek(userId)!)
      if (job.status === 'pending') {
        if (job.flushRequested) {
          const tailKeepalive = !!job.keepaliveRequested
          job.flushRequested = false
          job.keepaliveRequested = false
          return this.flush(userId, tailKeepalive)
        }
        this.schedule(userId, job)
      }
    })
    return job.running
  }

  replaceBaseline(userId: string, snapshot: SaveSnapshot<Data>) {
    const job = this.jobs.get(userId)
    if (job?.running) throw new Error('请等待当前保存结束')
    if (job?.timer) clearTimeout(job.timer)
    this.jobs.delete(userId)
    this.initialize(userId, snapshot)
  }
}
