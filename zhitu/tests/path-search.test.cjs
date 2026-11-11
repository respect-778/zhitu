const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

function load(relative) {
  const filename = path.resolve(__dirname, '../src/pages/Path/utils', relative)
  const compiled = new Module(filename, module)
  compiled.require = name => name.startsWith('.') ? load(name + '.ts') : require(name)
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, filename)
  return compiled.exports
}

const { parseNoteSearch, searchNotes, addSearchHistory, readSearchHistory, searchHistoryKey } = load('noteSearch.ts')
const files = [
  { id: 'learn', name: '学习笔记', type: 'folder', parentId: null },
  { id: 'front', name: '前端开发', type: 'folder', parentId: 'learn' },
  { id: 'archive', name: '引用收藏', type: 'folder', parentId: null },
  { id: 'react', name: 'React 入门.md', type: 'file', parentId: 'front', content: 'use server\nReact hooks\nuse server twice' },
  { id: 'duplicate', name: 'React 入门.md', type: 'file', parentId: 'archive', content: 'Other text' },
  { id: 'empty', name: '空白笔记', type: 'file', parentId: 'front', content: '' },
  { id: 'root', name: '根目录', type: 'file', parentId: null, content: '学习笔记 React use server\nfile:example literal [a+b]' },
]
const results = (query, sensitive = false, nodes = files) => searchNotes(nodes, parseNoteSearch(query), sensitive)
const ids = (query, sensitive = false) => results(query, sensitive).map(result => result.file.id)

test('plain search still matches content lines, including literal punctuation', () => {
  assert.deepEqual(ids('use server'), ['react', 'root'])
  assert.deepEqual(results('use server')[0].matches.map(match => match.lineNumber), [1, 3])
  assert.deepEqual(ids('[a+b]'), ['root'])
  assert.deepEqual(ids('"file:example"'), ['root'])
  assert.equal(parseNoteSearch('  use  server  ').text, 'use  server')
  assert.deepEqual(ids(''), [])
})

test('file: matches only names and includes empty notes; path: follows the full folder tree', () => {
  assert.deepEqual(ids('file:React'), ['react', 'duplicate'])
  assert.deepEqual(ids('file:空白'), ['empty'])
  assert.deepEqual(ids('path:学习笔记/前端开发'), ['react', 'empty'])
  assert.deepEqual(ids('path:学习笔记\\前端开发'), ['react', 'empty'])
  assert.deepEqual(ids('path:引用收藏/React'), ['duplicate'])
  assert.deepEqual(ids('path:根目录'), ['root'])
  assert.equal(results('file:React')[0].path, '学习笔记/前端开发/React 入门.md')
})

test('quoted spaces, case sensitivity, and combined filters match together', () => {
  assert.deepEqual(ids('file:"React 入门.md" path:学习笔记 use server'), ['react'])
  assert.deepEqual(ids("path:学习笔记 file:'React 入门.md' hooks"), ['react'])
  assert.deepEqual(ids('FILE:react'), ['react', 'duplicate'])
  assert.deepEqual(ids('file:react', true), [])
  assert.deepEqual(ids('path:学习笔记 file:React Other text'), [])
  assert.deepEqual(ids('file:React file:入门'), ['react', 'duplicate'])
})

test('incomplete filters and quotes do not show every file or enter history', () => {
  for (const query of ['path:', 'file:', 'path: file:React', 'file:""', 'file:"React']) {
    assert.ok(parseNoteSearch(query).error, query)
    assert.deepEqual(ids(query), [])
    assert.deepEqual(addSearchHistory([], { query, caseSensitive: false }), [])
  }
})

test('moved and renamed folders update paths; corrupt cycles terminate', () => {
  const moved = files.map(file => file.id === 'front' ? { ...file, name: '新目录', parentId: 'archive' } : file)
  assert.deepEqual(results('path:引用收藏/新目录', false, moved).map(result => result.file.id), ['react', 'empty'])
  const cycle = files.map(file => file.id === 'learn' ? { ...file, parentId: 'front' } : file)
  assert.equal(results('file:空白', false, cycle).length, 1)
})

test('history trims, deduplicates, keeps recent queries first and caps at 20', () => {
  let history = []
  for (let index = 0; index < 25; index++) history = addSearchHistory(history, { query: 'file:笔记' + index, caseSensitive: false })
  assert.equal(history.length, 20)
  assert.equal(history[19].query, 'file:笔记5')
  history = addSearchHistory(history, { query: ' file:笔记10 ', caseSensitive: false })
  assert.equal(history[0].query, 'file:笔记10')
  assert.equal(history.length, 20)
  assert.equal(history.filter(entry => entry.query === 'file:笔记10').length, 1)
  history = addSearchHistory(history, { query: 'file:笔记10', caseSensitive: true })
  assert.equal(history[0].caseSensitive, true)
})

test('history is account-scoped and tolerates corrupt or unavailable storage', () => {
  const store = new Map([[searchHistoryKey('100'), JSON.stringify([{ query: 'file:React', caseSensitive: true }])]])
  const storage = { getItem: key => store.get(key) ?? null }
  assert.equal(readSearchHistory(storage, '100')[0].query, 'file:React')
  assert.deepEqual(readSearchHistory(storage, '101'), [])
  assert.deepEqual(readSearchHistory(storage, ''), [])
  store.set(searchHistoryKey('100'), '{bad')
  assert.deepEqual(readSearchHistory(storage, '100'), [])
  store.set(searchHistoryKey('100'), JSON.stringify([null, 5, { query: 2 }, { query: 'file:' }, { query: 'valid' }]))
  assert.deepEqual(readSearchHistory(storage, '100'), [{ query: 'valid', caseSensitive: false }])
  assert.deepEqual(readSearchHistory({ getItem() { throw Error('blocked') } }, '100'), [])
})
