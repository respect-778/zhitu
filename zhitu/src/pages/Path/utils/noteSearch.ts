import type { VFile } from '@/types/path'
import { getWikiFilePath } from './wikiLinks'

export interface NoteSearchQuery {
  text: string
  paths: string[]
  names: string[]
  error: string | null
}

export interface NoteSearchResult {
  file: VFile
  path: string
  matches: { lineNumber: number; text: string }[]
}

/** Only path: and file: are operators. Everything else stays a literal content query. */
export function parseNoteSearch(query: string): NoteSearchQuery {
  const result: NoteSearchQuery = { text: '', paths: [], names: [], error: null }
  const content: string[] = []
  let cursor = 0
  while (cursor < query.length) {
    const whitespaceStart = cursor
    while (/\s/.test(query[cursor] ?? '') && cursor < query.length) cursor += 1
    const separator = query.slice(whitespaceStart, cursor)
    if (cursor === query.length) break
    const operator = query.slice(cursor).match(/^(path|file):/i)
    if (operator) {
      cursor += operator[0].length
      while (cursor < query.length && /\s/.test(query[cursor])) cursor += 1
    }
    let value = ''
    const quote = query[cursor]
    if (quote === '"' || quote === "'") {
      cursor += 1
      let closed = false
      while (cursor < query.length) {
        const character = query[cursor++]
        if (character === quote) { closed = true; break }
        if (character === '\\' && query[cursor] === quote) value += query[cursor++]
        else value += character
      }
      if (!closed) result.error = '请补全搜索条件的引号'
    } else {
      const start = cursor
      while (cursor < query.length && !/\s/.test(query[cursor])) cursor += 1
      value = query.slice(start, cursor)
    }
    if (operator) {
      if (!value.trim() || /^(path|file):/i.test(value)) result.error = `请在 ${operator[1].toLowerCase()}: 后输入匹配内容`
      else (operator[1].toLowerCase() === 'path' ? result.paths : result.names).push(value)
    } else if (value) content.push(separator + value)
  }
  result.text = content.join('').trim()
  return result
}

export function searchNotes(files: VFile[], query: NoteSearchQuery, caseSensitive = false): NoteSearchResult[] {
  if (query.error || (!query.text && !query.paths.length && !query.names.length)) return []
  const normalize = (value: string) => caseSensitive ? value : value.toLowerCase()
  const includes = (value: string, term: string) => normalize(value).includes(normalize(term))
  const results: NoteSearchResult[] = []
  for (const file of files) {
    if (file.type !== 'file') continue
    // Wiki paths omit .md; keep an existing extension for file/path searches and display.
    const path = getWikiFilePath(file, files) + (file.name.match(/\.md$/i)?.[0] ?? '')
    if (!query.paths.every(term => includes(path, term.replace(/\\/g, '/')))) continue
    if (!query.names.every(term => includes(file.name, term))) continue
    const matches = query.text
      ? (file.content ?? '').split('\n').flatMap((line, index) => includes(line, query.text)
        ? [{ lineNumber: index + 1, text: line.trim() }]
        : [])
      : []
    if (!query.text || matches.length) results.push({ file, path, matches })
  }
  return results
}

export interface SearchHistoryEntry {
  query: string
  caseSensitive: boolean
}

export const SEARCH_HISTORY_LIMIT = 20
export const searchHistoryKey = (userId: string) => `knowvia:path-search-history:${encodeURIComponent(userId)}`

export function addSearchHistory(history: SearchHistoryEntry[], entry: SearchHistoryEntry): SearchHistoryEntry[] {
  const query = entry.query.trim()
  const parsed = parseNoteSearch(query)
  if (!query || query.length > 2000 || parsed.error || (!parsed.text && !parsed.paths.length && !parsed.names.length)) return history
  return [{ ...entry, query }, ...history.filter(item => item.query !== query || item.caseSensitive !== entry.caseSensitive)].slice(0, SEARCH_HISTORY_LIMIT)
}

export function readSearchHistory(storage: Pick<Storage, 'getItem'>, userId: string): SearchHistoryEntry[] {
  if (!userId) return []
  try {
    const value: unknown = JSON.parse(storage.getItem(searchHistoryKey(userId)) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.slice(0, SEARCH_HISTORY_LIMIT).reduceRight<SearchHistoryEntry[]>((history, entry: unknown) => {
      if (!entry || typeof entry !== 'object' || !('query' in entry) || typeof entry.query !== 'string') return history
      return addSearchHistory(history, { query: entry.query, caseSensitive: 'caseSensitive' in entry && entry.caseSensitive === true })
    }, [])
  } catch { return [] }
}
