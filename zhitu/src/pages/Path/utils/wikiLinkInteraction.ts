import type { VFile, WikiLinkBinding } from '@/types/path'
import { parseWikiLinks, resolveWikiLink } from './wikiLinks'
import type { ParsedWikiLink, ResolvedWikiLink } from './wikiLinks'

const proseText = (text: string) => text.replace(/\u00a0/g, ' ').replace(/\u200b/g, '')

/** Hit-test existing editable text, without decorating or rewriting Vditor DOM. */
export function editingWikiLinkAtPoint(root: HTMLElement, x: number, y: number): ParsedWikiLink | undefined {
  const doc = root.ownerDocument
  const position = doc.caretPositionFromPoint?.(x, y)
  const range = position ? doc.createRange() : doc.caretRangeFromPoint?.(x, y)
  if (position && range) range.setStart(position.offsetNode, position.offset)
  if (!range || !root.contains(range.startContainer)) return
  const element = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement
  if (!element) return
  const code = element.closest('code,[data-type="code"],[data-type="code-block"],[data-type="html-block"]')
  const pre = element.closest('pre')
  // The IR contenteditable itself is a <pre>; it is not a code block.
  if ((code && root.contains(code)) || (pre && pre !== root && root.contains(pre))) return
  const nearestBlock = element.closest<HTMLElement>('p,li,td,th,h1,h2,h3,h4,h5,h6,[data-block="0"]')
  const block = nearestBlock && root.contains(nearestBlock) ? nearestBlock : root
  const prefix = doc.createRange()
  prefix.selectNodeContents(block)
  prefix.setEnd(range.startContainer, range.startOffset)
  const offset = proseText(prefix.toString()).length
  return parseWikiLinks(proseText(block.textContent ?? ''))
    .find(link => offset >= link.from && offset <= link.to)
}

/** Prefer persisted IDs; never silently retarget a renamed/deleted note by name. */
export function resolveEditingWikiLink(link: ParsedWikiLink, source: VFile, files: VFile[], bindings: WikiLinkBinding[]): ResolvedWikiLink {
  const raw = proseText(link.raw)
  const originals = parseWikiLinks(source.content ?? '').filter(candidate => proseText(candidate.raw) === raw)
  // Rendered examples/escaped syntax must not become links merely because the
  // same text happens to name an existing note.
  if (!originals.length) return { ...link, status: 'missing', candidates: [] }
  const matches = bindings.filter(binding => binding.sourceFileId === source.id && proseText(binding.raw) === raw)
  if (!matches.length) {
    if (new Set(originals.map(candidate => candidate.raw)).size > 1) return { ...link, status: 'ambiguous', candidates: [] }
    return resolveWikiLink(originals[0], source, files)
  }
  const first = matches[0]
  const candidates = files.filter(file => file.type === 'file' && matches.some(binding => binding.targetFileId === file.id))
  if (matches.some(binding => binding.targetFileId !== first.targetFileId || binding.status !== first.status)) {
    return { ...link, status: 'ambiguous', candidates }
  }
  return {
    ...link,
    status: first.status === 'resolved' && !candidates.length ? 'missing' : first.status,
    targetFileId: first.targetFileId,
    candidates,
  }
}

function wikiLinkLabel(link: ParsedWikiLink) {
  if (link.displayText?.trim()) return link.displayText.trim()
  const segments = link.targetPath.split('/').filter(Boolean)
  return (segments.at(-1) || link.targetPath).replace(/\.md$/i, '')
}

/**
 * Add visual-only link marks to Vditor IR text. The raw `[[...]]` text stays in
 * the DOM so Vditor serialization and undo history keep the user's Markdown.
 */
export function decorateEditingWikiLinks(root: HTMLElement, source: VFile, files: VFile[], bindings: WikiLinkBinding[]) {
  root.querySelectorAll<HTMLElement>('[data-type="a"]').forEach(node => {
    const destination = node.querySelector<HTMLElement>('.vditor-ir__marker--link')?.textContent?.trim() ?? ''
    if (/^(?:https?:\/\/|mailto:|tel:)/i.test(destination)) node.setAttribute('data-external-link', '')
    else node.removeAttribute('data-external-link')
  })

  const textNodes: Text[] = []
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.textContent ?? ''
      const element = node.parentElement
      if (!text.includes('[[') || !element) return NodeFilter.FILTER_REJECT
      const code = element.closest('code,[data-type="code"],[data-type="code-block"],[data-type="html-block"]')
      const pre = element.closest('pre')
      if (element.closest('[data-wiki-link]') || (code && root.contains(code)) || (pre && pre !== root && root.contains(pre))) {
        return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text)

  let decorated = 0
  for (const textNode of textNodes) {
    const text = textNode.data
    const links = parseWikiLinks(text)
    if (!links.length || !textNode.parentNode) continue
    const fragment = root.ownerDocument.createDocumentFragment()
    let cursor = 0
    for (const link of links) {
      fragment.append(text.slice(cursor, link.from))
      const resolved = resolveEditingWikiLink(link, source, files, bindings)
      const mark = root.ownerDocument.createElement('span')
      mark.setAttribute('data-wiki-link', '')
      mark.setAttribute('data-wiki-link-raw', link.raw)
      mark.setAttribute('data-wiki-link-label', wikiLinkLabel(link))
      mark.setAttribute('data-wiki-link-status', resolved.status)
      if (resolved.targetFileId) mark.setAttribute('data-wiki-link-target-id', resolved.targetFileId)
      mark.setAttribute('role', 'link')
      mark.setAttribute('aria-label', `${wikiLinkLabel(link)}，内部笔记链接`)
      mark.setAttribute('draggable', 'false')
      mark.textContent = link.raw
      fragment.append(mark)
      cursor = link.to
      decorated += 1
    }
    fragment.append(text.slice(cursor))
    textNode.parentNode.replaceChild(fragment, textNode)
  }
  return decorated
}
