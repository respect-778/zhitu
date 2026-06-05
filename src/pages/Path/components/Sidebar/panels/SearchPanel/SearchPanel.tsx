import type React from 'react'
import { useState, useMemo, useCallback } from 'react'
import {
  SearchOutlined,
  RightOutlined,
  CloseCircleFilled,
} from '@ant-design/icons'
import type { VFile } from '@/types/path'
import styles from './SearchPanel.module.less'

interface Props {
  files: VFile[]
  onSelectFile: (id: string) => void
}

interface MatchLine {
  lineNumber: number
  text: string
}

interface FileMatch {
  file: VFile
  matches: MatchLine[]
}

type SortBy = 'name' | 'count'

const SORT_LABELS: Record<SortBy, string> = {
  name: '文件名 (A-Z)',
  count: '匹配数',
}

const HighlightText: React.FC<{ text: string; keyword: string; caseSensitive: boolean }> = ({ text, keyword, caseSensitive }) => {
  if (!keyword) return <>{text}</>
  const flags = caseSensitive ? 'g' : 'gi'
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, flags))
  return (
    <>
      {parts.map((part, i) => {
        const isMatch = caseSensitive
          ? part === keyword
          : part.toLowerCase() === keyword.toLowerCase()
        return isMatch
          ? <mark key={i} className={styles.highlight}>{part}</mark>
          : <span key={i}>{part}</span>
      })}
    </>
  )
}

const FileGroup: React.FC<{
  fm: FileMatch
  keyword: string
  caseSensitive: boolean
  onSelectFile: (id: string) => void
}> = ({ fm, keyword, caseSensitive, onSelectFile }) => {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className={styles.fileGroup}>
      <div
        className={styles.fileHeader}
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`${styles.chevron} ${expanded ? styles.chevronExpanded : ''}`}>
          <RightOutlined />
        </span>
        <span className={styles.fileName}>{fm.file.name}</span>
        <span className={styles.matchCount}>{fm.matches.length}</span>
      </div>
      {expanded && (
        <div className={styles.matchList}>
          {fm.matches.map((m) => (
            <div
              key={m.lineNumber}
              className={styles.matchItem}
              onClick={() => onSelectFile(fm.file.id)}
            >
              <span className={styles.matchText}>
                <HighlightText text={m.text} keyword={keyword} caseSensitive={caseSensitive} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const SearchPanel: React.FC<Props> = ({ files, onSelectFile }) => {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [sortBy, setSortBy] = useState<SortBy>('name')

  const rawResults = useMemo<FileMatch[]>(() => {
    const q = query.trim()
    if (!q) return []
    const matches: FileMatch[] = []
    for (const file of files) {
      if (file.type !== 'file' || !file.content) continue
      const lines = file.content.split('\n')
      const fileMatches: MatchLine[] = []
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const haystack = caseSensitive ? line : line.toLowerCase()
        const needle = caseSensitive ? q : q.toLowerCase()
        if (haystack.includes(needle)) {
          const trimmed = line.trim()
          if (trimmed) fileMatches.push({ lineNumber: i + 1, text: trimmed })
        }
      }
      if (fileMatches.length > 0) matches.push({ file, matches: fileMatches })
    }
    return matches
  }, [query, files, caseSensitive])

  const searchResults = useMemo<FileMatch[]>(() => {
    const sorted = [...rawResults]
    if (sortBy === 'name') {
      sorted.sort((a, b) => a.file.name.localeCompare(b.file.name, 'zh-CN'))
    } else {
      sorted.sort((a, b) => b.matches.length - a.matches.length)
    }
    return sorted
  }, [rawResults, sortBy])

  const totalCount = useMemo(
    () => rawResults.reduce((sum, fm) => sum + fm.matches.length, 0),
    [rawResults]
  )

  const handleClear = useCallback(() => setQuery(''), [])

  const toggleSort = useCallback(() => {
    setSortBy(prev => prev === 'name' ? 'count' : 'name')
  }, [])

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <SearchOutlined className={styles.headerIcon} />
        <span>当前计划</span>
      </div>

      <div className={styles.searchBar}>
        <SearchOutlined className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          type="text"
          placeholder="搜索笔记内容..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button
          className={`${styles.caseBtn} ${caseSensitive ? styles.caseBtnActive : ''}`}
          onClick={() => setCaseSensitive(!caseSensitive)}
          title="区分大小写"
        >
          Aa
        </button>
        {query && (
          <CloseCircleFilled
            className={styles.clearBtn}
            onClick={handleClear}
          />
        )}
      </div>

      {query.trim() && (
        <div className={styles.statusBar}>
          <span className={styles.resultCount}>{totalCount} 项结果</span>
          <button className={styles.sortBtn} onClick={toggleSort}>
            {SORT_LABELS[sortBy]}
          </button>
        </div>
      )}

      <div className={styles.results}>
        {query.trim() && searchResults.length === 0 && (
          <div className={styles.noResult}>未找到匹配内容</div>
        )}
        {searchResults.map(fm => (
          <FileGroup
            key={fm.file.id}
            fm={fm}
            keyword={query.trim()}
            caseSensitive={caseSensitive}
            onSelectFile={onSelectFile}
          />
        ))}
      </div>
    </div>
  )
}

export default SearchPanel
