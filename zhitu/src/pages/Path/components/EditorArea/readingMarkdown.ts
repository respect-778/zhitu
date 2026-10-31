import hljs from 'highlight.js'
import { markdownPluginsNoHighlight } from '@/utils/markdown'

const SOURCE_LINE = /^ {0,3}(?:来源|Source)\s*[：:]/i
const SEPARATOR_LINE = /^ {0,3}-{3,}\s*$/
const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})/

const LANGUAGE_LABELS: Record<string, string> = {
  bash: 'Bash',
  css: 'CSS',
  html: 'HTML',
  java: 'Java',
  javascript: 'JavaScript',
  js: 'JavaScript',
  jsx: 'JavaScript-JSX',
  json: 'JSON',
  markdown: 'Markdown',
  md: 'Markdown',
  python: 'Python',
  py: 'Python',
  shell: 'Shell',
  sql: 'SQL',
  text: 'Text',
  ts: 'TypeScript',
  tsx: 'TypeScript-JSX',
  typescript: 'TypeScript',
  xml: 'XML',
  yaml: 'YAML',
  yml: 'YAML',
}

/**
 * Older collected notes placed a thematic break directly after a provenance
 * line. CommonMark treats that pair as a Setext H2, while Vditor presents it
 * as body text followed by a separator. Add the missing blank line only for
 * provenance labels and never while inside a fenced code block.
 */
export function normalizePathReadingMarkdown(markdown: string) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const normalized: string[] = []
  let fence: { marker: string; length: number } | null = null

  lines.forEach((line, index) => {
    const match = line.match(FENCE_LINE)
    if (match) {
      const marker = match[1][0]
      if (!fence) fence = { marker, length: match[1].length }
      else if (fence.marker === marker && match[1].length >= fence.length) fence = null
    }

    normalized.push(line)
    if (!fence && SOURCE_LINE.test(line) && SEPARATOR_LINE.test(lines[index + 1] ?? '')) {
      normalized.push('')
    }
  })

  return normalized.join('\n')
}

function isDirectoryTreeQuote(blockquote: HTMLElement) {
  const lines = (blockquote.innerText || blockquote.textContent || '')
    .split('\n')
    .map(line => line.trimEnd())
    .filter(Boolean)
  if (lines.length < 3 || !/\/$/.test(lines[0].trim())) return false
  return lines.slice(1).filter(line => /^[\s│┃├└┌┬┴┼─━]+\S/.test(line)).length >= 2
}

function languageFrom(code: HTMLElement) {
  const languageClass = Array.from(code.classList).find(name => name.startsWith('language-'))
  return languageClass?.slice('language-'.length).toLocaleLowerCase('en-US') ?? ''
}

export function enhancePathReadingView(markdownBody: HTMLElement) {
  markdownBody.querySelectorAll<HTMLTableElement>('table').forEach(table => {
    if (table.parentElement?.classList.contains('path-table-scroll')) return
    const scrollArea = document.createElement('div')
    scrollArea.className = 'path-table-scroll'
    scrollArea.setAttribute('role', 'region')
    scrollArea.setAttribute('aria-label', '可横向滚动的表格')
    table.before(scrollArea)
    scrollArea.append(table)
  })

  markdownBody.querySelectorAll<HTMLElement>('blockquote').forEach(blockquote => {
    if (isDirectoryTreeQuote(blockquote)) blockquote.classList.add('path-tree-block')
  })

  markdownBody.querySelectorAll<HTMLElement>('pre > code').forEach(code => {
    const language = languageFrom(code)
    const pre = code.parentElement
    if (language && pre) pre.dataset.language = LANGUAGE_LABELS[language] ?? language.toUpperCase()
    if (!code.dataset.highlighted) hljs.highlightElement(code)
  })
}

// Path runs its visual enhancements from EditorArea's own lifecycle because
// ByteMD viewer effects do not fire reliably for this conditionally mounted
// reader under React 19. Keep only the structural Markdown plugin here.
export const pathReadingPlugins = markdownPluginsNoHighlight
