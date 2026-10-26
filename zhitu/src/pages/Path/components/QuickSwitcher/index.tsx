import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { FileTextOutlined, FolderOutlined } from '@ant-design/icons'
import type { VFile } from '@/types/path'
import styles from './index.module.less'

interface Props {
  visible: boolean
  files: VFile[]
  onSelect: (id: string) => void
  onClose: () => void
  onCreate: () => void
}

const QuickSwitcher: React.FC<Props> = ({ visible, files, onSelect, onClose, onCreate }) => {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return files.filter(f => f.type === 'file')
    return files
      .filter(f => f.type === 'file' && f.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aIdx = a.name.toLowerCase().indexOf(q)
        const bIdx = b.name.toLowerCase().indexOf(q)
        return aIdx - bIdx
      })
  }, [files, query])

  useEffect(() => {
    if (visible) {
      setQuery('')
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [visible])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    if (!listRef.current) return
    const active = listRef.current.children[activeIndex] as HTMLElement
    if (active) active.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const handleSelect = useCallback((id: string) => {
    onSelect(id)
    onClose()
  }, [onSelect, onClose])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(prev => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results[activeIndex]) {
        handleSelect(results[activeIndex].id)
      } else if (query.trim()) {
        onCreate()
        onClose()
      }
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!visible) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          className={styles.searchInput}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入文件名以快速跳转..."
        />
        <div ref={listRef} className={styles.resultList}>
          {results.length > 0 ? (
            results.map((file, idx) => (
              <div
                key={file.id}
                className={`${styles.resultItem} ${idx === activeIndex ? styles.active : ''}`}
                onClick={() => handleSelect(file.id)}
                onMouseEnter={() => setActiveIndex(idx)}
              >
                <FileTextOutlined className={styles.resultIcon} />
                <span className={styles.resultName}>{file.name}</span>
                {file.parentId && (
                  <span className={styles.resultPath}>
                    <FolderOutlined style={{ fontSize: 11, marginRight: 3 }} />
                    {files.find(f => f.id === file.parentId)?.name}
                  </span>
                )}
              </div>
            ))
          ) : (
            <div className={styles.noResult}>
              {query.trim() ? '没有匹配的文件' : '暂无文件'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default QuickSwitcher
