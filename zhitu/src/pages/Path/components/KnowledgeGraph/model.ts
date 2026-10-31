import type { GraphLink, VFile, WikiLinkBinding } from '@/types/path'

export type GraphPosition = { x: number; y: number }
export type GraphVisual = { highlight: number; mask: number }
export type GraphPalette = {
  surface: string
  node: string
  label: string
  edge: string
  accent: string
  maskOpacity: number
}

export const HOVER_DURATION = 120
export const LABEL_GAP = 6
export const LABEL_OFFSET = 4

export function endpointId(endpoint: GraphLink['source']): string {
  return typeof endpoint === 'string' ? endpoint : endpoint.id
}

export function graphLinkKey(link: GraphLink): string {
  return `${endpointId(link.source)}\u0000${endpointId(link.target)}\u0000${link.type}`
}

/** Names, content revisions and Agent ACL metadata must not restart the layout. */
export function graphTopologyKey(files: VFile[], bindings: WikiLinkBinding[]): string {
  const ids = new Set(files.filter(file => file.type === 'file').map(file => file.id))
  const edges = new Set<string>()
  for (const binding of bindings) {
    if (binding.status !== 'resolved' || !binding.targetFileId
      || binding.sourceFileId === binding.targetFileId
      || !ids.has(binding.sourceFileId) || !ids.has(binding.targetFileId)) continue
    edges.add(graphLinkKey({ source: binding.sourceFileId, target: binding.targetFileId, type: 'wikilink' }))
  }
  return `${[...ids].sort().join('\u0001')}\u0002${[...edges].sort().join('\u0001')}`
}

export function buildGraphIndex(nodeIds: string[], links: GraphLink[]) {
  const incomingSources = new Map(nodeIds.map(id => [id, new Set<string>()]))
  const neighbors = new Map(nodeIds.map(id => [id, new Set<string>()]))
  for (const link of links) {
    const source = endpointId(link.source), target = endpointId(link.target)
    if (source === target || !neighbors.has(source) || !neighbors.has(target)) continue
    neighbors.get(source)!.add(target)
    neighbors.get(target)!.add(source)
    // A source contributes once, even when force-graph mutates endpoints into objects.
    if (link.type === 'wikilink') incomingSources.get(target)!.add(source)
  }
  return {
    incomingCounts: new Map([...incomingSources].map(([id, sources]) => [id, sources.size])),
    neighbors,
  }
}

export function graphNodeRadius(incomingNoteCount: number): number {
  return Math.min(10, 4 + 1.5 * Math.log2(1 + Math.max(0, incomingNoteCount)))
}

export function nodeVisualTarget(id: string, hovered: string | null, neighbors?: Set<string>): GraphVisual {
  return { highlight: id === hovered ? 1 : 0, mask: hovered && id !== hovered && !neighbors?.has(id) ? 1 : 0 }
}

export function linkVisualTarget(link: GraphLink, hovered: string | null): GraphVisual {
  const incident = hovered !== null && (endpointId(link.source) === hovered || endpointId(link.target) === hovered)
  return { highlight: incident ? 1 : 0, mask: hovered && !incident ? 1 : 0 }
}

export function interpolateVisual(from: GraphVisual, to: GraphVisual, progress: number): GraphVisual {
  const p = 1 - Math.pow(1 - Math.max(0, Math.min(1, progress)), 3)
  return {
    highlight: from.highlight + (to.highlight - from.highlight) * p,
    mask: from.mask + (to.mask - from.mask) * p,
  }
}

function colorChannels(color: string): number[] {
  const hex = color.trim().match(/^#([\da-f]{6})$/i)
  if (hex) return [0, 2, 4].map(offset => parseInt(hex[1].slice(offset, offset + 2), 16))
  const rgb = color.match(/[\d.]+/g)
  return rgb && rgb.length >= 3 ? rgb.slice(0, 3).map(Number) : [0, 0, 0]
}

export function mixColor(from: string, to: string, progress: number): string {
  const a = colorChannels(from), b = colorChannels(to)
  const p = Math.max(0, Math.min(1, progress))
  return `rgb(${a.map((channel, i) => Math.round(channel + (b[i] - channel) * p)).join(', ')})`
}

export function graphPaintColor(base: string, visual: GraphVisual, palette: GraphPalette, accent = true): string {
  const color = accent ? mixColor(base, palette.accent, visual.highlight) : base
  return mixColor(color, palette.surface, visual.mask * palette.maskOpacity)
}

export function readGraphPalette(element: HTMLElement): GraphPalette {
  const style = getComputedStyle(element)
  const dark = document.documentElement.getAttribute('data-theme') === 'dark'
  const token = (name: string, fallback: string) => style.getPropertyValue(`--wiki-${name}`).trim() || fallback
  const surface = token('surface', dark ? '#0f172a' : '#fefdfb')
  const secondary = token('text-secondary', dark ? '#a1adbf' : '#5e636e')
  return {
    surface,
    node: secondary,
    label: secondary,
    edge: mixColor(secondary, surface, 0.6),
    accent: token('accent', dark ? '#85b2e5' : '#2e5995'),
    maskOpacity: dark ? 0.45 : 0.55,
  }
}

export function labelGeometry(baseRadius: number, scale: number, highlight: number) {
  return {
    radius: baseRadius + highlight / scale,
    textTop: baseRadius + (LABEL_GAP + LABEL_OFFSET * highlight) / scale,
  }
}
