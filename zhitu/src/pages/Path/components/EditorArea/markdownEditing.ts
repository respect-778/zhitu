import type Vditor from 'vditor'

/** Vditor's link click handler runs before its normal marker expansion. */
export function revealMarkdownLink(marker: Element) {
  const node = marker.closest<HTMLElement>('[data-type="a"]')
  if (!node) return
  const root = node.closest('[contenteditable="true"]')
  root?.querySelectorAll('.vditor-ir__node--expand').forEach(item => item.classList.remove('vditor-ir__node--expand'))
  node.classList.add('vditor-ir__node--expand')
  const label = node.querySelector('.vditor-ir__link')
  if (label) {
    const range = document.createRange()
    range.selectNodeContents(label)
    range.collapse(false)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }
}

export function getEditorSelection(editor: Vditor): Range | null {
  const selection = window.getSelection()
  const root = editor.vditor[editor.getCurrentMode()]?.element
  if (!root || !selection?.rangeCount) return null
  const range = selection.getRangeAt(0)
  return root.contains(range.startContainer) && root.contains(range.endContainer) ? range.cloneRange() : null
}

export function restoreEditorSelection(editor: Vditor, range: Range | null): boolean {
  const root = editor.vditor[editor.getCurrentMode()]?.element
  if (!root || !range || !root.contains(range.startContainer) || !root.contains(range.endContainer)) return false
  root.focus({ preventScroll: true })
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  return true
}

function currentFormat(editor: Vditor, range: Range | null) {
  if (!range || editor.getCurrentMode() !== 'ir') return null
  const anchor = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement
  return anchor?.closest<HTMLElement>('strong, em, s, [data-type="code"], [data-type="a"], [data-type="code-block"], h1, h2, h3, h4, h5, h6, li, blockquote') ?? null
}

export function canCancelMarkdownFormat(editor: Vditor, range: Range | null): boolean {
  return !!currentFormat(editor, range)
}

/** Reuse Vditor's native removal commands so text and undo history stay intact. */
export function cancelMarkdownFormat(editor: Vditor, range: Range | null): boolean {
  const format = currentFormat(editor, range)
  if (!format || !restoreEditorSelection(editor, range)) return false
  if (format.matches('[data-type="code-block"], blockquote')) {
    const content = format.matches('blockquote') ? format : format.querySelector('pre code')
    if (!content) return false
    const start = document.createRange()
    start.selectNodeContents(content)
    start.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(start)
    editor.vditor.ir!.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', bubbles: true, cancelable: true }))
    return true
  }
  const command = format.matches('h1, h2, h3, h4, h5, h6') ? 'headings'
    : format.matches('li') ? (format.classList.contains('vditor-task') ? 'check' : format.parentElement?.tagName === 'OL' ? 'ordered-list' : 'list')
    : format.matches('strong') ? 'bold'
    : format.matches('em') ? 'italic'
    : format.matches('s') ? 'strike'
    : format.getAttribute('data-type') === 'a' ? 'link' : 'inline-code'
  const button = editor.vditor.toolbar?.elements?.[command]?.firstElementChild as HTMLButtonElement | null
  if (!button) return false
  // Native toolbar highlighting is debounced by 200ms. Use the actual saved
  // caret's format, rather than stale button state after a quick click/undo.
  button.classList.remove('vditor-menu--disabled')
  button.classList.add('vditor-menu--current')
  button.click()
  return true
}

export function switchMarkdownMode(editor: Vditor, mode: 'ir' | 'sv') {
  const button = editor.vditor.toolbar?.elements?.['edit-mode']?.querySelector<HTMLButtonElement>(`button[data-mode="${mode}"]`)
  button?.click()
}
