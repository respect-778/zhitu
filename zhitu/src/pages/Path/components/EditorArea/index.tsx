import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
import { message } from 'antd'
import { Viewer } from '@bytemd/react'
import type { VFile, WikiLinkBinding } from '@/types/path'
import KnowledgeGraph from '../KnowledgeGraph'
import type { GraphPosition } from '../KnowledgeGraph/model'
import DocumentToolbar from './DocumentToolbar'
import { revealMarkdownLink, getEditorSelection, restoreEditorSelection, canCancelMarkdownFormat, cancelMarkdownFormat, switchMarkdownMode } from './markdownEditing'
import { installMarkdownInteractions } from './markdownInteractions'
import { decodeWikiFragment, getWikiFilePath, parseWikiLinks, projectWikiLinksForReading } from '../../utils/wikiLinks'
import { decorateEditingWikiLinks, editingWikiLinkAtPoint, resolveEditingWikiLink } from '../../utils/wikiLinkInteraction'
import { enhancePathReadingView, normalizePathReadingMarkdown, pathReadingPlugins } from './readingMarkdown'
import styles from './index.module.less'

interface Props {
  file: VFile | null
  files: VFile[]
  linkBindings: WikiLinkBinding[]
  graphOpen: boolean
  showGraph: boolean
  onContentChange: (id: string, content: string) => void
  onRenameFile: (id: string, name: string) => boolean
  onSelectFile: (id: string) => void
  canGoBack: boolean
  canGoForward: boolean
  onNavBack: () => void
  onNavForward: () => void
  onCreateFile: () => void
}


// 内联标题输入
const InlineTitle: React.FC<{
  file: VFile
  onRename: (id: string, name: string) => boolean
  onConfirm?: () => void
}> = ({ file, onRename, onConfirm }) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(file.name)
  const [error, setError] = useState(false)
  const prevNameRef = useRef(file.name)

  useEffect(() => {
    if (file.name === '未命名笔记' || file.name === '新建文件夹') {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [file.id, file.name])

  const handleBlur = () => {
    const trimmed = value.trim()
    if (!trimmed) {
      setValue(prevNameRef.current)
      setError(false)
      return
    }
    if (trimmed === prevNameRef.current) {
      setError(false)
      return
    }
    const success = onRename(file.id, trimmed)
    if (!success) {
      setError(true)
      setTimeout(() => {
        setValue(prevNameRef.current)
        setError(false)
      }, 1500)
    } else {
      prevNameRef.current = trimmed
      setError(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      inputRef.current?.blur()
      onConfirm?.()
    } else if (e.key === 'Escape') {
      setValue(prevNameRef.current)
      setError(false)
      inputRef.current?.blur()
    }
  }

  return (
    <div className={styles.inlineTitle}>
      <input
        ref={inputRef}
        className={`${styles.titleInput} ${error ? styles.titleError : ''}`}
        value={value}
        onChange={e => { setValue(e.target.value); setError(false) }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="输入文件名..."
      />
      {error && <span className={styles.titleErrorMsg}>同级目录下存在同名文件</span>}
    </div>
  )
}

interface WikiLinkPickerState {
  query: string
  candidateIds: string[]
  selectedIndex: number
  left: number
  top: number
}

// 编辑区
const EditorArea: React.FC<Props> = ({ file, files, linkBindings, graphOpen, showGraph, onContentChange, onRenameFile, onSelectFile, canGoBack, canGoForward, onNavBack, onNavForward, onCreateFile }) => {
  const editorRef = useRef<HTMLDivElement>(null)
  const readingViewRef = useRef<HTMLDivElement>(null)
  const vditorRef = useRef<Vditor | null>(null)
  const selectionRef = useRef<Range | null>(null)
  const editingModeRef = useRef<'ir' | 'sv'>('ir')
  const latestContentRef = useRef(file?.content ?? '')
  const fileRef = useRef(file)
  const filesRef = useRef(files)
  const linkBindingsRef = useRef(linkBindings)
  const graphPositionCacheRef = useRef(new Map<string, GraphPosition>())
  const pendingHeadingRef = useRef<{ fileId: string; heading: string } | null>(null)
  const wikiLinkRangeRef = useRef<Range | null>(null)
  const wikiLinkPickerRef = useRef<WikiLinkPickerState | null>(null)
  const pickerFrameRef = useRef<number | null>(null)
  const wikiDecorationFrameRef = useRef<number | null>(null)
  const readingEnhancementFrameRef = useRef<number | null>(null)
  const readingObserverRef = useRef<MutationObserver | null>(null)
  const [reading, setReading] = useState(false)
  const [sourceMode, setSourceMode] = useState(false)
  const [canCancelFormat, setCanCancelFormat] = useState(false)
  const [canInsertAfter, setCanInsertAfter] = useState(false)
  const [wikiLinkPicker, setWikiLinkPicker] = useState<WikiLinkPickerState | null>(null)
  const fileId = file?.id
  const fileContent = file?.content ?? ''
  const readingMarkdown = useMemo(() => file
    ? normalizePathReadingMarkdown(projectWikiLinksForReading(file, files, linkBindings))
    : '', [file, files, linkBindings])

  const attachReadingView = useCallback((node: HTMLDivElement | null) => {
    readingObserverRef.current?.disconnect()
    readingObserverRef.current = null
    if (readingEnhancementFrameRef.current !== null) {
      window.cancelAnimationFrame(readingEnhancementFrameRef.current)
      readingEnhancementFrameRef.current = null
    }
    readingViewRef.current = node
    if (!node) return
    const enhance = () => {
      const markdownBody = node.querySelector<HTMLElement>('.markdown-body')
      if (markdownBody) enhancePathReadingView(markdownBody)
    }
    enhance()
    const observer = new MutationObserver(enhance)
    observer.observe(node, { childList: true, subtree: true })
    readingObserverRef.current = observer
    readingEnhancementFrameRef.current = window.requestAnimationFrame(() => {
      readingEnhancementFrameRef.current = null
      enhance()
    })
  }, [readingMarkdown])

  useEffect(() => {
    fileRef.current = file
    filesRef.current = files
    linkBindingsRef.current = linkBindings
  }, [file, files, linkBindings])

  const updateWikiLinkPicker = useCallback((next: WikiLinkPickerState | null) => {
    wikiLinkPickerRef.current = next
    wikiLinkRangeRef.current = next ? wikiLinkRangeRef.current : null
    setWikiLinkPicker(next)
  }, [])

  const detectWikiLinkPicker = useCallback(() => {
    const root = editorRef.current
    const selection = window.getSelection()
    if (!root || !selection?.rangeCount || !selection.isCollapsed) {
      updateWikiLinkPicker(null)
      return
    }
    const range = selection.getRangeAt(0)
    if (!root.contains(range.startContainer)) {
      updateWikiLinkPicker(null)
      return
    }
    let textNode: Text | null = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer as Text : null
    let textOffset = range.startOffset
    if (!textNode && range.startContainer.nodeType === Node.ELEMENT_NODE) {
      const container = range.startContainer as Element
      const previousChild = container.childNodes[Math.max(0, range.startOffset - 1)]
      if (previousChild?.nodeType === Node.TEXT_NODE) {
        textNode = previousChild as Text
        textOffset = textNode.data.length
      }
    }
    const parent = textNode?.parentElement ?? (range.startContainer as HTMLElement)
    if (parent?.closest('code,.vditor-ir__marker--pre')) {
      updateWikiLinkPicker(null)
      return
    }
    if (!textNode) {
      updateWikiLinkPicker(null)
      return
    }
    const beforeCursor = textNode.data.slice(0, textOffset)
    const match = beforeCursor.match(/(?:^|[^\\])\[\[([^\]\n]{0,80})$/)
    if (!match) {
      updateWikiLinkPicker(null)
      return
    }
    const query = match[1]
    const targetQuery = query.split(/[|#]/, 1)[0].trim().toLocaleLowerCase('zh-CN')
    const candidates = filesRef.current
      .filter(candidate => candidate.type === 'file')
      .map(candidate => ({ candidate, path: getWikiFilePath(candidate, filesRef.current) }))
      .filter(({ candidate, path }) => !targetQuery
        || candidate.name.toLocaleLowerCase('zh-CN').includes(targetQuery)
        || path.toLocaleLowerCase('zh-CN').includes(targetQuery))
      .sort((a, b) => {
        const aStarts = a.candidate.name.toLocaleLowerCase('zh-CN').startsWith(targetQuery) ? 0 : 1
        const bStarts = b.candidate.name.toLocaleLowerCase('zh-CN').startsWith(targetQuery) ? 0 : 1
        return aStarts - bStarts || a.path.localeCompare(b.path, 'zh-CN')
      })
      .slice(0, 8)
    const normalizedRange = range.cloneRange()
    normalizedRange.setStart(textNode, textOffset)
    normalizedRange.collapse(true)
    const rect = normalizedRange.getBoundingClientRect()
    const fallbackRect = parent?.getBoundingClientRect()
    wikiLinkRangeRef.current = normalizedRange
    const previous = wikiLinkPickerRef.current
    const candidateIds = candidates.map(item => item.candidate.id)
    const preservesSelection = previous?.query === query
      && previous.candidateIds.length === candidateIds.length
      && previous.candidateIds.every((id, index) => id === candidateIds[index])
    updateWikiLinkPicker({
      query,
      candidateIds,
      selectedIndex: preservesSelection ? Math.min(previous.selectedIndex, Math.max(0, candidateIds.length - 1)) : 0,
      left: Math.max(8, Math.min(rect.left || fallbackRect?.left || 8, window.innerWidth - 340)),
      top: Math.max(8, Math.min((rect.bottom || fallbackRect?.bottom || 8) + 6, window.innerHeight - 320)),
    })
  }, [updateWikiLinkPicker])

  const scheduleWikiLinkPicker = useCallback(() => {
    if (pickerFrameRef.current !== null) cancelAnimationFrame(pickerFrameRef.current)
    pickerFrameRef.current = requestAnimationFrame(() => {
      pickerFrameRef.current = requestAnimationFrame(() => {
        pickerFrameRef.current = null
        detectWikiLinkPicker()
      })
    })
  }, [detectWikiLinkPicker])

  const decorateWikiLinks = useCallback(() => {
    const editor = vditorRef.current
    const currentFile = fileRef.current
    const root = editor?.vditor?.ir?.element
    if (!editor?.vditor?.lute || !currentFile || !root || editor.getCurrentMode() !== 'ir') return
    const currentMarkdown = editor.getValue()
    decorateEditingWikiLinks(root, { ...currentFile, content: currentMarkdown }, filesRef.current, linkBindingsRef.current)
  }, [])

  const scheduleWikiLinkDecoration = useCallback(() => {
    if (wikiDecorationFrameRef.current !== null) cancelAnimationFrame(wikiDecorationFrameRef.current)
    wikiDecorationFrameRef.current = requestAnimationFrame(() => {
      wikiDecorationFrameRef.current = null
      decorateWikiLinks()
    })
  }, [decorateWikiLinks])

  useEffect(() => {
    const pending = pendingHeadingRef.current
    if (!reading || !file || !pending || pending.fileId !== file.id) return
    const timer = window.setTimeout(() => {
      const heading = Array.from(readingViewRef.current?.querySelectorAll('h1,h2,h3,h4,h5,h6') ?? [])
        .find(element => element.textContent?.trim() === pending.heading)
      if (heading) heading.scrollIntoView({ block: 'start' })
      else message.info('已打开笔记，但目标标题已变化')
      pendingHeadingRef.current = null
    }, 0)
    return () => window.clearTimeout(timer)
  }, [file, reading])

  const handleReadingLinkClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a')
    const href = anchor?.getAttribute('href') ?? ''
    if (!href.startsWith('#knowvia-')) return
    event.preventDefault()
    event.stopPropagation()
    const resolvedMatch = href.match(/^#knowvia-file-([0-9a-f]+?)(?:-heading-([0-9a-f]+))?$/)
    if (!resolvedMatch) {
      message.info('这个内部链接尚未解析，请检查文件名或路径')
      return
    }
    const targetFileId = decodeWikiFragment(resolvedMatch[1])
    const heading = resolvedMatch[2] ? decodeWikiFragment(resolvedMatch[2]) : null
    if (!targetFileId) return
    if (heading) pendingHeadingRef.current = { fileId: targetFileId, heading }
    onSelectFile(targetFileId)
  }, [onSelectFile])

  const handleEditingLinkClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!file || event.button !== 0 || event.altKey) return
    const eventElement = event.target instanceof Element ? event.target : null
    const decorated = eventElement?.closest<HTMLElement>('[data-wiki-link]')
    const root = eventElement?.closest<HTMLElement>('[contenteditable="true"]') ?? null
    if (!root || !editorRef.current?.contains(root)) return
    const decoratedRaw = decorated?.getAttribute('data-wiki-link-raw') ?? ''
    const link = decoratedRaw ? parseWikiLinks(decoratedRaw)[0] : (event.ctrlKey || event.metaKey
      ? editingWikiLinkAtPoint(root, event.clientX, event.clientY)
      : undefined)
    if (!link) return
    event.preventDefault()
    event.stopPropagation()
    const currentMarkdown = vditorRef.current?.vditor?.lute ? vditorRef.current.getValue() : file.content
    const resolved = resolveEditingWikiLink(link, { ...file, content: currentMarkdown }, files, linkBindings)
    if (resolved.status !== 'resolved' || !resolved.targetFileId) {
      message.info(resolved.status === 'ambiguous'
        ? '此处有同名或不同绑定的笔记，请使用完整目录路径，或在阅读模式打开'
        : '未找到对应笔记，请检查名称或路径，目标也可能已被删除')
      return
    }
    if (resolved.headingText) {
      pendingHeadingRef.current = { fileId: resolved.targetFileId, heading: resolved.headingText }
      setReading(true)
    }
    onSelectFile(resolved.targetFileId)
  }, [file, files, linkBindings, onSelectFile])

  const commitWikiLink = useCallback((targetFileId: string) => {
    const picker = wikiLinkPickerRef.current
    const range = wikiLinkRangeRef.current
    const editor = vditorRef.current
    const target = filesRef.current.find(candidate => candidate.id === targetFileId && candidate.type === 'file')
    if (!picker || !range || !editor?.vditor?.lute || !target || range.startContainer.nodeType !== Node.TEXT_NODE) return
    const targetName = target.name.replace(/\.md$/i, '')
    const sameNameCount = filesRef.current.filter(candidate => candidate.type === 'file' && candidate.name.replace(/\.md$/i, '') === targetName).length
    const targetText = sameNameCount > 1 ? getWikiFilePath(target, filesRef.current) : targetName
    const startOffset = range.startOffset - picker.query.length - 2
    if (startOffset < 0 || !range.startContainer.isConnected) {
      updateWikiLinkPicker(null)
      return
    }
    const selection = window.getSelection()
    range.setStart(range.startContainer, startOffset)
    range.deleteContents()
    range.collapse(true)
    selection?.removeAllRanges()
    selection?.addRange(range)
    editor.insertValue(`[[${targetText}]]`, true)
    updateWikiLinkPicker(null)
    requestAnimationFrame(() => {
      if (!file || !editor.vditor?.lute) return
      const content = editor.getValue()
      if (content !== latestContentRef.current) {
        latestContentRef.current = content
        onContentChange(file.id, content)
      }
    })
  }, [file, onContentChange, updateWikiLinkPicker])

  const toggleReading = () => {
    const editor = vditorRef.current
    if (!reading && file && editor?.vditor?.lute) {
      // Reading can be opened before Vditor's debounced undo snapshot runs.
      editor.vditor.undo?.addToUndoStack(editor.vditor)
      const content = editor.getValue()
      if (content !== latestContentRef.current) {
        latestContentRef.current = content
        onContentChange(file.id, content)
      }
      editor.blur()
    }
    setReading(value => !value)
  }

  const prepareEditorActions = () => {
    const editor = vditorRef.current
    const range = editor?.vditor?.lute ? getEditorSelection(editor) : null
    selectionRef.current = range
    setCanCancelFormat(!!editor && canCancelMarkdownFormat(editor, range))
    setCanInsertAfter(!!range && editor?.getCurrentMode() === 'ir')
  }

  const handleEditorAction = (action: string) => {
    const editor = vditorRef.current
    if (!editor?.vditor?.lute || !file) return
    if (action !== 'source') editor.vditor.undo?.addToUndoStack(editor.vditor)
    if (action === 'source') {
      const mode = editor.getCurrentMode() === 'sv' ? 'ir' : 'sv'
      switchMarkdownMode(editor, mode)
      editingModeRef.current = mode
      setSourceMode(mode === 'sv')
    } else if (action === 'cancel-format') {
      cancelMarkdownFormat(editor, selectionRef.current)
    } else if (action === 'insert-after' && restoreEditorSelection(editor, selectionRef.current)) {
      editor.insertEmptyBlock('afterend')
    }
    if (action !== 'source') editor.vditor.undo?.addToUndoStack(editor.vditor)
    const content = editor.getValue()
    if (content !== latestContentRef.current) {
      latestContentRef.current = content
      onContentChange(file.id, content)
    }
    selectionRef.current = null
  }

  useEffect(() => {
    if (!editorRef.current || !file) {
      vditorRef.current?.destroy(); vditorRef.current = null
      return
    }
    vditorRef.current?.destroy(); vditorRef.current = null
    let disposed = false
    let removeInteractions: (() => void) | undefined
    const captureContent = (value: string) => {
      const content = value
      if (!disposed && content !== latestContentRef.current) {
        latestContentRef.current = content
        onContentChange(file.id, content)
      }
    }
    const captureInput = () => {
      const current = vd.vditor?.[vd.getCurrentMode()]
      if (!disposed && vd.vditor?.lute && current && !current.composingLock) captureContent(vd.getValue())
      scheduleWikiLinkPicker()
      scheduleWikiLinkDecoration()
    }
    const editorHost = editorRef.current
    const captureMode = () => {
      if (disposed || !vd.vditor?.lute) return
      const mode = vd.getCurrentMode() === 'sv' ? 'sv' : 'ir'
      editingModeRef.current = mode
      setSourceMode(mode === 'sv')
      // Native Enter/Backspace/undo mutate the DOM without an input event.
      // Capture after Vditor's handler, before React can replay older props.
      captureInput()
    }
    const captureWikiPickerKeys = (event: KeyboardEvent) => {
      const picker = wikiLinkPickerRef.current
      if (!picker || event.isComposing) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        updateWikiLinkPicker(null)
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (picker.candidateIds.length === 0) return
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        const direction = event.key === 'ArrowDown' ? 1 : -1
        const next = {
          ...picker,
          selectedIndex: (picker.selectedIndex + direction + picker.candidateIds.length) % picker.candidateIds.length,
        }
        wikiLinkPickerRef.current = next
        setWikiLinkPicker(next)
        return
      }
      if (event.key === 'Enter' && picker.candidateIds[picker.selectedIndex]) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        commitWikiLink(picker.candidateIds[picker.selectedIndex])
      }
    }
    const captureWikiPickerKeyUp = (event: KeyboardEvent) => {
      if (wikiLinkPickerRef.current && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) return
      scheduleWikiLinkPicker()
    }
    const captureSelection = () => { if (wikiLinkPickerRef.current) scheduleWikiLinkPicker() }
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    const vd = new Vditor(editorRef.current, {
      mode: editingModeRef.current, value: file.content ?? '', height: '100%',
      // Keep native commands and shortcuts registered; DocumentToolbar owns their UI.
      toolbar: ['headings', 'bold', 'italic', 'strike', 'link', 'list', 'ordered-list', 'check', 'quote', 'code', 'inline-code', 'insert-before', 'insert-after', 'edit-mode'],
      outline: { enable: false, position: 'right' }, counter: { enable: false },
      cache: { enable: false }, placeholder: '开始输入...',
      link: { isOpen: false, click: revealMarkdownLink },
      theme: isDark ? 'dark' : 'classic',
      preview: {
        mode: 'editor',
        theme: { current: isDark ? 'dark' : 'light' },
        hljs: { style: isDark ? 'native' : 'github', lineNumber: false },
        markdown: { codeBlockPreview: true, mathBlockPreview: false },
      },
      input: captureContent,
      after: () => {
        if (disposed) { vd.destroy(); return }
        const editor = vditorRef.current
        if (editor?.vditor?.lute && editor.vditor.ir?.element && editor.getValue() !== latestContentRef.current) {
          editor.setValue(latestContentRef.current, true)
        }
        if (editor?.vditor.ir?.element) removeInteractions = installMarkdownInteractions(editor, captureContent)
        scheduleWikiLinkDecoration()
        // Vditor 的 input 回调有延迟；及时记录输入，避免快速切换时遗漏最后一次编辑。
        editorHost.addEventListener('input', captureInput)
        editorHost.addEventListener('compositionend', captureInput)
        editorHost.addEventListener('keydown', captureMode)
        editorHost.addEventListener('keydown', captureWikiPickerKeys, true)
        editorHost.addEventListener('keyup', captureWikiPickerKeyUp)
        document.addEventListener('selectionchange', captureSelection)
      },
    })
    vditorRef.current = vd
    return () => {
      if (vd.vditor?.lute) captureContent(vd.getValue())
      disposed = true
      selectionRef.current = null
      removeInteractions?.()
      if (vd.vditor) {
        editorHost.removeEventListener('input', captureInput)
        editorHost.removeEventListener('compositionend', captureInput)
        editorHost.removeEventListener('keydown', captureMode)
        editorHost.removeEventListener('keydown', captureWikiPickerKeys, true)
        editorHost.removeEventListener('keyup', captureWikiPickerKeyUp)
        document.removeEventListener('selectionchange', captureSelection)
        clearTimeout(vd.vditor.ir?.processTimeoutId)
        clearTimeout(vd.vditor.sv?.processTimeoutId)
        vd.destroy()
      }
      vditorRef.current = null
      updateWikiLinkPicker(null)
      if (pickerFrameRef.current !== null) cancelAnimationFrame(pickerFrameRef.current)
      if (wikiDecorationFrameRef.current !== null) cancelAnimationFrame(wikiDecorationFrameRef.current)
    }
  // Vditor is an imperative editor instance: recreate only when the active file changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.id])

  useEffect(() => {
    latestContentRef.current = fileContent
    const editor = vditorRef.current
    if (editor?.vditor?.lute && editor.getValue() !== fileContent) {
      editor.setValue(fileContent, true)
    }
  }, [fileId, fileContent, onContentChange])

  useEffect(() => { scheduleWikiLinkDecoration() }, [files, linkBindings, scheduleWikiLinkDecoration])

  useEffect(() => {
    if (!wikiLinkPicker) return
    const frame = requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-testid="wiki-link-picker"] [role="option"][aria-selected="true"]')
        ?.scrollIntoView({ block: 'nearest' })
    })
    return () => cancelAnimationFrame(frame)
  }, [wikiLinkPicker])

  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (!vditorRef.current) return
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
      vditorRef.current.setTheme(isDark ? 'dark' : 'classic', isDark ? 'dark' : 'light', isDark ? 'native' : 'github')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  const handleTableWheel = useCallback((event: WheelEvent) => {
    const target = event.target instanceof Element ? event.target : null
    const scrollArea = target?.closest<HTMLElement>('.path-table-scroll')
      ?? target?.closest<HTMLElement>('table')
    if (!scrollArea) return

    const horizontalDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (horizontalDelta && scrollArea.scrollWidth > scrollArea.clientWidth) {
      const previousLeft = scrollArea.scrollLeft
      scrollArea.scrollLeft += horizontalDelta
      if (scrollArea.scrollLeft !== previousLeft) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
    }

    if (!event.deltaY) return

    let verticalScroller: HTMLElement | null = scrollArea.parentElement
    while (verticalScroller) {
      const { overflowY } = getComputedStyle(verticalScroller)
      if (/auto|scroll|overlay/.test(overflowY) && verticalScroller.scrollHeight > verticalScroller.clientHeight) {
        const previousTop = verticalScroller.scrollTop
        verticalScroller.scrollTop += event.deltaY
        if (verticalScroller.scrollTop !== previousTop) {
          event.preventDefault()
          event.stopPropagation()
        }
        return
      }
      verticalScroller = verticalScroller.parentElement
    }
  }, [])

  useEffect(() => {
    const hosts = [editorRef.current, readingViewRef.current].filter((host): host is HTMLDivElement => Boolean(host))
    hosts.forEach(host => host.addEventListener('wheel', handleTableWheel, { passive: false }))
    return () => hosts.forEach(host => host.removeEventListener('wheel', handleTableWheel))
  }, [handleTableWheel, reading])

  return (
    <>
      <DocumentToolbar file={file} files={files} showGraph={showGraph} reading={reading} sourceMode={sourceMode} canCancelFormat={canCancelFormat} canInsertAfter={canInsertAfter} onPrepareEditorActions={prepareEditorActions} onEditorAction={handleEditorAction} canGoBack={canGoBack} canGoForward={canGoForward} onNavBack={onNavBack} onNavForward={onNavForward} onToggleReading={toggleReading} />
      {wikiLinkPicker && !reading && !showGraph && (
        <div
          className={styles.wikiLinkPicker}
          style={{ left: wikiLinkPicker.left, top: wikiLinkPicker.top }}
          role="listbox"
          aria-label="内部链接候选"
          aria-activedescendant={wikiLinkPicker.candidateIds[wikiLinkPicker.selectedIndex]
            ? `wiki-link-option-${wikiLinkPicker.candidateIds[wikiLinkPicker.selectedIndex]}`
            : undefined}
          data-testid="wiki-link-picker"
        >
          {wikiLinkPicker.candidateIds.length === 0 ? (
            <div className={styles.wikiLinkEmpty}>未找到文件；保存不会自动新建页面</div>
          ) : wikiLinkPicker.candidateIds.map((candidateId, index) => {
            const candidate = files.find(item => item.id === candidateId)
            if (!candidate) return null
            const path = getWikiFilePath(candidate, files)
            return (
              <button
                type="button"
                key={candidate.id}
                id={`wiki-link-option-${candidate.id}`}
                role="option"
                data-wiki-link-candidate-id={candidate.id}
                aria-selected={index === wikiLinkPicker.selectedIndex}
                className={index === wikiLinkPicker.selectedIndex ? styles.wikiLinkCandidateActive : ''}
                onMouseDown={event => {
                  event.preventDefault()
                  commitWikiLink(candidate.id)
                }}
                onMouseEnter={() => {
                  const next = { ...wikiLinkPicker, selectedIndex: index }
                  wikiLinkPickerRef.current = next
                  setWikiLinkPicker(next)
                }}
              >
                <strong>{candidate.name}</strong>
                <span>{path}</span>
              </button>
            )
          })}
        </div>
      )}
      {graphOpen && (
        <div className={styles.editor} style={{ display: showGraph ? 'flex' : 'none' }}>
          <div className={styles.editorContent}>
            <KnowledgeGraph files={files} linkBindings={linkBindings} positionCache={graphPositionCacheRef.current} onSelectFile={onSelectFile} />
          </div>
        </div>
      )}
      <div style={{ display: showGraph ? 'none' : 'flex', flex: 1, flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-color)' }}>
        {!file ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyContent}>
              <p className={styles.emptyAction} onClick={onCreateFile}>新建笔记 (Alt + N)</p>
              <p className={styles.emptyAction}>打开文件 (Ctrl + O)</p>
            </div>
          </div>
        ) : (
          <div className={styles.editor}>
            {reading && (
              <div ref={attachReadingView} className={styles.readingView} data-testid="path-reading-view" onClickCapture={handleReadingLinkClick}>
                <h1 className={styles.readingTitle}>{file.name}</h1>
                <Viewer value={readingMarkdown} plugins={pathReadingPlugins} />
              </div>
            )}
            <div className={styles.editingView} style={{ display: reading ? 'none' : 'flex' }}>
              <InlineTitle key={`${file.id}:${file.name}`} file={file} onRename={onRenameFile} onConfirm={() => vditorRef.current?.focus()} />
              <div className={styles.editorContent}>
                <div ref={editorRef} className={styles.vditorContainer} onClickCapture={handleEditingLinkClick} />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default EditorArea
