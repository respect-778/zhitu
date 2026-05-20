import type React from 'react'
import { useState, useMemo } from 'react'
import { SearchOutlined, FileTextOutlined } from '@ant-design/icons'
import { Input } from 'antd'
import type { VFile } from '@/types/growth'
import styles from './SearchPanel.module.less'

interface Props {
  files: VFile[]
  onSelectFile: (id: string) => void
}

interface SearchResult {
  file: VFile
  matchLine: string
  lineNumber: number
}

const SearchPanel: React.FC<Props> = ({ files, onSelectFile }) => {
  const [query, setQuery] = useState('')

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const matches: SearchResult[] = []
    for (const file of files) {
      if (file.type !== 'file' || !file.content) continue
      const lines = file.content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(q)) {
          matches.push({ file, matchLine: lines[i], lineNumber: i + 1 })
          break
        }
      }
    }
    return matches
  }, [query, files])

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <SearchOutlined className={styles.headerIcon} />
        <span>搜索</span>
      </div>
      <Input
        prefix={<SearchOutlined />}
        placeholder="搜索笔记内容..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        allowClear
        size="small"
        className={styles.searchInput}
      />
      <div className={styles.results}>
        {query.trim() && results.length === 0 && (
          <div className={styles.noResult}>未找到匹配内容</div>
        )}
        {results.map(r => (
          <div
            key={r.file.id}
            className={styles.resultItem}
            onClick={() => onSelectFile(r.file.id)}
          >
            <div className={styles.resultTitle}>
              <FileTextOutlined className={styles.resultIcon} />
              {r.file.name}
            </div>
            <div className={styles.resultLine}>
              第{r.lineNumber}行: {r.matchLine.slice(0, 60)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default SearchPanel
