import React, { useRef, useEffect, useMemo, useCallback, useState, memo } from 'react'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
import ForceGraph2D from 'react-force-graph-2d'
import { FileTextOutlined, LeftOutlined, RightOutlined, ShareAltOutlined } from '@ant-design/icons'
import type { VFile, GraphNode, GraphLink } from '@/types/path'
import styles from './index.module.less'

interface Props {
  file: VFile | null
  files: VFile[]
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

function extractWikilinks(content: string): string[] {
  return Array.from(content.matchAll(/\[\[([^\]]+)\]\]/g), m => m[1])
}

function useGraphData(files: VFile[]) {
  return useMemo(() => {
    const fileNodes = files.filter(f => f.type === 'file')
    const nodes: GraphNode[] = fileNodes.map(f => ({ id: f.id, name: f.name }))
    const links: GraphLink[] = []
    const nameToId = new Map(fileNodes.map(f => [f.name, f.id]))
    for (const f of fileNodes) {
      if (f.content) {
        for (const linked of extractWikilinks(f.content)) {
          const targetId = nameToId.get(linked)
          if (targetId && targetId !== f.id) links.push({ source: f.id, target: targetId, type: 'wikilink' })
        }
      }
      const tags = f.metadata?.tags ?? []
      if (tags.length > 0) {
        for (const other of fileNodes) {
          if (other.id <= f.id) continue
          if (tags.some(t => (other.metadata?.tags ?? []).includes(t)))
            links.push({ source: f.id, target: other.id, type: 'tag' })
        }
      }
      if (f.parentId) {
        for (const sib of fileNodes.filter(o => o.parentId === f.parentId && o.id > f.id))
          links.push({ source: f.id, target: sib.id, type: 'folder' })
      }
    }
    return { nodes, links }
  }, [files])
}

function getNodeId(n: string | GraphNode): string {
  return typeof n === 'string' ? n : n.id
}

const PRIMARY = '#2e5995'
const NEIGHBOR_LIGHT = '#3a3a3a'
const NEIGHBOR_DARK = '#c8c8c8'
const GRAY_NODE_LIGHT = '#b0b8c8'
const GRAY_NODE_DARK = '#505868'
const GRAY_LINK_LIGHT = 'rgba(160,160,160,0.28)'
const GRAY_LINK_DARK = 'rgba(120,120,120,0.28)'
const DIM_ALPHA = 0.06

// lerp between two hex/rgba colors via alpha — simpler: just lerp the highlight alpha
function lerpColor(from: string, to: string, t: number): string {
  // We only need to lerp opacity for the dim effect; use t directly in rgba
  // For node fill we blend between gray and primary via t
  const parse = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
  const f = parse(from.startsWith('#') ? from : PRIMARY)
  const tC = parse(to.startsWith('#') ? to : PRIMARY)
  const r = Math.round(f[0] + (tC[0] - f[0]) * t)
  const g = Math.round(f[1] + (tC[1] - f[1]) * t)
  const b = Math.round(f[2] + (tC[2] - f[2]) * t)
  return `rgb(${r},${g},${b})`
}

// 关系图谱
const GraphView: React.FC<{ files: VFile[]; onSelectFile: (id: string) => void }> = memo(({ files, onSelectFile }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null)
  const { nodes, links } = useGraphData(files)
  const graphData = useMemo(() => ({ nodes, links }), [nodes, links])
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  const [size, setSize] = useState({ w: 800, h: 600 })

  const hoveredIdRef = useRef<string | null>(null)
  const highlightRef = useRef<Map<string, number>>(new Map())
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(containerRef.current)
    setSize({ w: containerRef.current.clientWidth, h: containerRef.current.clientHeight })
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    const canvas = containerRef.current.querySelector('canvas')
    if (canvas) canvasRef.current = canvas
  })

  const linksRef = useRef(links)
  const nodesRef = useRef(nodes)
  useEffect(() => { linksRef.current = links }, [links])
  useEffect(() => { nodesRef.current = nodes }, [nodes])

  const animateHighlight = useCallback(() => {
    const hovered = hoveredIdRef.current
    const neighbors = new Set<string>()
    if (hovered) {
      for (const l of linksRef.current) {
        const s = getNodeId(l.source), t = getNodeId(l.target)
        if (s === hovered) neighbors.add(t)
        if (t === hovered) neighbors.add(s)
      }
    }

    let needsFrame = false
    for (const node of nodesRef.current) {
      const target = hovered === node.id ? 2 : neighbors.has(node.id) ? 1 : 0
      const current = highlightRef.current.get(node.id) ?? 0
      const next = current + (target - current) * 0.15
      if (Math.abs(next - target) < 0.005) {
        highlightRef.current.set(node.id, target)
      } else {
        highlightRef.current.set(node.id, next)
        needsFrame = true
      }
    }

    if (needsFrame) {
      rafRef.current = requestAnimationFrame(animateHighlight)
    } else {
      rafRef.current = null
    }
  }, [])

  const startAnimation = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(animateHighlight)
  }, [animateHighlight])

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  const nodeCanvasObject = useCallback((node: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const n = node as GraphNode & { x: number; y: number }
    const v = highlightRef.current.get(n.id) ?? 0
    const anyHovered = hoveredIdRef.current !== null

    // v: 0=unrelated, 1=neighbor, 2=hovered
    // radius: hovered=7, neighbor=5, default=3.5, dimmed=3
    const r = anyHovered
      ? (v > 1.5 ? 3.5 + (v - 1) * 3.5 : v > 0.5 ? 3 + v * 2 : 3 + v * 0.5)
      : 3.5

    ctx.beginPath()
    ctx.arc(n.x, n.y, r, 0, 2 * Math.PI)

    if (!anyHovered) {
      ctx.fillStyle = isDark ? GRAY_NODE_DARK : GRAY_NODE_LIGHT
    } else if (v > 1.5) {
      ctx.fillStyle = PRIMARY
    } else if (v > 0.5) {
      const neighborColor = isDark ? NEIGHBOR_DARK : NEIGHBOR_LIGHT
      const grayColor = isDark ? GRAY_NODE_DARK : GRAY_NODE_LIGHT
      ctx.fillStyle = lerpColor(grayColor, neighborColor, Math.min(v, 1))
    } else {
      const grayColor = isDark ? GRAY_NODE_DARK : GRAY_NODE_LIGHT
      const dimAlpha = DIM_ALPHA + (1 - DIM_ALPHA) * v
      const [rr, gg, bb] = [
        parseInt(grayColor.slice(1, 3), 16),
        parseInt(grayColor.slice(3, 5), 16),
        parseInt(grayColor.slice(5, 7), 16),
      ]
      ctx.fillStyle = `rgba(${rr},${gg},${bb},${dimAlpha})`
    }
    ctx.fill()

    const label = n.name.length > 20 ? n.name.slice(0, 20) + '...' : n.name
    const fs = Math.max(10, 12 / globalScale)
    ctx.font = `${fs}px sans-serif`
    ctx.textAlign = 'center'

    if (!anyHovered) {
      ctx.fillStyle = isDark ? 'rgba(220,220,220,0.5)' : 'rgba(50,50,50,0.5)'
    } else if (v > 0.5) {
      const labelAlpha = 0.5 + Math.min(v, 1) * 0.5
      ctx.fillStyle = isDark ? `rgba(220,220,220,${labelAlpha})` : `rgba(50,50,50,${labelAlpha})`
    } else {
      const labelAlpha = DIM_ALPHA + (0.5 - DIM_ALPHA) * v
      ctx.fillStyle = isDark ? `rgba(220,220,220,${labelAlpha})` : `rgba(50,50,50,${labelAlpha})`
    }
    ctx.fillText(label, n.x, n.y + r + fs * 0.9)
  }, [isDark])

  const linkCanvasObject = useCallback((link: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const l = link as GraphLink & { source: GraphNode; target: GraphNode }
    if (!l.source.x || !l.target.x) return
    const hovered = hoveredIdRef.current
    const sId = l.source.id, tId = l.target.id
    const sVal = highlightRef.current.get(sId) ?? 0
    const tVal = highlightRef.current.get(tId) ?? 0
    const isConnected = hovered && (sId === hovered || tId === hovered)
    const linkVal = isConnected ? Math.min(sVal, tVal) : 0

    let color: string
    let width: number
    if (!hovered) {
      color = isDark ? GRAY_LINK_DARK : GRAY_LINK_LIGHT
      width = 1
    } else if (linkVal > 0.3) {
      const alpha = 0.3 + linkVal * 0.7
      color = `rgba(46,89,149,${alpha})`
      width = 1 + linkVal * 0.8
    } else {
      const alpha = DIM_ALPHA + (0.28 - DIM_ALPHA) * linkVal
      color = isDark ? `rgba(120,120,120,${alpha})` : `rgba(160,160,160,${alpha})`
      width = 0.5
    }

    ctx.beginPath()
    ctx.moveTo(l.source.x, l.source.y)
    ctx.lineTo(l.target.x, l.target.y)
    ctx.strokeStyle = color
    ctx.lineWidth = width / globalScale
    ctx.stroke()
  }, [isDark])

  const handleNodeHover = useCallback((n: object | null) => {
    hoveredIdRef.current = n ? (n as GraphNode).id : null
    if (canvasRef.current) canvasRef.current.style.cursor = n ? 'pointer' : 'default'
    startAnimation()
  }, [startAnimation])

  const handleNodeDrag = useCallback((n: object) => {
    hoveredIdRef.current = (n as GraphNode).id
    if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing'
    startAnimation()
  }, [startAnimation])

  const handleNodeDragEnd = useCallback(() => {
    hoveredIdRef.current = null
    if (canvasRef.current) canvasRef.current.style.cursor = 'default'
    startAnimation()
  }, [startAnimation])

  if (nodes.length === 0) {
    return (
      <div className={styles.graphEmpty}>
        <p>暂无文件</p>
        <p className={styles.graphEmptyHint}>新建笔记后图谱将自动生成</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={styles.graphCanvas}>
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={size.w}
        height={size.h}
        nodeLabel=""
        nodeRelSize={3.5}
        backgroundColor={isDark ? '#1e1e2e' : '#ffffff'}
        onNodeClick={(n: object) => onSelectFile((n as GraphNode).id)}
        onNodeHover={handleNodeHover}
        onNodeDrag={handleNodeDrag}
        onNodeDragEnd={handleNodeDragEnd}
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode={() => 'replace'}
        linkCanvasObject={linkCanvasObject}
        linkCanvasObjectMode={() => 'replace'}
        cooldownTicks={Infinity}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
      />
    </div>
  )
})

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
    setValue(file.name)
    prevNameRef.current = file.name
    setError(false)
  }, [file.id, file.name])

  useEffect(() => {
    if (file.name === '未命名笔记' || file.name === '新建文件夹') {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [file.id])

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

// 编辑区
const EditorArea: React.FC<Props> = ({ file, files, showGraph, onContentChange, onRenameFile, onSelectFile, canGoBack, canGoForward, onNavBack, onNavForward, onCreateFile }) => {
  const editorRef = useRef<HTMLDivElement>(null)
  const vditorRef = useRef<Vditor | null>(null)
  const fileIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!editorRef.current || !file) {
      vditorRef.current?.destroy(); vditorRef.current = null
      return
    }
    vditorRef.current?.destroy(); vditorRef.current = null
    fileIdRef.current = file.id
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    const vd = new Vditor(editorRef.current, {
      mode: 'ir', value: file.content ?? '', height: '100%', toolbar: [],
      outline: { enable: false, position: 'right' }, counter: { enable: false },
      cache: { enable: false }, placeholder: '开始输入...',
      theme: isDark ? 'dark' : 'classic',
      preview: {
        theme: { current: isDark ? 'dark' : 'light' },
        hljs: { style: isDark ? 'native' : 'github', lineNumber: true },
        markdown: { codeBlockPreview: false, mathBlockPreview: false },
      },
      input: (value) => { if (fileIdRef.current) onContentChange(fileIdRef.current, value) },
    })
    vditorRef.current = vd
    return () => { vd.destroy(); vditorRef.current = null }
  }, [file?.id])

  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (!vditorRef.current) return
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
      vditorRef.current.setTheme(isDark ? 'dark' : 'classic', isDark ? 'dark' : 'light', isDark ? 'native' : 'github')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  return (
    <>
      {showGraph && (
        <div className={styles.editor}>
          <div className={styles.breadcrumb}>
            <div className={styles.navButtons}>
              <button className={`${styles.navBtn} ${!canGoBack ? styles.disabled : ''}`} onClick={onNavBack} disabled={!canGoBack}><LeftOutlined /></button>
              <button className={`${styles.navBtn} ${!canGoForward ? styles.disabled : ''}`} onClick={onNavForward} disabled={!canGoForward}><RightOutlined /></button>
            </div>
            <div className={styles.breadcrumbPath}>
              <ShareAltOutlined className={styles.breadcrumbIcon} />
              <span>关系图谱</span>
            </div>
          </div>
          <div className={styles.editorContent}>
            <GraphView files={files} onSelectFile={onSelectFile} />
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
            <div className={styles.breadcrumb}>
              <div className={styles.navButtons}>
                <button className={`${styles.navBtn} ${!canGoBack ? styles.disabled : ''}`} onClick={onNavBack} disabled={!canGoBack}><LeftOutlined /></button>
                <button className={`${styles.navBtn} ${!canGoForward ? styles.disabled : ''}`} onClick={onNavForward} disabled={!canGoForward}><RightOutlined /></button>
              </div>
              <div className={styles.breadcrumbPath}>
                <FileTextOutlined className={styles.breadcrumbIcon} />
                <span>{file.name}</span>
              </div>
            </div>
            <InlineTitle file={file} onRename={onRenameFile} onConfirm={() => vditorRef.current?.focus()} />
            <div className={styles.editorContent}>
              <div ref={editorRef} className={styles.vditorContainer} />
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default EditorArea
