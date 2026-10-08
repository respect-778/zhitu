const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
global.window = { isSecureContext: true }
function load(relative) {
  const filename = path.resolve(__dirname, '../src', relative)
  const loaded = new Module(filename, module)
  loaded.require = name => name.startsWith('.') ? load(path.relative(path.resolve(__dirname, '../src'), path.resolve(path.dirname(filename), name + '.ts'))) : require(name)
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, filename)
  return loaded.exports
}
const { normalizeResumes, mergeResumeCopies } = load('utils/resumePersistence.ts')
const { safeFileName, buildBackupPlan } = load('utils/personalDirectoryPlan.ts')
const { writeBackup, PersonalDirectory } = load('utils/personalDirectory.ts')
const { personalSaveNotice } = load('utils/personalSaveNotice.ts')
const resume = (id, title = '简历') => normalizeResumes([{ id, title, createdAt: '2026-10-07', updatedAt: '2026-10-07' }])[0]

test('legacy migration preserves remote records and recovers differing IDs as copies', () => {
  const remote = [resume('same', '云端简历')]
  const local = [resume('same', '本地简历'), resume('local-only')]
  const merged = mergeResumeCopies(remote, local, () => 'copy')
  assert.equal(merged[0].title, '云端简历')
  assert.equal(merged[1].id, 'copy')
  assert.match(merged[1].title, /本地恢复副本/)
  assert.equal(merged[2].id, 'local-only')
  assert.equal(remote.length, 1)
  assert.equal(local[0].id, 'same')
  assert.deepEqual(mergeResumeCopies(remote, remote), remote)
})
test('legacy normalization fills older missing settings but rejects broken collections', () => {
  assert.equal(resume('legacy').basic.photoConfig.visible, true)
  for (const invalid of [null, [{}], [{ id: '1', education: null }], [{ id: '1' }, { id: '1' }]]) assert.throws(() => normalizeResumes(invalid))
})
test('unsafe Windows names and duplicate titles produce safe distinct paths', async () => {
  assert.equal(safeFileName('../CON:*?\\x'), '.._CON____x')
  assert.equal(safeFileName('CON'), '_CON')
  const files = await buildBackupPlan('12', 'resumes', { data: { resumes: [resume('../../1', 'A/B'), resume('2', 'A/B')] }, revision: 4, confirmed: true })
  assert.equal(new Set(files.map(file => file.path.join('/'))).size, 3)
  for (const file of files) assert.ok(file.path.every(part => part !== '..' && !/[<>:"/\\|?*]/.test(part)))
  assert.equal(JSON.parse(files[0].content).cloudRevision, 4)
  await assert.rejects(buildBackupPlan('../x', 'resumes', { data: { resumes: [] } }))
})
test('learning backup retains tree in JSON and exports Markdown under folders without loops', async () => {
  const data = { files: [{ id: 'folder', name: '笔记', type: 'folder', parentId: 'folder' }, { id: 'note', name: '概念', type: 'file', parentId: 'folder', content: '# 学习内容' }] }
  const files = await buildBackupPlan('12', 'workspace', { data, revision: null, confirmed: false })
  assert.deepEqual(JSON.parse(files[0].content).data, data)
  assert.equal(JSON.parse(files[0].content).cloudConfirmed, false)
  assert.match(files[1].content, /# 学习内容/)
  assert.equal(files[1].path.length, 5)
})

function fakeDirectory(name = 'fixture') {
  const all = new Map(), writes = []
  let permission = 'granted', permissionRequests = 0, onWrite
  const folder = (parts = []) => ({
    name, queryPermission: async () => permission,
    requestPermission: async () => { permissionRequests++; permission = 'granted'; return permission },
    getDirectoryHandle: async (part) => folder([...parts, part]),
    getFileHandle: async (part, options) => {
      const key = [...parts, part].join('/')
      if (!all.has(key) && !options?.create) throw Object.assign(new Error('missing'), { name: 'NotFoundError' })
      return { getFile: async () => ({ text: async () => all.get(key) || '' }), createWritable: async () => {
        let pending
        return { write: async text => { if (onWrite) await onWrite(key); pending = text }, close: async () => { all.set(key, pending); writes.push(key) }, abort: async () => {} }
      } }
    },
  })
  return { root: folder(), all, writes, deny: () => { permission = 'denied' }, requests: () => permissionRequests, delayWrites: fn => { onWrite = fn } }
}
const snapshot = text => ({ data: { resumes: [resume('same', text)] }, revision: 2, confirmed: true })
const memoryHandles = handle => ({ get: async () => handle, put: async () => {}, remove: async () => {} })
test('manual file edits and unrelated files survive later platform backup', async () => {
  const disk = fakeDirectory()
  await writeBackup(disk.root, '12', 'resumes', snapshot('旧标题'))
  const individual = [...disk.all.keys()].find(key => key.endsWith('.json') && key.includes('旧标题'))
  const collection = 'KNOWVIA/user-12/简历/resumes.json'
  disk.all.set(collection, '用户手工修改')
  disk.all.set('personal.txt', '原有电脑文件')
  assert.equal(await writeBackup(disk.root, '12', 'resumes', snapshot('新标题')), true)
  assert.equal(disk.all.get(collection), '用户手工修改')
  assert.ok([...disk.all.keys()].some(key => key.endsWith('resumes--平台副本.json')))
  assert.ok(disk.all.has(individual), 'renaming keeps old historical file')
  assert.equal(disk.all.get('personal.txt'), '原有电脑文件')
})
test('cancelled picker retains the previous directory and denied background permission never prompts', async () => {
  const disk = fakeDirectory()
  const manager = new PersonalDirectory(memoryHandles(disk.root), async () => { throw Object.assign(new Error('cancel'), { name: 'AbortError' }) }, 100000)
  await manager.activate('12')
  await manager.choose()
  assert.equal(manager.getStatus().name, 'fixture')
  disk.deny()
  manager.publish('12', 'resumes', snapshot('内容'))
  await manager.flush()
  assert.equal(manager.getStatus().phase, 'permission')
  assert.equal(disk.requests(), 0)
  await manager.authorize()
  await manager.flush()
  assert.equal(disk.requests(), 1)
  assert.equal(manager.getStatus().phase, 'saved')
  await manager.disconnect()
})
test('edits arriving during directory writing are serialized and the last snapshot wins', async () => {
  const disk = fakeDirectory()
  let release
  const gate = new Promise(resolve => { release = resolve })
  let blocked = false
  disk.delayWrites(async key => { if (!blocked && key.endsWith('resumes.json')) { blocked = true; await gate } })
  const manager = new PersonalDirectory(memoryHandles(disk.root), async () => disk.root, 100000)
  await manager.activate('12')
  manager.publish('12', 'resumes', snapshot('先输入'))
  const first = manager.flush()
  while (!blocked) await new Promise(resolve => setImmediate(resolve))
  manager.publish('12', 'resumes', snapshot('最后输入'))
  release()
  await first
  assert.equal(JSON.parse(disk.all.get('KNOWVIA/user-12/简历/resumes.json')).data.resumes[0].title, '最后输入')
  assert.equal(manager.getStatus().phase, 'saved')
  await manager.disconnect()
})
test('switching accounts stops subsequent old-account writes and ignores their updates', async () => {
  const disk = fakeDirectory()
  const manager = new PersonalDirectory(memoryHandles(disk.root), async () => disk.root, 100000)
  await manager.activate('12')
  manager.publish('12', 'resumes', snapshot('账号 A'))
  await manager.activate('13')
  manager.publish('12', 'resumes', snapshot('过期账号 A'))
  manager.publish('13', 'resumes', snapshot('账号 B'))
  await manager.flush()
  assert.ok([...disk.all.keys()].every(key => key.startsWith('KNOWVIA/user-13/')))
  await manager.disconnect()
})
test('unsupported browsers do not access directory storage or require a folder', async () => {
  const manager = new PersonalDirectory({ get: async () => { throw new Error('must not access') } })
  await manager.activate('12')
  manager.publish('12', 'resumes', snapshot('云端独立'))
  await manager.flush()
  assert.equal(manager.getStatus().supported, false)
  assert.equal(manager.getStatus().phase, 'unconfigured')
})

test('a new module snapshot immediately revokes only its old local success', async () => {
  const disk = fakeDirectory()
  const manager = new PersonalDirectory(memoryHandles(disk.root), async () => disk.root, 100000)
  try {
    await manager.activate('12')
    manager.publish('12', 'resumes', snapshot('原简历'))
    manager.publish('12', 'workspace', { data: { files: [] }, revision: 3, confirmed: true })
    await manager.flush()
    assert.equal(manager.getStatus().modules.resumes.saved, true)
    assert.equal(manager.getStatus().modules.workspace.saved, true)
    let notified = 0
    const unsubscribe = manager.subscribe(() => notified++)
    manager.publish('12', 'resumes', { ...snapshot('新简历'), confirmed: false })
    assert.equal(manager.getStatus().modules.resumes.saved, false)
    assert.equal(manager.getStatus().modules.workspace.saved, true)
    assert.ok(notified > 0, 'the UI must be notified before the debounce timer fires')
    unsubscribe()
    await manager.flush()
    assert.equal(manager.getStatus().modules.resumes.saved, true)
    assert.equal(manager.getStatus().modules.resumes.confirmed, false, 'local draft alone is not a server acknowledgement')
    manager.publish('12', 'resumes', { ...snapshot('新简历'), revision: 4 })
    assert.equal(manager.getStatus().modules.resumes.saved, false)
    await manager.flush()
    assert.equal(manager.getStatus().modules.resumes.revision, 4)
    assert.equal(manager.getStatus().modules.resumes.confirmed, true)
  } finally { await manager.disconnect() }
})

test('local manual conflicts remain visible after an idle flush', async () => {
  const disk = fakeDirectory()
  const manager = new PersonalDirectory(memoryHandles(disk.root), async () => disk.root, 100000)
  try {
    await manager.activate('12')
    manager.publish('12', 'resumes', snapshot('旧标题'))
    await manager.flush()
    disk.all.set('KNOWVIA/user-12/简历/resumes.json', '人工内容')
    manager.publish('12', 'resumes', snapshot('新标题'))
    await manager.flush()
    assert.equal(manager.getStatus().modules.resumes.conflict, true)
    await manager.flush()
    assert.equal(manager.getStatus().modules.resumes.conflict, true)
    assert.equal(disk.all.get('KNOWVIA/user-12/简历/resumes.json'), '人工内容')
  } finally { await manager.disconnect() }
})

test('green success requires the same module and version acknowledged by both stores', () => {
  const directory = { supported: true, userId: '12', name: '资料', phase: 'saved', message: '', lastSavedAt: '',
    modules: { resumes: { saved: true, confirmed: true, revision: 4, conflict: false } } }
  const notice = (changes = {}, cloud = 'saved', version = 4, kind = 'resumes') => personalSaveNotice({ ...directory, ...changes }, kind, cloud, version)
  assert.deepEqual(notice(), { text: '已保存到本地文件夹', tone: 'success' })
  for (const cloud of ['loading', 'pending', 'saving', 'error', 'conflict']) assert.notEqual(notice({}, cloud).tone, 'success')
  for (const phase of ['checking', 'unconfigured', 'permission', 'error']) assert.notEqual(notice({ phase }).tone, 'success')
  for (const version of [null, 3, 5]) assert.notEqual(notice({}, 'saved', version).tone, 'success')
  assert.notEqual(notice({}, 'saved', 4, 'workspace').tone, 'success', 'resume success cannot certify learning notes')
  assert.notEqual(notice({ supported: false }).tone, 'success')
  assert.notEqual(notice({ name: '' }).tone, 'success')
  for (const update of [{ saved: false }, { confirmed: false }, { conflict: true }]) {
    assert.notEqual(notice({ modules: { resumes: { ...directory.modules.resumes, ...update } } }).tone, 'success')
  }
  assert.equal(notice({ phase: 'writing' }).tone, 'success', 'an unrelated module writing must not revoke this saved version')
})
