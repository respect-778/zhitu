import type { VFile, WikiLinkBinding } from '@/types/path'

export interface ParsedWikiLink {
  from: number
  to: number
  raw: string
  targetPath: string
  headingText?: string
  displayText?: string
}

export interface ResolvedWikiLink extends ParsedWikiLink {
  status: 'resolved' | 'missing' | 'ambiguous'
  targetFileId?: string
  candidates: VFile[]
}

const withoutMarkdownExtension = (value: string) => value.replace(/\.md$/i, '')
const normalizePath = (value: string) => withoutMarkdownExtension(value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))

export function getWikiFilePath(file: VFile, files: VFile[]): string {
  const parts = [withoutMarkdownExtension(file.name)]
  let parentId = file.parentId
  const visited = new Set<string>([file.id])
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId)
    const parent = files.find(candidate => candidate.id === parentId)
    if (!parent) break
    parts.unshift(parent.name)
    parentId = parent.parentId
  }
  return parts.join('/')
}

function escapedAt(content: string, index: number): boolean {
  let slashes = 0
  for (let cursor = index - 1; cursor >= 0 && content[cursor] === '\\'; cursor -= 1) slashes += 1
  return slashes % 2 === 1
}

/** Parse Obsidian-style links while excluding fenced/inline code and image embeds. */
export function parseWikiLinks(content: string): ParsedWikiLink[] {
  const links: ParsedWikiLink[] = []
  let cursor = 0
  let fence: '`' | '~' | null = null
  let fenceLength = 0
  let inlineTicks = 0

  while (cursor < content.length) {
    const lineStart = cursor === 0 || content[cursor - 1] === '\n'
    if (lineStart && inlineTicks === 0) {
      const fenceMatch = content.slice(cursor).match(/^[ \t]{0,3}(`{3,}|~{3,})/)
      if (fenceMatch) {
        const marker = fenceMatch[1][0] as '`' | '~'
        const length = fenceMatch[1].length
        if (!fence) {
          fence = marker
          fenceLength = length
        } else if (fence === marker && length >= fenceLength) {
          fence = null
          fenceLength = 0
        }
        const nextLine = content.indexOf('\n', cursor)
        cursor = nextLine === -1 ? content.length : nextLine + 1
        continue
      }
    }

    if (fence) {
      const nextLine = content.indexOf('\n', cursor)
      cursor = nextLine === -1 ? content.length : nextLine + 1
      continue
    }

    if (content[cursor] === '`' && !escapedAt(content, cursor)) {
      let count = 1
      while (content[cursor + count] === '`') count += 1
      if (inlineTicks === 0) inlineTicks = count
      else if (count === inlineTicks) inlineTicks = 0
      cursor += count
      continue
    }

    if (inlineTicks === 0 && content[cursor] === '[' && content[cursor + 1] === '[' && !escapedAt(content, cursor) && content[cursor - 1] !== '!') {
      const close = content.indexOf(']]', cursor + 2)
      if (close !== -1) {
        const body = content.slice(cursor + 2, close)
        if (body && !body.includes('\n')) {
          const pipeIndex = body.indexOf('|')
          const targetPart = (pipeIndex === -1 ? body : body.slice(0, pipeIndex)).trim()
          const displayText = pipeIndex === -1 ? undefined : body.slice(pipeIndex + 1).trim() || undefined
          const headingIndex = targetPart.indexOf('#')
          const targetPath = (headingIndex === -1 ? targetPart : targetPart.slice(0, headingIndex)).trim()
          const headingText = headingIndex === -1 ? undefined : targetPart.slice(headingIndex + 1).trim() || undefined
          if (targetPath || headingText) {
            links.push({ from: cursor, to: close + 2, raw: content.slice(cursor, close + 2), targetPath, headingText, displayText })
          }
        }
        cursor = close + 2
        continue
      }
    }
    cursor += 1
  }
  return links
}

export function resolveWikiLink(link: ParsedWikiLink, sourceFile: VFile, files: VFile[]): ResolvedWikiLink {
  if (!link.targetPath) {
    return { ...link, status: 'resolved', targetFileId: sourceFile.id, candidates: [sourceFile] }
  }
  const fileNodes = files.filter(file => file.type === 'file')
  const target = normalizePath(link.targetPath)
  const exactPath = fileNodes.filter(file => normalizePath(getWikiFilePath(file, files)) === target)
  if (exactPath.length === 1) return { ...link, status: 'resolved', targetFileId: exactPath[0].id, candidates: exactPath }
  if (exactPath.length > 1) return { ...link, status: 'ambiguous', candidates: exactPath }

  const byName = fileNodes.filter(file => normalizePath(file.name) === target)
  if (byName.length === 1) return { ...link, status: 'resolved', targetFileId: byName[0].id, candidates: byName }
  if (byName.length > 1) {
    const sameFolder = byName.filter(file => file.parentId === sourceFile.parentId)
    if (sameFolder.length === 1) return { ...link, status: 'resolved', targetFileId: sameFolder[0].id, candidates: sameFolder }
    return { ...link, status: 'ambiguous', candidates: byName }
  }
  return { ...link, status: 'missing', candidates: [] }
}

export function resolveFileWikiLinks(sourceFile: VFile, files: VFile[]): ResolvedWikiLink[] {
  return parseWikiLinks(sourceFile.content ?? '').map(link => resolveWikiLink(link, sourceFile, files))
}

function bindingHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

/**
 * Reconcile one note after an edit. An unchanged [[...]] keeps its previous
 * target file ID even when that target was renamed or moved.
 */
export function reconcileFileWikiLinkBindings(
  sourceFile: VFile,
  files: VFile[],
  previous: WikiLinkBinding[] = [],
): WikiLinkBinding[] {
  if (sourceFile.type !== 'file') return []
  const parsed = parseWikiLinks(sourceFile.content ?? '')
  const prior = previous.filter(binding => binding.sourceFileId === sourceFile.id)
  const used = new Set<string>()
  const occurrences = new Map<string, number>()

  return parsed.map(link => {
    const priorBinding = prior.find(binding => !used.has(binding.id) && binding.raw === link.raw)
    if (priorBinding) used.add(priorBinding.id)

    const occurrence = occurrences.get(link.raw) ?? 0
    occurrences.set(link.raw, occurrence + 1)
    const id = priorBinding?.id ?? `${sourceFile.id}:${bindingHash(link.raw)}:${occurrence}`

    if (priorBinding?.targetFileId) {
      const targetExists = files.some(file => file.type === 'file' && file.id === priorBinding.targetFileId)
      return {
        ...link,
        id,
        sourceFileId: sourceFile.id,
        targetFileId: priorBinding.targetFileId,
        status: targetExists ? 'resolved' : 'missing',
      }
    }

    const resolved = resolveWikiLink(link, sourceFile, files)
    return {
      ...link,
      id,
      sourceFileId: sourceFile.id,
      targetFileId: resolved.targetFileId,
      status: resolved.status,
    }
  })
}

/** Rebuild the index while preserving stable targets for unchanged links. */
export function buildWikiLinkBindings(files: VFile[], previous: WikiLinkBinding[] = []): WikiLinkBinding[] {
  return files
    .filter(file => file.type === 'file')
    .flatMap(file => reconcileFileWikiLinkBindings(file, files, previous))
}

export function getFileWikiLinkBindings(sourceFileId: string, bindings: WikiLinkBinding[]): WikiLinkBinding[] {
  return bindings.filter(binding => binding.sourceFileId === sourceFileId)
}

function escapeMarkdownLabel(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
}

export function encodeWikiFragment(value: string): string {
  return Array.from(value, character => character.codePointAt(0)?.toString(16).padStart(6, '0') ?? '').join('')
}

export function decodeWikiFragment(value: string): string {
  const codePoints = value.match(/.{6}/g)
  if (!codePoints || codePoints.join('') !== value) return ''
  return codePoints.map(codePoint => String.fromCodePoint(Number.parseInt(codePoint, 16))).join('')
}

/** Reading-mode projection; stored Markdown remains the short [[...]] source. */
export function projectWikiLinksForReading(sourceFile: VFile, files: VFile[], bindings: WikiLinkBinding[] = []): string {
  const content = sourceFile.content ?? ''
  const parsed = parseWikiLinks(content)
  const sourceBindings = getFileWikiLinkBindings(sourceFile.id, bindings)
  const usedBindings = new Set<string>()
  const resolved = parsed.map(link => {
    const binding = sourceBindings.find(candidate =>
      !usedBindings.has(candidate.id)
      && candidate.from === link.from
      && candidate.to === link.to
      && candidate.raw === link.raw,
    ) ?? sourceBindings.find(candidate => !usedBindings.has(candidate.id) && candidate.raw === link.raw)
    if (!binding) return resolveWikiLink(link, sourceFile, files)
    usedBindings.add(binding.id)
    return {
      ...link,
      status: binding.status,
      targetFileId: binding.targetFileId,
      candidates: binding.targetFileId
        ? files.filter(file => file.id === binding.targetFileId)
        : [],
    } satisfies ResolvedWikiLink
  })
  let projected = content
  for (const link of [...resolved].reverse()) {
    const fallbackLabel = link.displayText || [link.targetPath, link.headingText].filter(Boolean).join('#') || '当前笔记'
    const label = escapeMarkdownLabel(fallbackLabel)
    const href = link.status === 'resolved' && link.targetFileId
      ? `#knowvia-file-${encodeWikiFragment(link.targetFileId)}${link.headingText ? `-heading-${encodeWikiFragment(link.headingText)}` : ''}`
      : `#knowvia-unresolved-${encodeWikiFragment(link.targetPath || link.headingText || '')}`
    projected = `${projected.slice(0, link.from)}[${label}](${href})${projected.slice(link.to)}`
  }
  return projected
}
