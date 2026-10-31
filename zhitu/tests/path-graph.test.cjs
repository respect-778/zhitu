const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const filename = path.join(__dirname, '../src/pages/Path/components/KnowledgeGraph/model.ts')
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText
const loaded = new Module(filename, module)
loaded._compile(compiled, filename)
const {
  buildGraphIndex, graphTopologyKey, graphNodeRadius, graphLinkKey,
  nodeVisualTarget, linkVisualTarget, interpolateVisual, labelGeometry, graphPaintColor,
} = loaded.exports

test('sizes count distinct incoming notes, not outgoing links, repeated occurrences or theme edges', () => {
  const links = [
    { source: 'A', target: 'B', type: 'wikilink' },
    { source: 'A', target: 'B', type: 'wikilink' },
    { source: { id: 'C' }, target: { id: 'B' }, type: 'wikilink' },
    { source: 'B', target: 'A', type: 'wikilink' },
    { source: 'B', target: 'D', type: 'wikilink' },
    { source: 'D', target: 'E', type: 'wikilink' },
    { source: 'A', target: 'C', type: 'tag' },
    { source: 'C', target: 'C', type: 'wikilink' },
    { source: 'missing', target: 'B', type: 'wikilink' },
  ]
  const { incomingCounts, neighbors } = buildGraphIndex(['A', 'B', 'C', 'D', 'E', 'U'], links)
  assert.deepEqual(Object.fromEntries(incomingCounts), { A: 1, B: 2, C: 0, D: 1, E: 1, U: 0 })
  assert.deepEqual([...neighbors.get('B')].sort(), ['A', 'C', 'D'])
  assert.deepEqual([0, 1, 3, 7, 15, 100].map(graphNodeRadius), [4, 5.5, 7, 8.5, 10, 10])
  assert.equal(graphLinkKey(links[2]), 'C\0B\0wikilink')
})

test('stable topology ignores names, permission changes, source positions and duplicate bindings', () => {
  const files = ['A', 'B'].map(id => ({ id, name: id, type: 'file' }))
  const binding = { sourceFileId: 'A', targetFileId: 'B', status: 'resolved', from: 0 }
  const key = graphTopologyKey(files, [binding])
  assert.equal(graphTopologyKey(files.map(f => ({ ...f, name: 'renamed', agentPermission: 'manage' })),
    [{ ...binding, from: 50 }, { ...binding, from: 80 }]), key)
  assert.notEqual(graphTopologyKey(files, [{ ...binding, status: 'missing' }]), key)
  assert.equal(graphTopologyKey(files, [{ ...binding, targetFileId: 'A' }]), graphTopologyKey(files, []))
  assert.equal(graphTopologyKey(files, [{ ...binding, targetFileId: 'deleted' }]), graphTopologyKey(files, []))
})

test('hover preserves only direct neighbor nodes, not all edges between preserved nodes', () => {
  const neighbors = new Set(['A', 'C', 'D'])
  assert.deepEqual(nodeVisualTarget('B', 'B', neighbors), { highlight: 1, mask: 0 })
  for (const id of neighbors) assert.deepEqual(nodeVisualTarget(id, 'B', neighbors), { highlight: 0, mask: 0 })
  assert.deepEqual(nodeVisualTarget('E', 'B', neighbors), { highlight: 0, mask: 1 })
  assert.deepEqual(linkVisualTarget({ source: 'A', target: 'C' }, 'B'), { highlight: 0, mask: 1 })
  assert.deepEqual(linkVisualTarget({ source: { id: 'B' }, target: 'D' }, 'B'), { highlight: 1, mask: 0 })
  assert.deepEqual(nodeVisualTarget('U', null), { highlight: 0, mask: 0 })
})

test('hover transitions start at the current painted values and end exactly at the new target', () => {
  const interrupted = { highlight: 0.65, mask: 0.2 }, target = { highlight: 0, mask: 1 }
  assert.deepEqual(interpolateVisual(interrupted, target, 0), interrupted)
  assert.deepEqual(interpolateVisual(interrupted, target, 1), target)
  const middle = interpolateVisual(interrupted, target, 0.5)
  assert.ok(middle.highlight > 0 && middle.highlight < interrupted.highlight)
  assert.ok(middle.mask > interrupted.mask && middle.mask < 1)
})

test('labels maintain 6px resting and 9px hover gaps at every camera scale', () => {
  for (const scale of [0.2, 0.6, 1, 1.25, 4]) {
    for (const radius of [4, 5.5, 10]) {
      const rest = labelGeometry(radius, scale, 0), hovered = labelGeometry(radius, scale, 1)
      assert.ok(Math.abs((rest.textTop - rest.radius) * scale - 6) < 1e-9)
      assert.ok(Math.abs((hovered.textTop - hovered.radius) * scale - 9) < 1e-9)
      assert.ok(Math.abs((hovered.textTop - rest.textTop) * scale - 4) < 1e-9)
    }
  }
})

test('background masking preserves visible color contribution in both themes without changing local labels', () => {
  for (const palette of [
    { surface: '#fefdfb', node: '#5e636e', accent: '#2e5995', maskOpacity: 0.55 },
    { surface: '#0f172a', node: '#a1adbf', accent: '#85b2e5', maskOpacity: 0.45 },
  ]) {
    const normal = graphPaintColor(palette.node, { highlight: 0, mask: 0 }, palette)
    const dimmed = graphPaintColor(palette.node, { highlight: 0, mask: 1 }, palette)
    assert.notEqual(normal, dimmed)
    assert.equal(graphPaintColor(palette.node, { highlight: 1, mask: 0 }, palette, false), normal)
    assert.match(dimmed, /^rgb\(\d+, \d+, \d+\)$/)
  }
})
