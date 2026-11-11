import type React from 'react'
import { useState, useMemo, useRef, useId, useEffect } from 'react'
import { SearchOutlined, RightOutlined, CloseOutlined, ControlOutlined } from '@ant-design/icons'
import { useAppSelector } from '@/store/hooks'
import type { VFile } from '@/types/path'
import {
  addSearchHistory, parseNoteSearch, readSearchHistory, searchHistoryKey, searchNotes,
  type NoteSearchResult, type SearchHistoryEntry,
} from '../../../../utils/noteSearch'
import styles from './SearchPanel.module.less'

interface Props {
  files: VFile[]
  onSelectFile: (id: string) => void
}

const SEARCH_OPTIONS = [
  { prefix: 'path:', label: '匹配文件路径' },
  { prefix: 'file:', label: '匹配文件名' },
] as const

const HighlightText: React.FC<{ text: string; keywords: string[]; caseSensitive: boolean }> = ({ text, keywords, caseSensitive }) => {
  const terms = keywords.filter(Boolean).sort((a, b) => b.length - a.length)
  if (!terms.length) return <>{text}</>
  const escaped = terms.map(term => term.replace(/[.*+?^{}()|[\]\\$]/g, '\\$&'))
  const parts = text.split(new RegExp('(' + escaped.join('|') + ')', caseSensitive ? 'g' : 'gi'))
  return <>{parts.map((part, index) => index % 2
    ? <mark key={index} className={styles.highlight}>{part}</mark>
    : <span key={index}>{part}</span>)}</>
}

const FileGroup: React.FC<{
  result: NoteSearchResult
  query: ReturnType<typeof parseNoteSearch>
  caseSensitive: boolean
  onSelectFile: (id: string) => void
}> = ({ result, query, caseSensitive, onSelectFile }) => {
  const [expanded, setExpanded] = useState(true)
  return (
    <div className={styles.fileGroup} data-testid="search-file-result" data-file-id={result.file.id}>
      <div className={styles.fileHeader}>
        {result.matches.length > 0 && (
          <button
            type="button"
            className={[styles.chevron, expanded ? styles.chevronExpanded : ''].join(' ')}
            aria-label={(expanded ? '折叠' : '展开') + ' ' + result.file.name + ' 的匹配行'}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          ><RightOutlined /></button>
        )}
        <button type="button" className={styles.fileLink} onClick={() => onSelectFile(result.file.id)} title={result.path}>
          <span className={styles.fileName}>
            <HighlightText text={result.file.name} keywords={query.names} caseSensitive={caseSensitive} />
          </span>
          <span className={styles.filePath}>
            <HighlightText text={result.path} keywords={query.paths.map(path => path.replace(/\\/g, '/'))} caseSensitive={caseSensitive} />
          </span>
        </button>
        {result.matches.length > 0 && <span className={styles.matchCount}>{result.matches.length}</span>}
      </div>
      {expanded && result.matches.length > 0 && (
        <div className={styles.matchList}>
          {result.matches.map(match => (
            <button type="button" key={match.lineNumber} className={styles.matchItem} onClick={() => onSelectFile(result.file.id)}>
              <span className={styles.matchText}>
                <HighlightText text={match.text} keywords={[query.text]} caseSensitive={caseSensitive} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const SearchPanelContent: React.FC<Props & { userId: string }> = ({ files, onSelectFile, userId }) => {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [sortBy, setSortBy] = useState<'name' | 'count'>('name')
  const [suggestionsOpen, setSuggestionsOpen] = useState(true)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [history, setHistory] = useState<SearchHistoryEntry[]>(() => {
    try { return readSearchHistory(window.localStorage, userId) } catch { return [] }
  })
  const inputRef = useRef<HTMLInputElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const lastRemembered = useRef('')
  const id = useId()
  const parsed = useMemo(() => parseNoteSearch(query), [query])
  const searchResults = useMemo(() => {
    const results = searchNotes(files, parsed, caseSensitive)
    return results.sort((a, b) => sortBy === 'count'
      ? b.matches.length - a.matches.length || a.path.localeCompare(b.path, 'zh-CN')
      : a.file.name.localeCompare(b.file.name, 'zh-CN') || a.path.localeCompare(b.path, 'zh-CN'))
  }, [files, parsed, caseSensitive, sortBy])
  const totalCount = searchResults.reduce((sum, result) => sum + result.matches.length, 0)
  const suggestionCount = SEARCH_OPTIONS.length + history.length

  useEffect(() => {
    if (suggestionsOpen && activeIndex >= 0) {
      popupRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex, suggestionsOpen])

  function remember(value = query, sensitive = caseSensitive, force = false) {
    const signature = JSON.stringify([value.trim(), sensitive])
    if (!force && lastRemembered.current === signature) return
    const next = addSearchHistory(history, { query: value, caseSensitive: sensitive })
    if (next === history) return
    lastRemembered.current = signature
    setHistory(next)
    if (userId) {
      try { localStorage.setItem(searchHistoryKey(userId), JSON.stringify(next)) } catch { /* Search remains available when storage is blocked. */ }
    }
  }

  function chooseSuggestion(index: number) {
    if (index < SEARCH_OPTIONS.length) {
      const prefix = SEARCH_OPTIONS[index].prefix
      const value = query.replace(/^\s*(?:path|file):\s*/i, '').trim()
      setQuery(prefix + (value.includes(' ') && !/^["']/.test(value) ? '"' + value + '"' : value))
    } else {
      const entry = history[index - SEARCH_OPTIONS.length]
      if (!entry) return
      setQuery(entry.query)
      setCaseSensitive(entry.caseSensitive)
      remember(entry.query, entry.caseSensitive, true)
    }
    inputRef.current?.focus()
    setSuggestionsOpen(false)
    setActiveIndex(-1)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setSuggestionsOpen(true)
      setActiveIndex(previous => {
        if (!suggestionsOpen || previous < 0) return event.key === 'ArrowDown' ? 0 : suggestionCount - 1
        return (previous + (event.key === 'ArrowDown' ? 1 : -1) + suggestionCount) % suggestionCount
      })
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (suggestionsOpen && activeIndex >= 0) chooseSuggestion(activeIndex)
      else { remember(query, caseSensitive, true); setSuggestionsOpen(false) }
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setSuggestionsOpen(false)
      setActiveIndex(-1)
    }
  }

  return (
    <div className={styles.panel} data-testid="path-search-panel" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        remember()
        setSuggestionsOpen(false)
        setActiveIndex(-1)
      }
    }}>
      <div className={styles.header}><SearchOutlined /><span>搜索</span></div>
      <div className={styles.searchArea}>
        <div className={styles.searchBar}>
          <SearchOutlined className={styles.searchIcon} />
          <input
            ref={inputRef}
            autoFocus
            className={styles.searchInput}
            type="text"
            role="combobox"
            aria-label="搜索笔记"
            aria-autocomplete="list"
            aria-expanded={suggestionsOpen}
            aria-controls={suggestionsOpen ? id + '-suggestions' : undefined}
            aria-activedescendant={suggestionsOpen && activeIndex >= 0 ? id + '-option-' + activeIndex : undefined}
            aria-describedby={id + '-help'}
            autoComplete="off"
            spellCheck={false}
            placeholder="输入并开始搜索…"
            value={query}
            onFocus={() => { setSuggestionsOpen(true); setActiveIndex(-1) }}
            onChange={event => {
              setQuery(event.target.value)
              setSuggestionsOpen(!event.target.value.trim())
              setActiveIndex(-1)
            }}
            onKeyDown={handleKeyDown}
          />
          <button type="button" className={[styles.caseBtn, caseSensitive ? styles.caseBtnActive : ''].join(' ')} aria-label="区分大小写" aria-pressed={caseSensitive} title="区分大小写" onClick={() => setCaseSensitive(!caseSensitive)}>Aa</button>
          {query && <button type="button" className={styles.iconBtn} aria-label="清空搜索" title="清空搜索" onClick={() => {
            setQuery(''); setActiveIndex(-1); setSuggestionsOpen(true); inputRef.current?.focus()
          }}><CloseOutlined /></button>}
        </div>
        <button type="button" className={styles.iconBtn} aria-label="搜索选项与历史" title="搜索选项与历史" aria-expanded={suggestionsOpen} onClick={() => {
          const open = !suggestionsOpen
          inputRef.current?.focus()
          setSuggestionsOpen(open)
          setActiveIndex(-1)
        }}><ControlOutlined /></button>
        {suggestionsOpen && (
          <div className={styles.suggestions} ref={popupRef} onMouseDown={event => {
            // Keep input focus on option clicks without blocking the popup's scrollbar.
            if ((event.target as HTMLElement).closest('button')) event.preventDefault()
          }}>
            <div className={styles.suggestionHeader}>搜索选项</div>
            <div id={id + '-suggestions'} role="listbox" aria-label="搜索选项与历史">
              <div role="group" aria-label="搜索选项">
                {SEARCH_OPTIONS.map((option, index) => (
                  <button type="button" role="option" tabIndex={-1} id={id + '-option-' + index} aria-selected={activeIndex === index} key={option.prefix}
                    className={styles.suggestionItem} onMouseMove={() => setActiveIndex(index)} onClick={() => chooseSuggestion(index)}>
                    <span className={styles.operator}>{option.prefix}</span><span className={styles.optionDescription}>{option.label}</span>
                  </button>
                ))}
              </div>
              <div className={styles.historyHeader}>
                <span id={id + '-history'}>搜索历史</span>
                {history.length > 0 && <button type="button" className={styles.iconBtn} aria-label="清空搜索历史" title="清空搜索历史" onClick={() => {
                  setHistory([])
                  setActiveIndex(-1)
                  lastRemembered.current = JSON.stringify([query.trim(), caseSensitive])
                  try { if (userId) localStorage.removeItem(searchHistoryKey(userId)) } catch { /* Keep the current session usable. */ }
                }}><CloseOutlined /></button>}
              </div>
              <div role="group" aria-labelledby={id + '-history'}>
                {history.map((entry, index) => (
                  <button type="button" role="option" tabIndex={-1} id={id + '-option-' + (index + SEARCH_OPTIONS.length)} aria-selected={activeIndex === index + SEARCH_OPTIONS.length}
                    key={JSON.stringify(entry)} className={styles.suggestionItem} title={entry.query}
                    onMouseMove={() => setActiveIndex(index + SEARCH_OPTIONS.length)} onClick={() => chooseSuggestion(index + SEARCH_OPTIONS.length)}>
                    <span className={styles.historyQuery}>{entry.query}</span>
                    {entry.caseSensitive && <span className={styles.historyCase} title="区分大小写">Aa</span>}
                  </button>
                ))}
              </div>
            </div>
            {!history.length && <div className={styles.emptyHistory}>暂无搜索历史</div>}
          </div>
        )}
      </div>
      <p id={id + '-help'} className={styles.help}>支持 path:路径、file:文件名，含空格时加引号</p>
      {query.trim() && !parsed.error && (
        <div className={styles.statusBar}>
          <span className={styles.resultCount} role="status">{searchResults.length} 个文件{parsed.text ? ' · ' + totalCount + ' 处匹配' : ''}</span>
          <button type="button" className={styles.sortBtn} onClick={() => setSortBy(sortBy === 'name' ? 'count' : 'name')}>
            {sortBy === 'name' ? '文件名 (A-Z)' : '匹配数'}
          </button>
        </div>
      )}
      <div className={styles.results}>
        {parsed.error && <div className={styles.noResult} role="status">{parsed.error}</div>}
        {query.trim() && !parsed.error && !searchResults.length && <div className={styles.noResult}>未找到匹配文件</div>}
        {searchResults.map(result => <FileGroup key={result.file.id} result={result} query={parsed} caseSensitive={caseSensitive} onSelectFile={fileId => {
          remember(query, caseSensitive, true)
          setSuggestionsOpen(false)
          onSelectFile(fileId)
        }} />)}
      </div>
    </div>
  )
}

const SearchPanel: React.FC<Props> = props => {
  const userId = useAppSelector(state => state.user.userId)
  // A new account must not inherit the previous account's query or in-memory history.
  return <SearchPanelContent key={userId} {...props} userId={userId} />
}

export default SearchPanel
