import type { Highlight } from '@/types/highlight'

const CONTEXT_LEN = 20
const MARK_ATTR = 'data-highlight-id'

// 获取当前选区的文字及前后上下文
export function getSelectionContext(container: HTMLElement): { text: string; textBefore: string; textAfter: string } | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null

  const range = sel.getRangeAt(0)
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) return null

  if (!sel.toString().trim()) return null

  // 用 TreeWalker 计算基于 textContent 的精确偏移
  const fullText = container.textContent || ''
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let charIndex = 0
  let startIdx = -1
  let endIdx = -1

  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    if (startIdx === -1 && node === range.startContainer) {
      startIdx = charIndex + range.startOffset
    }
    if (node === range.endContainer) {
      endIdx = charIndex + range.endOffset
      break
    }
    charIndex += node.length
  }

  if (startIdx === -1 || endIdx === -1) return null

  const text = fullText.slice(startIdx, endIdx)
  if (!text.trim()) return null

  const textBefore = fullText.slice(Math.max(0, startIdx - CONTEXT_LEN), startIdx)
  const textAfter = fullText.slice(endIdx, endIdx + CONTEXT_LEN)

  return { text, textBefore, textAfter }
}

// 清除容器内所有高亮 <mark>，还原为纯文本
export function clearHighlights(container: HTMLElement): void {
  const marks = container.querySelectorAll<HTMLElement>(`mark[${MARK_ATTR}]`)
  marks.forEach(mark => {
    const parent = mark.parentNode
    if (!parent) return
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark)
    }
    parent.removeChild(mark)
    parent.normalize()
  })
}

// 根据高亮数据在容器内用 <mark> 包裹对应文字
export function applyHighlights(container: HTMLElement, highlights: Highlight[]): void {
  clearHighlights(container)
  if (highlights.length === 0) return

  const fullText = container.textContent || ''

  const positioned = highlights
    .map(h => {
      const searchStr = h.textBefore + h.text + h.textAfter
      const idx = fullText.indexOf(searchStr)
      if (idx === -1) {
        const fallback = fullText.indexOf(h.text)
        if (fallback === -1) return null
        return { highlight: h, start: fallback, end: fallback + h.text.length }
      }
      const start = idx + h.textBefore.length
      return { highlight: h, start, end: start + h.text.length }
    })
    .filter(Boolean) as Array<{ highlight: Highlight; start: number; end: number }>

  positioned.sort((a, b) => b.start - a.start)

  for (const { highlight, start, end } of positioned) {
    wrapRange(container, start, end, highlight)
  }
}

// 用 TreeWalker 定位文本偏移，逐文本节点包裹 <mark>（支持跨元素）
function wrapRange(container: HTMLElement, start: number, end: number, highlight: Highlight): void {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let charIndex = 0
  const textNodes: { node: Text; nodeStart: number; nodeEnd: number }[] = []

  // 收集落在 [start, end) 范围内的所有文本节点
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const nodeStart = charIndex
    const nodeEnd = charIndex + node.length

    if (nodeEnd > start && nodeStart < end) {
      textNodes.push({ node, nodeStart, nodeEnd })
    }
    if (nodeStart >= end) break
    charIndex = nodeEnd
  }

  if (textNodes.length === 0) return

  // 逆序处理，避免前面的 splitText 影响后面节点的偏移
  for (let i = textNodes.length - 1; i >= 0; i--) {
    const { node, nodeStart } = textNodes[i]

    if (node.parentElement?.hasAttribute(MARK_ATTR)) continue

    const sliceStart = Math.max(start - nodeStart, 0)
    const sliceEnd = Math.min(end - nodeStart, node.length)

    // 跳过纯空白文本节点，避免空行被高亮
    const sliceText = node.textContent?.slice(sliceStart, sliceEnd) || ''
    if (!sliceText.trim()) continue

    // 从当前文本节点中切出需要高亮的部分
    let targetNode: Text = node
    if (sliceEnd < node.length) {
      node.splitText(sliceEnd)
    }
    if (sliceStart > 0) {
      targetNode = node.splitText(sliceStart)
    }

    const mark = document.createElement('mark')
    mark.setAttribute(MARK_ATTR, highlight.id)
    mark.style.backgroundColor = highlight.color
    mark.style.borderRadius = '2px'
    mark.style.cursor = 'pointer'
    mark.style.padding = '0 1px'

    targetNode.parentNode!.insertBefore(mark, targetNode)
    mark.appendChild(targetNode)
  }
}
