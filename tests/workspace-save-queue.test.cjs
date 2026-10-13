const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const filename = path.join(__dirname, '../src/utils/workspaceSaveQueue.ts')
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
const sourceModule = new Module(filename, module)
sourceModule._compile(compiled, filename)
const { WorkspaceSaveQueue } = sourceModule.exports
const defer = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const tick = () => new Promise(resolve => setImmediate(resolve))

test('typing during a save retains the newer draft and navigation flush serializes both writes', async () => {
  const first = defer()
  const requests = []
  let active = 0
  let maxActive = 0
  const queue = new WorkspaceSaveQueue(async (user, data, revision, keepalive) => {
    requests.push({ user, data, revision, keepalive })
    maxActive = Math.max(maxActive, ++active)
    if (requests.length === 1) await first.promise
    active--
    return { data, revision: revision + 1 }
  }, () => {}, 10000)
  queue.initialize('a', { data: { text: 'base' }, revision: 4 })
  queue.enqueue('a', { text: 'first edit' }, 4)
  const saving = queue.flush('a')
  await tick()
  queue.enqueue('a', { text: 'latest edit' }, 4)
  const leaving = queue.flush('a', true)
  assert.deepEqual(queue.peek('a').pending, { text: 'latest edit' })
  first.resolve()
  await Promise.all([saving, leaving])
  assert.equal(maxActive, 1)
  assert.deepEqual(requests.map(request => request.revision), [4, 5])
  assert.equal(requests[1].keepalive, true)
  assert.equal(queue.peek('a').pending, null)
  assert.equal(queue.peek('a').revision, 6)
})

test('a failed save keeps the draft and only a successful retry marks it saved', async () => {
  let fail = true
  const queue = new WorkspaceSaveQueue(async (_user, data, revision) => {
    if (fail) throw new Error('offline')
    return { data, revision: revision + 1 }
  }, () => {}, 10000)
  queue.initialize('a', { data: null, revision: 0 })
  queue.enqueue('a', { text: 'draft' }, 0)
  await queue.flush('a')
  assert.equal(queue.peek('a').status, 'error')
  assert.equal(queue.peek('a').pending.text, 'draft')
  fail = false
  await queue.flush('a')
  assert.equal(queue.peek('a').status, 'saved')
  assert.equal(queue.peek('a').pending, null)
})

test('a stale page cannot retry over a conflict until its baseline is explicitly replaced', async () => {
  let calls = 0
  const remote = { data: { text: 'remote addition' }, revision: 2 }
  const queue = new WorkspaceSaveQueue(async (_user, data, revision) => {
    calls++
    if (revision === 1) throw { response: { status: 409, data: { current: remote } } }
    return { data, revision: revision + 1 }
  }, () => {}, 10000)
  queue.initialize('a', { data: { text: 'old' }, revision: 1 })
  queue.enqueue('a', { text: 'local change' }, 1)
  await queue.flush('a')
  queue.enqueue('a', { text: 'further local change' }, 1)
  await queue.flush('a')
  assert.equal(calls, 1)
  assert.equal(queue.peek('a').status, 'conflict')
  assert.equal(queue.peek('a').pending.text, 'further local change')
  queue.replaceBaseline('a', remote)
  queue.enqueue('a', { text: 'remote addition + local copy' }, 2)
  await queue.flush('a')
  assert.equal(queue.peek('a').revision, 3)
})

test('focus refresh updates a clean page and never discards a changed page', () => {
  const queue = new WorkspaceSaveQueue(async () => assert.fail('unexpected save'), () => {}, 10000)
  queue.initialize('clean', { data: { text: 'old' }, revision: 1 })
  queue.initialize('clean', { data: { text: 'new' }, revision: 2 })
  assert.equal(queue.peek('clean').savedData.text, 'new')
  queue.initialize('dirty', { data: { text: 'old' }, revision: 1 })
  queue.enqueue('dirty', { text: 'local edit' }, 1)
  queue.initialize('dirty', { data: { text: 'new' }, revision: 2 })
  assert.equal(queue.peek('dirty').pending.text, 'local edit')
  assert.equal(queue.peek('dirty').status, 'conflict')
  assert.equal(queue.peek('dirty').current.revision, 2)
})

test('restored drafts and an unknown baseline are preserved without an unsafe write', async () => {
  const queue = new WorkspaceSaveQueue(async () => assert.fail('unexpected save'), () => {}, 10000)
  queue.enqueue('offline', { text: 'offline edit' }, null)
  await queue.flush('offline')
  assert.equal(queue.peek('offline').status, 'error')
  queue.initialize('offline', { data: { text: 'server' }, revision: 2 })
  assert.equal(queue.peek('offline').status, 'conflict')
  queue.initialize('restored', { data: { text: 'new server' }, revision: 2 }, { data: { text: 'saved local draft' }, revision: 1 })
  assert.equal(queue.peek('restored').pending.text, 'saved local draft')
  assert.equal(queue.peek('restored').status, 'conflict')
})
