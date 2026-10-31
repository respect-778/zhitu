export type BackupKind = 'workspace' | 'resumes'
export interface BackupSnapshot { data: unknown; revision: number | null; confirmed: boolean }
export interface BackupFile { path: string[]; content: string }

export class DirectoryLocationError extends Error {}

/** Segments below the selected handle; keep the account boundary at every entry level. */
export function backupRootSegments(uid: string, selectedName = ''): string[] {
  if (!/^\d+$/.test(uid)) throw new DirectoryLocationError('账号编号无效，无法创建个人目录')
  const account = `user-${uid}`, name = selectedName.toLowerCase()
  if (name === account) return []
  if (/^user-\d+$/.test(name)) throw new DirectoryLocationError(`所选文件夹属于其他账号，请选择 KNOWVIA 或当前账号的 ${account} 文件夹`)
  return name === 'knowvia' ? [account] : ['KNOWVIA', account]
}

export const contentHash = async (text: string) => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}
export function safeFileName(value: string): string {
  let name = value.replace(/[<>:"/\\|?*\p{Cc}]/gu, '_').trim().replace(/[. ]+$/, '').slice(0, 45)
  if (!name || /^\.+$/.test(name)) name = '未命名'
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = '_' + name
  return name
}
const namedId = async (name: string, id: string) => `${safeFileName(name)}--${(await contentHash(id)).slice(0, 16)}`

export async function buildBackupPlan(uid: string, kind: BackupKind, snapshot: BackupSnapshot): Promise<BackupFile[]> {
  const root = [...backupRootSegments(uid), kind === 'workspace' ? '学习规划' : '简历']
  const envelope = (data: unknown) => JSON.stringify({ schemaVersion: 1, userId: uid, kind, cloudRevision: snapshot.revision, cloudConfirmed: snapshot.confirmed, data }, null, 2)
  const files: BackupFile[] = [{ path: [...root, kind === 'workspace' ? 'workspace.json' : 'resumes.json'], content: envelope(snapshot.data) }]
  if (kind === 'resumes') {
    const data = snapshot.data as { resumes: { id: string; title: string }[] }
    for (const resume of data.resumes) files.push({ path: [...root, `${await namedId(resume.title, resume.id)}.json`], content: envelope(resume) })
  } else {
    type Note = { id: string; name: string; type: string; parentId: string | null; content?: string }
    const notes = (snapshot.data as { files: Note[] }).files
    const byId = new Map(notes.map(note => [note.id, note]))
    for (const note of notes) {
      if (note.type !== 'file') continue
      const folders: string[] = [], visited = new Set([note.id])
      let parent = note.parentId
      while (parent && folders.length < 5 && !visited.has(parent)) {
        visited.add(parent)
        const folder = byId.get(parent)
        if (!folder || folder.type !== 'folder') break
        folders.unshift(await namedId(folder.name, folder.id))
        parent = folder.parentId
      }
      files.push({ path: [...root, ...folders, `${await namedId(note.name, note.id)}.md`], content: `<!-- KNOWVIA note:${JSON.stringify(note.id)}; cloudRevision:${snapshot.revision}; confirmed:${snapshot.confirmed} -->\n${note.content || ''}` })
    }
  }
  return files
}
