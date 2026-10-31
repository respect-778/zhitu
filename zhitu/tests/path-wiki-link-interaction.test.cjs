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
const { parseWikiLinks, buildWikiLinkBindings } = load('wikiLinks.ts')
const { resolveEditingWikiLink } = load('wikiLinkInteraction.ts')
const source = { id: 'source', name: '来源', type: 'file', parentId: null, content: '[[Obsidian 日常归档 Skill]]' }
const folder = { id: 'skills', name: 'Skills', type: 'folder', parentId: null }
const target = { id: 'target', name: 'Obsidian 日常归档 Skill', type: 'file', parentId: 'skills', content: '' }

test('editing navigation resolves the requested Chinese/spaced filename and path aliases', () => {
  const files = [source, folder, target]
  const link = parseWikiLinks(source.content)[0]
  assert.equal(resolveEditingWikiLink(link, source, files, []).targetFileId, 'target')
  const alias = parseWikiLinks('[[Skills/Obsidian 日常归档 Skill|日常归档]]')[0]
  const result = resolveEditingWikiLink(alias, { ...source, content: alias.raw }, files, [])
  assert.equal(result.targetFileId, 'target')
  assert.equal(result.displayText, '日常归档')
})

test('renamed and moved targets keep their persisted ID without rewriting source Markdown', () => {
  const files = [source, folder, target]
  const bindings = buildWikiLinkBindings(files)
  const moved = [source, folder, { ...target, name: '改名后的笔记', parentId: null }]
  assert.equal(resolveEditingWikiLink(parseWikiLinks(source.content)[0], source, moved, bindings).targetFileId, 'target')
  assert.equal(source.content, '[[Obsidian 日常归档 Skill]]')
})

test('deleted targets are not silently replaced by newly created notes with the same name', () => {
  const bindings = buildWikiLinkBindings([source, folder, target])
  const replacement = { ...target, id: 'replacement' }
  const result = resolveEditingWikiLink(parseWikiLinks(source.content)[0], source, [source, folder, replacement], bindings)
  assert.equal(result.status, 'missing')
  assert.equal(result.targetFileId, 'target')
})

test('identical text bound to different IDs is ambiguous instead of choosing the first', () => {
  const link = parseWikiLinks(source.content)[0]
  const bindings = [
    { ...link, id: 'one', sourceFileId: 'source', targetFileId: 'target', status: 'resolved' },
    { ...link, id: 'two', sourceFileId: 'source', targetFileId: 'second', status: 'resolved' },
  ]
  const result = resolveEditingWikiLink(link, source, [source, folder, target, { ...target, id: 'second' }], bindings)
  assert.equal(result.status, 'ambiguous')
  assert.equal(result.targetFileId, undefined)
})

test('escaped examples are not navigable and DOM non-breaking spaces retain the original target binding', () => {
  const link = parseWikiLinks(source.content)[0]
  assert.equal(resolveEditingWikiLink(link, { ...source, content: '\\'+source.content }, [source, target], []).status, 'missing')
  const nonBreaking = { ...source, content: source.content.replaceAll(' ', '\u00a0') }
  const spacedTarget = { ...target, name: target.name.replaceAll(' ', '\u00a0') }
  const files = [nonBreaking, folder, spacedTarget, { ...target, id: 'different-spaces' }]
  const bindings = buildWikiLinkBindings(files)
  assert.equal(resolveEditingWikiLink(link, nonBreaking, files, bindings).targetFileId, 'target')
})
