import type Vditor from 'vditor'
import hljs from 'highlight.js'
import { cancelMarkdownFormat, getEditorSelection } from './markdownEditing'

const LIST_MARKER = '[data-path-list-marker]'
const QUOTE_MARKER = '[data-path-quote-marker]'
const EDITING_MARKERS = `${LIST_MARKER}, ${QUOTE_MARKER}`
const CLOSE_FENCE = '[data-type="code-block-close-marker"]'
const EDITABLE_CODE = '.vditor-ir__marker--pre code'
const CODE_HIGHLIGHT = 'data-path-code-highlight'
const ZWSP = '\u200b'
const CODE_NAVIGATION_KEYS = new Set([
  'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp',
  'End', 'Escape', 'Home', 'PageDown', 'PageUp',
  'Alt', 'Control', 'Meta', 'Shift',
])

function anchorElement(range: Range) {
  return range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement
}

function placeCaret(element: Node, end = false) {
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(!end)
  window.getSelection()?.removeAllRanges()
  window.getSelection()?.addRange(range)
}

function textSelectionOffsets(element: HTMLElement) {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return null
  const range = selection.getRangeAt(0)
  if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) return null
  const beforeStart = range.cloneRange()
  beforeStart.selectNodeContents(element)
  beforeStart.setEnd(range.startContainer, range.startOffset)
  const beforeEnd = range.cloneRange()
  beforeEnd.selectNodeContents(element)
  beforeEnd.setEnd(range.endContainer, range.endOffset)
  return { start: beforeStart.toString().length, end: beforeEnd.toString().length }
}

function textPointAt(element: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let remaining = offset
  let node = walker.nextNode()
  while (node) {
    const length = node.textContent?.length || 0
    if (remaining <= length) return { node, offset: remaining }
    remaining -= length
    node = walker.nextNode()
  }
  return { node: element as Node, offset: element.childNodes.length }
}

function restoreTextSelection(element: HTMLElement, offsets: { start: number; end: number } | null) {
  if (!offsets) return
  const start = textPointAt(element, offsets.start)
  const end = textPointAt(element, offsets.end)
  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

/** Extend IR at its DOM boundary; source mode and the installed package stay native. */
export function installMarkdownInteractions(editor: Vditor, onChange: (markdown: string) => void) {
  const root = editor.vditor.ir!.element
  const lute = editor.vditor.lute
  const toMarkdown = lute.VditorIRDOM2Md
  const spin = lute.SpinVditorIRDOM

  // Revealed prefixes are editing chrome, never part of the stored Markdown.
  const withoutEditingMarkers = (html: string) => {
    if (!/data-path-(list|quote|code)-/.test(html)) return html
    const clone = document.createElement('div')
    clone.innerHTML = html
    clone.querySelectorAll(EDITING_MARKERS).forEach(marker => marker.remove())
    clone.querySelectorAll('[data-path-list-source]').forEach(item => item.removeAttribute('data-path-list-source'))
    clone.querySelectorAll('[data-path-quote-source]').forEach(quote => quote.removeAttribute('data-path-quote-source'))
    clone.querySelectorAll<HTMLElement>(`[${CODE_HIGHLIGHT}]`).forEach(code => {
      code.replaceChildren(code.textContent || '')
      code.classList.remove('hljs')
      code.removeAttribute(CODE_HIGHLIGHT)
    })
    return clone.innerHTML
  }
  lute.VditorIRDOM2Md = (html: string) => toMarkdown.call(lute, withoutEditingMarkers(html))
  lute.SpinVditorIRDOM = (html: string) => spin.call(lute, withoutEditingMarkers(html))

  const getRange = () => editor.getCurrentMode() === 'ir' ? getEditorSelection(editor) : null
  const stripCodeHighlight = (code: HTMLElement) => {
    if (!code.hasAttribute(CODE_HIGHLIGHT)) return
    const offsets = textSelectionOffsets(code)
    code.replaceChildren(code.textContent || '')
    code.classList.remove('hljs')
    code.removeAttribute(CODE_HIGHLIGHT)
    restoreTextSelection(code, offsets)
  }
  const highlightCode = (code: HTMLElement) => {
    if (code.hasAttribute(CODE_HIGHLIGHT)) return
    const offsets = textSelectionOffsets(code)
    const languageClass = Array.from(code.classList).find(className => className.startsWith('language-'))
    const requestedLanguage = languageClass?.slice('language-'.length) || 'plaintext'
    const language = hljs.getLanguage(requestedLanguage) ? requestedLanguage : 'plaintext'
    code.innerHTML = hljs.highlight(code.textContent || '', { language, ignoreIllegals: true }).value
    code.classList.add('hljs')
    code.setAttribute(CODE_HIGHLIGHT, '')
    restoreTextSelection(code, offsets)
  }
  let codeHighlightFrame: number | null = null
  const syncCodeHighlight = () => {
    codeHighlightFrame = null
    root.querySelectorAll<HTMLElement>(`[${CODE_HIGHLIGHT}]`).forEach(code => {
      if (!code.closest('[data-type="code-block"]')?.classList.contains('vditor-ir__node--expand')) {
        stripCodeHighlight(code)
      }
    })
    root.querySelectorAll<HTMLElement>(`[data-type="code-block"].vditor-ir__node--expand ${EDITABLE_CODE}`)
      .forEach(highlightCode)
  }
  const scheduleCodeHighlight = () => {
    if (codeHighlightFrame !== null) cancelAnimationFrame(codeHighlightFrame)
    codeHighlightFrame = requestAnimationFrame(syncCodeHighlight)
  }
  const prepareEditableCode = () => {
    const range = getRange()
    const code = range && anchorElement(range)?.closest<HTMLElement>(EDITABLE_CODE)
    if (code) stripCodeHighlight(code)
  }
  const clearListMarkers = () => {
    root.querySelectorAll(LIST_MARKER).forEach(marker => marker.remove())
    root.querySelectorAll('[data-path-list-source]').forEach(item => item.removeAttribute('data-path-list-source'))
  }
  const clearQuoteMarkers = () => {
    root.querySelectorAll(QUOTE_MARKER).forEach(marker => marker.remove())
    root.querySelectorAll('[data-path-quote-source]').forEach(quote => quote.removeAttribute('data-path-quote-source'))
  }
  const revealListMarker = () => {
    const range = getRange()
    const item = document.activeElement === root && range ? anchorElement(range)?.closest<HTMLElement>('li') : null
    const active = item?.parentElement?.tagName === 'UL' && !item.classList.contains('vditor-task') ? item : null
    root.querySelectorAll<HTMLElement>('[data-path-list-source]').forEach(previous => {
      if (previous !== active) {
        previous.querySelector(LIST_MARKER)?.remove()
        previous.removeAttribute('data-path-list-source')
      }
    })
    if (!active || active.querySelector(`:scope > ${LIST_MARKER}, :scope > p > ${LIST_MARKER}`)) return
    const marker = document.createElement('span')
    marker.setAttribute('data-path-list-marker', '')
    marker.textContent = `${active.getAttribute('data-marker') || '-'} `
    const content = active.firstElementChild?.tagName === 'P' ? active.firstElementChild : active
    content.prepend(marker)
    active.setAttribute('data-path-list-source', '')
    if (!content.textContent?.slice(marker.textContent!.length)) {
      const empty = document.createTextNode(ZWSP)
      content.append(empty)
      // Native Enter leaves an empty item's selection at LI offset zero.
      // Keep typing in the body, after the revealed prefix.
      if (range?.collapsed && range.startContainer === content && range.startOffset === 0) placeCaret(empty, true)
    }
  }

  const revealQuoteMarker = () => {
    const range = getRange()
    const active = document.activeElement === root && range ? anchorElement(range)?.closest<HTMLElement>('blockquote') : null
    root.querySelectorAll<HTMLElement>('[data-path-quote-source]').forEach(previous => {
      if (previous !== active) {
        previous.querySelector(`:scope > ${QUOTE_MARKER}`)?.remove()
        previous.removeAttribute('data-path-quote-source')
      }
    })
    if (!active) return
    let marker = active.querySelector<HTMLElement>(`:scope > ${QUOTE_MARKER}`)
    if (!marker) {
      marker = document.createElement('span')
      marker.setAttribute('data-path-quote-marker', '')
      marker.textContent = '>'
      active.prepend(marker)
      active.setAttribute('data-path-quote-source', '')
    }
    // Show the prefix beside the clicked block, including long quotes where
    // the first paragraph is outside the viewport. Keep it still while edited.
    let block = anchorElement(range!)!
    if (block.closest(QUOTE_MARKER)) return
    while (block !== active && block.parentElement !== active) block = block.parentElement!
    if (block !== active) marker.style.top = `${block.getBoundingClientRect().top - active.getBoundingClientRect().top}px`
  }

  const revealMarkers = () => {
    if (editor.vditor.ir!.composingLock) return
    revealListMarker()
    revealQuoteMarker()
  }

  const transaction = (change: () => void) => {
    editor.vditor.undo?.addToUndoStack(editor.vditor)
    change()
    revealMarkers()
    editor.vditor.undo?.addToUndoStack(editor.vditor)
    onChange(editor.getValue())
  }

  const removeQuoteFormat = (quote: HTMLElement) => {
    quote.querySelector(`:scope > ${QUOTE_MARKER}`)?.remove()
    const blocks = Array.from(quote.childNodes)
    if (!blocks.length) {
      const empty = document.createElement('p')
      empty.setAttribute('data-block', '0')
      empty.textContent = ZWSP
      blocks.push(empty)
    }
    quote.replaceWith(...blocks)
    placeCaret(blocks[0])
  }

  const removeListItemFormat = (item: HTMLElement) => {
    item.querySelector(LIST_MARKER)?.remove()
    const list = item.parentElement!
    const after = list.cloneNode(false) as HTMLElement
    after.removeAttribute('data-path-list-source')
    while (item.nextSibling) after.append(item.nextSibling)
    const blocks = document.createDocumentFragment()
    let paragraph: HTMLElement | null = null
    for (const child of Array.from(item.childNodes)) {
      if (child instanceof HTMLElement && /^(P|UL|OL|BLOCKQUOTE|DIV|PRE)$/.test(child.tagName)) {
        blocks.append(child)
        paragraph = null
      } else {
        if (!paragraph) {
          paragraph = document.createElement('p')
          paragraph.setAttribute('data-block', '0')
          blocks.append(paragraph)
        }
        paragraph.append(child)
      }
    }
    if (!blocks.childNodes.length) {
      const empty = document.createElement('p')
      empty.setAttribute('data-block', '0')
      empty.textContent = ZWSP
      blocks.append(empty)
    }
    const first = blocks.firstChild!
    if (after.childNodes.length) list.after(blocks, after)
    else list.after(blocks)
    item.remove()
    if (!list.childNodes.length) list.remove()
    placeCaret(first)
  }

  const editListMarker = (range: Range, marker: HTMLElement, inputType: string, data: string | null) => {
    const prefix = range.cloneRange()
    prefix.selectNodeContents(marker)
    prefix.setEnd(range.startContainer, range.startOffset)
    let start = prefix.toString().length
    const suffix = range.cloneRange()
    suffix.selectNodeContents(marker)
    suffix.setEnd(range.endContainer, range.endOffset)
    let end = suffix.toString().length
    if (range.collapsed && inputType.startsWith('delete')) {
      if (inputType.includes('Backward')) start = Math.max(0, start - 1)
      else end++
    }
    const value = marker.textContent || ''
    const updated = value.slice(0, start) + (data || '') + value.slice(end)
    const item = marker.closest<HTMLElement>('li')!
    transaction(() => {
      if (!/^[-+*]\s*$/.test(updated)) {
        removeListItemFormat(item)
      } else {
        marker.textContent = updated
        item.setAttribute('data-marker', updated.trim())
        placeCaret(marker, true)
      }
    })
  }

  const onBeforeInput = (event: InputEvent) => {
    if (event.isComposing) return
    prepareEditableCode()
    const range = getRange()
    const marker = range && anchorElement(range)?.closest<HTMLElement>(EDITING_MARKERS)
    if (!range || !marker || !marker.contains(range.endContainer)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (marker.matches(QUOTE_MARKER)) {
      transaction(() => {
        removeQuoteFormat(marker.closest<HTMLElement>('blockquote')!)
        if (event.data) document.execCommand('insertText', false, event.data)
      })
    } else editListMarker(range, marker, event.inputType, event.data)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    // Keep the highlighted DOM intact while the caret merely moves. Vditor
    // needs plain text nodes for mutating keys, but stripping on arrows made
    // the code flash unhighlighted until the next animation frame.
    if (!CODE_NAVIGATION_KEYS.has(event.key)) prepareEditableCode()
    const range = getRange()
    if (!range) return
    const anchor = anchorElement(range)
    const marker = anchor?.closest<HTMLElement>(LIST_MARKER)
    const quoteMarker = anchor?.closest<HTMLElement>(QUOTE_MARKER)
    if (!marker) clearListMarkers()
    if (!quoteMarker) clearQuoteMarkers()
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
    const fence = anchor?.closest<HTMLElement>(CLOSE_FENCE)
    const code = anchor?.closest<HTMLElement>('.vditor-ir__marker--pre code')
    const item = anchor?.closest<HTMLElement>('li')
    if (quoteMarker && quoteMarker.contains(range.endContainer) && (event.key === 'Backspace' || event.key === 'Delete')) {
      event.preventDefault()
      event.stopImmediatePropagation()
      transaction(() => removeQuoteFormat(quoteMarker.closest<HTMLElement>('blockquote')!))
    } else if (marker && (event.key === 'Backspace' || event.key === 'Delete')) {
      event.preventDefault()
      event.stopImmediatePropagation()
      editListMarker(range, marker, event.key === 'Backspace' ? 'deleteContentBackward' : 'deleteContentForward', null)
    } else if (event.key === 'Enter' && range.collapsed && item?.parentElement?.tagName === 'UL' && !item.classList.contains('vditor-task') && !item.textContent?.replace(/\u200b/g, '').trim()) {
      event.preventDefault()
      event.stopImmediatePropagation()
      transaction(() => removeListItemFormat(item))
    } else if (fence && event.key === 'Enter') {
      event.preventDefault()
      event.stopImmediatePropagation()
      transaction(() => editor.insertEmptyBlock('afterend'))
    } else if (fence && (event.key === 'Backspace' || event.key === 'Delete')) {
      event.preventDefault()
      event.stopImmediatePropagation()
      transaction(() => { cancelMarkdownFormat(editor, range) })
    } else if (code && range.collapsed && event.key === 'ArrowDown') {
      const remaining = range.cloneRange()
      remaining.selectNodeContents(code)
      remaining.setStart(range.endContainer, range.endOffset)
      if (remaining.toString().replace(/[\n\u200b]/g, '') === '') {
        event.preventDefault()
        event.stopImmediatePropagation()
        const closing = code.closest('[data-type="code-block"]')!.querySelector(CLOSE_FENCE)!
        placeCaret(closing, true)
      }
    }
  }

  const onInput = (nativeEvent: Event) => {
    const event = nativeEvent as InputEvent
    if (event.isComposing || editor.vditor.ir!.composingLock) return
    const range = getRange()
    const paragraph = range && anchorElement(range)?.closest<HTMLElement>('p')
    if (event.data === ' ' && range?.collapsed && paragraph && !paragraph.closest('li, blockquote, [data-type="code-block"]') && /^[-+*] $/.test(paragraph.textContent || '')) {
      const symbol = paragraph.textContent!.charAt(0)
      transaction(() => {
        const holder = document.createElement('div')
        holder.innerHTML = lute.Md2VditorIRDOM(`${symbol} \n`)
        const list = holder.firstElementChild!
        paragraph.replaceWith(list)
        const item = list.querySelector('li')!
        item.append(document.createTextNode(ZWSP))
        placeCaret(item.lastChild!, true)
      })
    }
    revealMarkers()
    scheduleCodeHighlight()
  }

  const onInteraction = () => {
    revealMarkers()
    scheduleCodeHighlight()
  }
  const onCompositionStart = () => { prepareEditableCode() }

  const observer = new MutationObserver(revealMarkers)
  observer.observe(root, { childList: true, subtree: true })
  root.addEventListener('beforeinput', onBeforeInput, true)
  root.addEventListener('keydown', onKeyDown, true)
  root.addEventListener('input', onInput)
  root.addEventListener('click', onInteraction)
  root.addEventListener('keyup', onInteraction)
  root.addEventListener('compositionstart', onCompositionStart, true)
  root.addEventListener('compositionend', scheduleCodeHighlight)
  document.addEventListener('selectionchange', revealMarkers)

  return () => {
    observer.disconnect()
    root.removeEventListener('beforeinput', onBeforeInput, true)
    root.removeEventListener('keydown', onKeyDown, true)
    root.removeEventListener('input', onInput)
    root.removeEventListener('click', onInteraction)
    root.removeEventListener('keyup', onInteraction)
    root.removeEventListener('compositionstart', onCompositionStart, true)
    root.removeEventListener('compositionend', scheduleCodeHighlight)
    document.removeEventListener('selectionchange', revealMarkers)
    if (codeHighlightFrame !== null) cancelAnimationFrame(codeHighlightFrame)
    root.querySelectorAll<HTMLElement>(`[${CODE_HIGHLIGHT}]`).forEach(stripCodeHighlight)
    clearListMarkers()
    clearQuoteMarkers()
    lute.VditorIRDOM2Md = toMarkdown
    lute.SpinVditorIRDOM = spin
  }
}
