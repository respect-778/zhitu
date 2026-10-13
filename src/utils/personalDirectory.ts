import { directoryHandleStore, type PersonalDirectoryHandle } from './directoryHandleStore'
import { buildBackupPlan, contentHash, type BackupKind, type BackupSnapshot } from './personalDirectoryPlan'

type DirectoryPhase = 'unconfigured' | 'checking' | 'permission' | 'pending' | 'writing' | 'saved' | 'conflict' | 'error'
export interface ModuleDirectoryStatus { saved: boolean; confirmed: boolean; revision: number | null; conflict: boolean }
export interface DirectoryStatus {
  supported: boolean; userId: string; name: string; phase: DirectoryPhase; message: string; lastSavedAt: string
  modules: Partial<Record<BackupKind, ModuleDirectoryStatus>>
}
interface HandleStore {
  get(uid: string): Promise<PersonalDirectoryHandle | undefined>
  put(uid: string, handle: PersonalDirectoryHandle): Promise<void>
  remove(uid: string): Promise<void>
}

async function directoryAt(root: FileSystemDirectoryHandle, path: string[]) {
  let folder = root
  for (const segment of path) folder = await folder.getDirectoryHandle(segment, { create: true })
  return folder
}
async function readText(folder: FileSystemDirectoryHandle, name: string): Promise<string | undefined> {
  try { return await (await (await folder.getFileHandle(name)).getFile()).text() } catch (error) {
    if ((error as DOMException).name === 'NotFoundError') return undefined
    throw error
  }
}
async function writeText(folder: FileSystemDirectoryHandle, name: string, content: string) {
  const handle = await folder.getFileHandle(name, { create: true })
  const stream = await handle.createWritable()
  try { await stream.write(content); await stream.close() } catch (error) { await stream.abort().catch(() => {}); throw error }
}

/** 写单个模块快照；遇到用户改动保留原文件，另存平台副本。绝不删除文件。 */
export async function writeBackup(root: PersonalDirectoryHandle, uid: string, kind: BackupKind, snapshot: BackupSnapshot, stillCurrent = () => true): Promise<boolean> {
  const plan = await buildBackupPlan(uid, kind, snapshot)
  const manifestFolder = await directoryAt(root, plan[0].path.slice(0, -1))
  const manifestName = '.knowvia-manifest.json'
  let hashes: Record<string, string> = {}
  try { const text = await readText(manifestFolder, manifestName); hashes = text ? JSON.parse(text).hashes || {} : {} } catch { /* 损坏的清单不会授权覆盖原文件。 */ }
  hashes = { ...hashes }
  let conflict = false
  for (const file of plan) {
    if (!stillCurrent()) return conflict
    const folder = await directoryAt(root, file.path.slice(0, -1))
    const originalName = file.path.at(-1)!
    let name = originalName
    let key = file.path.join('/')
    let existing = await readText(folder, name)
    const nextHash = await contentHash(file.content)
    if (existing !== undefined && existing !== file.content && await contentHash(existing) !== hashes[key]) {
      conflict = true
      const dot = name.lastIndexOf('.')
      name = `${name.slice(0, dot)}--平台副本${name.slice(dot)}`
      key = [...file.path.slice(0, -1), name].join('/')
      existing = await readText(folder, name)
      if (existing !== undefined && existing !== file.content && await contentHash(existing) !== hashes[key]) {
        name = `${name.slice(0, name.lastIndexOf('.'))}--${nextHash.slice(0, 12)}${name.slice(name.lastIndexOf('.'))}`
        key = [...file.path.slice(0, -1), name].join('/')
        existing = await readText(folder, name)
        if (existing !== undefined && existing !== file.content) throw new Error('平台副本也被修改，请更换备份目录')
      }
    }
    if (!stillCurrent()) return conflict
    if (existing !== file.content) await writeText(folder, name, file.content)
    hashes[key] = nextHash
  }
  if (stillCurrent()) await writeText(manifestFolder, manifestName, JSON.stringify({ schemaVersion: 1, hashes }, null, 2))
  return conflict
}

export class PersonalDirectory {
  private uid = ''
  private epoch = 0
  private handle?: PersonalDirectoryHandle
  private snapshots = new Map<BackupKind, { snapshot: BackupSnapshot; signature: string }>()
  private written = new Map<BackupKind, string>()
  private conflicts = new Map<BackupKind, boolean>()
  private listeners = new Set<() => void>()
  private timer?: ReturnType<typeof setTimeout>
  private running?: Promise<void>
  private status: DirectoryStatus
  private handles: HandleStore
  private picker?: () => Promise<PersonalDirectoryHandle>
  private delay: number
  constructor(handles: HandleStore, picker?: () => Promise<PersonalDirectoryHandle>, delay = 800) {
    this.handles = handles; this.picker = picker; this.delay = delay
    this.status = { supported: !!picker, userId: '', name: '', phase: 'unconfigured', message: '', lastSavedAt: '', modules: {} }
  }
  getStatus = () => this.status
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  private setStatus(update: Partial<DirectoryStatus>) {
    const modules: DirectoryStatus['modules'] = {}
    for (const [kind, job] of this.snapshots) {
      modules[kind] = {
        saved: !!this.handle && this.written.get(kind) === job.signature,
        confirmed: job.snapshot.confirmed,
        revision: job.snapshot.revision,
        conflict: this.conflicts.get(kind) || false,
      }
    }
    this.status = { ...this.status, ...update, modules }
    this.listeners.forEach(listener => listener())
  }
  async activate(uid: string) {
    if (uid === this.uid) return
    this.uid = uid
    const epoch = ++this.epoch
    this.handle = undefined
    this.snapshots.clear(); this.written.clear(); this.conflicts.clear()
    if (this.timer) clearTimeout(this.timer)
    this.setStatus({ userId: uid, name: '', phase: 'unconfigured', message: '', lastSavedAt: '' })
    if (!uid || !this.picker) return
    this.setStatus({ phase: 'checking' })
    try {
      const handle = await this.handles.get(uid)
      if (epoch !== this.epoch) return
      this.handle = handle
      if (!handle) { this.setStatus({ phase: 'unconfigured' }); return }
      const permission = await handle.queryPermission({ mode: 'readwrite' })
      if (epoch !== this.epoch) return
      this.setStatus({ name: handle.name, phase: permission === 'granted' ? 'pending' : 'permission', message: '' })
      if (permission === 'granted') this.schedule()
    } catch { if (epoch === this.epoch) this.setStatus({ phase: 'error', message: '无法恢复目录配置，请重新选择目录' }) }
  }
  async choose() {
    if (!this.picker || !this.uid) return
    const uid = this.uid, epoch = this.epoch
    // 选择框必须直接由点击触发，前面不能等待 IndexedDB。
    try {
      const handle = await this.picker()
      if (epoch !== this.epoch) return
      if (await handle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
        this.setStatus({ phase: 'permission', message: '请选择允许读写的目录' }); return
      }
      await this.handles.put(uid, handle)
      if (epoch !== this.epoch) return
      this.handle = handle; this.epoch++; this.written.clear(); this.conflicts.clear()
      this.setStatus({ name: handle.name, phase: 'pending', message: '' })
      this.schedule()
    } catch (error) {
      if (epoch === this.epoch && (error as DOMException).name !== 'AbortError') this.setStatus({ phase: 'error', message: '目录选择失败，服务器保存不受影响' })
    }
  }
  async authorize() {
    const epoch = this.epoch
    if (!this.handle) return
    try {
      const permission = await this.handle.requestPermission({ mode: 'readwrite' })
      if (epoch !== this.epoch) return
      this.setStatus({ phase: permission === 'granted' ? 'pending' : 'permission', message: '' })
      if (permission === 'granted') this.schedule()
    } catch { if (epoch === this.epoch) this.setStatus({ phase: 'permission', message: '未取得目录写入权限' }) }
  }
  async disconnect() {
    const uid = this.uid, epoch = this.epoch
    await this.handles.remove(uid)
    if (epoch !== this.epoch) return
    this.epoch++; this.handle = undefined; this.written.clear(); this.conflicts.clear()
    if (this.timer) clearTimeout(this.timer)
    this.setStatus({ name: '', phase: 'unconfigured', message: '', lastSavedAt: '' })
  }
  publish(uid: string, kind: BackupKind, snapshot: BackupSnapshot) {
    if (uid !== this.uid || !uid) return
    const signature = JSON.stringify(snapshot)
    if (this.snapshots.get(kind)?.signature === signature) return
    this.snapshots.set(kind, { snapshot: JSON.parse(signature), signature })
    // 新版本一出现就通知界面撤销旧成功提示，不能等到延迟写入时才更新。
    this.setStatus({ phase: this.handle && ['saved', 'conflict', 'pending'].includes(this.status.phase) ? 'pending' : this.status.phase })
    this.schedule()
  }
  private schedule() {
    if (!this.handle || this.status.phase === 'permission') return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => { void this.flush() }, this.delay)
  }
  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    if (this.running) return this.running
    if (!this.handle || !this.uid) return Promise.resolve()
    const handle = this.handle, uid = this.uid, epoch = this.epoch
    const current = () => epoch === this.epoch && handle === this.handle && uid === this.uid
    this.running = (async () => {
      if (await handle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
        if (current()) this.setStatus({ phase: 'permission', message: '请点击重新授权后继续保存本地副本' })
        return
      }
      while (current()) {
        const pending = [...this.snapshots.entries()].find(([kind, job]) => this.written.get(kind) !== job.signature)
        if (!pending) break
        const [kind, job] = pending
        this.setStatus({ phase: 'writing', message: '' })
        const conflict = await writeBackup(handle, uid, kind, job.snapshot, current)
        if (current()) { this.written.set(kind, job.signature); this.conflicts.set(kind, conflict) }
      }
      const conflict = [...this.conflicts.values()].some(Boolean)
      if (current()) this.setStatus({ phase: conflict ? 'conflict' : 'saved', message: conflict ? '发现电脑文件被手工修改，已保留原文件并另存平台副本' : '', lastSavedAt: new Date().toLocaleTimeString() })
    })().catch(error => {
      if (current()) this.setStatus({ phase: (error as DOMException).name === 'NotAllowedError' ? 'permission' : 'error', message: '本地副本保存失败，服务器保存不受影响，可重新尝试' })
    }).finally(() => {
      this.running = undefined
      // 绑定变更期间的新快照要在旧任务结束后接着写。
      if (!current() && this.handle) this.schedule()
    })
    return this.running
  }
}

const browser = window as Window & { showDirectoryPicker?: (options: { mode: 'readwrite'; id: string }) => Promise<PersonalDirectoryHandle> }
export const personalDirectory = new PersonalDirectory(directoryHandleStore,
  browser.showDirectoryPicker && window.isSecureContext ? () => browser.showDirectoryPicker!({ mode: 'readwrite', id: 'knowvia-personal-files' }) : undefined)
