const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const { configureStore } = require('@reduxjs/toolkit')
const storage = () => {
  const data = new Map()
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key), keys: () => [...data.keys()] }
}
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const fixture = () => {
  const files = new Map()
  const env = { uid: '71', get: async () => ({ data: null, revision: 0 }), put: async (data, revision) => ({ data, revision: revision + 1 }) }
  const load = relative => {
    const filename = path.resolve(__dirname, '../src', relative)
    if (files.has(filename)) return files.get(filename).exports
    const loaded = new Module(filename, module)
    files.set(filename, loaded)
    loaded.require = name => {
      if (name === '@/api/resume') return { getResumesAPI: () => env.get(), saveResumesAPI: (...args) => env.put(...args) }
      if (name === '@/utils/store') return { getStore: () => env.uid }
      if (name.startsWith('@/')) return load(name.slice(2) + '.ts')
      if (name.startsWith('.')) return load(path.relative(path.resolve(__dirname, '../src'), path.resolve(path.dirname(filename), name + '.ts')))
      return require(name)
    }
    loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, filename)
    return loaded.exports
  }
  const actions = load('store/modules/resumeStore.ts')
  const { normalizeResumes } = load('utils/resumePersistence.ts')
  const store = configureStore({ reducer: { resume: actions.default }, middleware: getDefault => getDefault().prepend(actions.resumeSyncListener.middleware) })
  actions.bindResumeSync((uid, sync) => store.dispatch(actions.setResumeSync({ uid, sync })))
  const data = name => ({ resumes: normalizeResumes([{ id: 'same', title: '验收', basic: { name }, createdAt: '2026-10-07', updatedAt: '2026-10-07' }]) })
  return { env, actions, store, data }
}
global.localStorage = storage()
global.sessionStorage = storage()

test('a delayed reload cannot replace a newer acknowledged edit in Redux', async () => {
  const { env, actions, store, data } = fixture()
  let remote = { data: data('旧版本'), revision: 1 }
  env.get = async () => structuredClone(remote)
  env.put = async (data, revision) => (remote = { data, revision: revision + 1 })
  await store.dispatch(actions.loadUserResumes(env.uid))
  store.dispatch(actions.setActiveResume('same'))
  const read = defer()
  env.get = () => read.promise
  const refresh = store.dispatch(actions.loadUserResumes(env.uid))
  const old = structuredClone(remote)
  store.dispatch(actions.updateBasicInfo({ name: '已经保存的新版本' }))
  await actions.resumeSaveQueue.flush(env.uid)
  read.resolve(old)
  await refresh
  assert.equal(store.getState().resume.resumes[0].basic.name, '已经保存的新版本')
  assert.equal(store.getState().resume.revision, 2)
})

test('a failed write retains the draft across reload and deletes it only after acknowledgement', async () => {
  const { env, actions, store, data } = fixture()
  env.uid = '72'
  const remote = { data: data('服务器旧内容'), revision: 1 }
  env.get = async () => structuredClone(remote)
  env.put = async () => { throw new Error('offline') }
  await store.dispatch(actions.loadUserResumes(env.uid))
  store.dispatch(actions.setActiveResume('same'))
  store.dispatch(actions.updateBasicInfo({ name: '离线草稿' }))
  await actions.resumeSaveQueue.flush(env.uid)
  assert.equal(store.getState().resume.syncStatus, 'error')
  const draftKey = localStorage.keys().find(key => key.startsWith('zhitu_resume_draft_72_'))
  assert.equal(JSON.parse(localStorage.getItem(draftKey)).data.resumes[0].basic.name, '离线草稿')
  const reload = fixture()
  reload.env.uid = '72'
  reload.env.get = async () => structuredClone(remote)
  await reload.store.dispatch(reload.actions.loadUserResumes('72'))
  assert.equal(reload.store.getState().resume.resumes[0].basic.name, '离线草稿')
  await reload.actions.resumeSaveQueue.flush('72')
  assert.equal(reload.store.getState().resume.syncStatus, 'saved')
  assert.equal(localStorage.getItem(draftKey), null)
})

test('an already migrated cache cannot resurrect resumes deliberately deleted on the server', async () => {
  const { env, actions, store, data } = fixture()
  env.uid = '73'
  localStorage.setItem('zhitu_resumes_73', JSON.stringify(data('过期缓存').resumes))
  localStorage.setItem('zhitu_resume_migrated_73', '1')
  env.get = async () => ({ data: { resumes: [] }, revision: 4 })
  env.put = async () => assert.fail('a stale cache must not be uploaded')
  await store.dispatch(actions.loadUserResumes(env.uid))
  assert.deepEqual(store.getState().resume.resumes, [])
  assert.deepEqual(JSON.parse(localStorage.getItem('zhitu_resumes_73')), [])
})

test('a response from the previous account cannot replace the current account collection', async () => {
  const { env, actions, store, data } = fixture()
  env.uid = '74'
  const first = defer()
  env.get = () => first.promise
  const old = store.dispatch(actions.loadUserResumes('74'))
  env.uid = '75'
  env.get = async () => ({ data: data('当前账号'), revision: 3 })
  await store.dispatch(actions.loadUserResumes('75'))
  first.resolve({ data: data('上个账号'), revision: 2 })
  await old
  assert.equal(store.getState().resume.storageUserId, '75')
  assert.equal(store.getState().resume.resumes[0].basic.name, '当前账号')
})
