import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { ForceGraphMethods } from 'react-force-graph-2d'
import { CompressOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons'
import { forceCollide, forceX, forceY } from 'd3-force-3d'
import type { GraphLink, GraphNode, VFile, WikiLinkBinding } from '@/types/path'
import {
  buildGraphIndex, endpointId, graphLinkKey, graphNodeRadius, graphPaintColor,
  graphTopologyKey, HOVER_DURATION, interpolateVisual, labelGeometry,
  linkVisualTarget, nodeVisualTarget, readGraphPalette,
} from './model'
import type { GraphPosition, GraphVisual } from './model'
import styles from './index.module.less'

interface Props {
  files: VFile[]
  linkBindings: WikiLinkBinding[]
  positionCache: Map<string, GraphPosition>
  onSelectFile: (id: string) => void
}

const MAX_ZOOM = 4
const ZERO_VISUAL: GraphVisual = { highlight: 0, mask: 0 }
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function useGraphData(files: VFile[], bindings: WikiLinkBinding[], positions: Map<string, GraphPosition>) {
  const topologyKey = useMemo(() => graphTopologyKey(files, bindings), [files, bindings])
  const names = useMemo(() => new Map(files.map(file => [file.id, file.name])), [files])
  const graph = useMemo(() => {
    const [nodePart, linkPart] = topologyKey.split('\u0002')
    const nodeIds = nodePart ? nodePart.split('\u0001') : []
    const links: GraphLink[] = (linkPart ? linkPart.split('\u0001') : []).map(key => {
      const [source, target, type] = key.split('\u0000')
      return { source, target, type: type as GraphLink['type'] }
    })
    return {
      data: { nodes: nodeIds.map(id => ({ id, name: id, ...positions.get(id) })) as GraphNode[], links },
      ...buildGraphIndex(nodeIds, links),
    }
  }, [positions, topologyKey])
  return { ...graph, names }
}

/** User graph uses the complete workspace's resolved bindings, before presentation filters. */
const KnowledgeGraph = memo(({ files, linkBindings, positionCache, onSelectFile }: Props) => {
  const { data, names, incomingCounts, neighbors } = useGraphData(files, linkBindings, positionCache)
  const hasNodes = data.nodes.length > 0
  const containerRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const hasViewport = size.w > 0 && size.h > 0
  const sizeRef = useRef({ w: 0, h: 0 })
  const [motionReduced] = useState(reducedMotion)
  const [entranceReady, setEntranceReady] = useState(false)
  const entranceFrame = useRef<number | null>(null)
  const [palette, setPalette] = useState(() => readGraphPalette(document.documentElement))
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const hoveredRef = useRef<string | null>(null)
  const nodeVisuals = useRef(new Map<string, GraphVisual>())
  const edgeVisuals = useRef(new Map<string, GraphVisual>())
  const hoverFrame = useRef<number | null>(null)
  const [paintActive, setPaintActive] = useState(true)
  const [zoomLabel, setZoomLabel] = useState(100)
  const [minZoom, setMinZoom] = useState(0.2)
  const zoomRange = useRef({ min: 0.2, max: MAX_ZOOM })
  const zoomTarget = useRef(1)
  const zoomFrame = useRef<number | null>(null)
  const labelFrame = useRef<number | null>(null)
  const initialFitDone = useRef(false)
  const rendererPaused = useRef(false)
  const resizeCenter = useRef<GraphPosition | null>(null)
  const dragging = useRef(false)
  const dragMoved = useRef(false)
  const dragEndTimer = useRef<number | null>(null)

  const cancelZoom = useCallback(() => {
    if (zoomFrame.current !== null) cancelAnimationFrame(zoomFrame.current)
    zoomFrame.current = null
    if (fgRef.current) zoomTarget.current = fgRef.current.zoom()
  }, [])

  const startHover = useCallback((id: string | null, refresh = false) => {
    if (!refresh && hoveredRef.current === id) return
    hoveredRef.current = id
    setHoveredId(id)
    setPaintActive(true)
    if (hoverFrame.current !== null) cancelAnimationFrame(hoverFrame.current)
    const nodeFrom = new Map(nodeVisuals.current), edgeFrom = new Map(edgeVisuals.current)
    const adjacent = id ? neighbors.get(id) : undefined
    const started = performance.now()
    const animate = (now: number) => {
      const progress = reducedMotion() ? 1 : Math.max(0, Math.min(1, (now - started) / HOVER_DURATION))
      for (const node of data.nodes) {
        nodeVisuals.current.set(node.id, interpolateVisual(
          nodeFrom.get(node.id) ?? ZERO_VISUAL, nodeVisualTarget(node.id, id, adjacent), progress,
        ))
      }
      for (const edge of data.links) {
        const key = graphLinkKey(edge)
        edgeVisuals.current.set(key, interpolateVisual(
          edgeFrom.get(key) ?? ZERO_VISUAL, linkVisualTarget(edge, id), progress,
        ))
      }
      hoverFrame.current = progress < 1 ? requestAnimationFrame(animate) : null
    }
    hoverFrame.current = requestAnimationFrame(animate)
  }, [data, neighbors])

  useEffect(() => {
    const ids = new Set(data.nodes.map(node => node.id))
    const edges = new Set(data.links.map(graphLinkKey))
    for (const id of nodeVisuals.current.keys()) if (!ids.has(id)) nodeVisuals.current.delete(id)
    for (const id of edgeVisuals.current.keys()) if (!edges.has(id)) edgeVisuals.current.delete(id)
    if (hoveredRef.current === null && hoverFrame.current === null) return
    if (hoverFrame.current !== null) cancelAnimationFrame(hoverFrame.current)
    const frame = requestAnimationFrame(() => {
      const id = hoveredRef.current
      startHover(id && ids.has(id) ? id : null, true)
    })
    return () => cancelAnimationFrame(frame)
  }, [data, startHover])

  useEffect(() => {
    // Theme/title updates also need one paint when the physical simulation is idle.
    const frame = requestAnimationFrame(() => setPaintActive(true))
    return () => cancelAnimationFrame(frame)
  }, [palette, names])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const syncPalette = () => setPalette(readGraphPalette(container))
    syncPalette()
    const observer = new MutationObserver(syncPalette)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [hasNodes])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const update = (width: number, height: number) => {
      const next = { w: Math.round(width), h: Math.round(height) }
      if (next.w <= 0 || next.h <= 0) {
        if (!rendererPaused.current) fgRef.current?.pauseAnimation()
        rendererPaused.current = true
        startHover(null)
        return
      }
      if (rendererPaused.current) fgRef.current?.resumeAnimation()
      rendererPaused.current = false
      const previous = sizeRef.current
      if (previous.w === next.w && previous.h === next.h) return
      cancelZoom()
      if (previous.w && previous.h && fgRef.current) resizeCenter.current = fgRef.current.centerAt()
      sizeRef.current = next
      setSize(next)
    }
    const observer = new ResizeObserver(([entry]) => update(entry.contentRect.width, entry.contentRect.height))
    observer.observe(container)
    update(container.clientWidth, container.clientHeight)
    return () => observer.disconnect()
  }, [hasNodes, cancelZoom, startHover])

  useLayoutEffect(() => {
    const center = resizeCenter.current
    if (!center) return
    resizeCenter.current = null
    fgRef.current?.centerAt(center.x, center.y, 0)
  }, [size])

  const rememberPositions = useCallback(() => {
    for (const node of data.nodes) {
      if (node.x !== undefined && node.y !== undefined) positionCache.set(node.id, { x: node.x, y: node.y })
    }
  }, [data, positionCache])

  const fitGraph = useCallback((duration = 240) => {
    const fg = fgRef.current
    const positioned = data.nodes.filter(node => node.x !== undefined && node.y !== undefined)
    if (!fg || !positioned.length) return
    cancelZoom()
    const left = Math.min(...positioned.map(n => n.x! - graphNodeRadius(incomingCounts.get(n.id) ?? 0)))
    const right = Math.max(...positioned.map(n => n.x! + graphNodeRadius(incomingCounts.get(n.id) ?? 0)))
    const top = Math.min(...positioned.map(n => n.y! - graphNodeRadius(incomingCounts.get(n.id) ?? 0)))
    const bottom = Math.max(...positioned.map(n => n.y! + graphNodeRadius(incomingCounts.get(n.id) ?? 0)))
    const viewport = sizeRef.current
    const initialK = Math.max(0.001, Math.min(1.25,
      Math.max(1, viewport.w - 120) / Math.max(1, right - left),
      Math.max(1, viewport.h - 120) / Math.max(1, bottom - top)))
    const nextMin = Math.min(0.2, initialK)
    zoomRange.current.min = nextMin
    setMinZoom(nextMin)
    const fromK = fg.zoom(), fromCenter = fg.centerAt()
    const toCenter = { x: (left + right) / 2, y: (top + bottom) / 2 }
    const started = performance.now(), ms = reducedMotion() ? 0 : duration
    zoomTarget.current = initialK
    // Initialization is synchronous: never expose the library's default camera
    // while waiting for an animation frame to apply the real viewport fit.
    if (ms === 0) {
      fg.zoom(initialK, 0)
      fg.centerAt(toCenter.x, toCenter.y, 0)
      setZoomLabel(Math.round(initialK * 100))
      return
    }
    const tick = (now: number) => {
      const p = ms ? Math.max(0, Math.min(1, (now - started) / ms)) : 1
      const eased = 1 - (1 - p) ** 3
      fg.zoom(fromK + (initialK - fromK) * eased, 0)
      fg.centerAt(fromCenter.x + (toCenter.x - fromCenter.x) * eased,
        fromCenter.y + (toCenter.y - fromCenter.y) * eased, 0)
      zoomFrame.current = p < 1 ? requestAnimationFrame(tick) : null
    }
    zoomFrame.current = requestAnimationFrame(tick)
  }, [cancelZoom, data, incomingCounts])

  useLayoutEffect(() => {
    const fg = fgRef.current
    if (!fg || !hasNodes || !hasViewport) return
    fg.d3Force('charge')?.strength(-100)
    fg.d3Force('link')?.distance(90).strength(0.15)
    fg.d3Force('center')?.strength(0.02)
    fg.d3Force('x', forceX<GraphNode>(0).strength(0.015))
    fg.d3Force('y', forceY<GraphNode>(0).strength(0.015))
    fg.d3Force('collision', forceCollide<GraphNode>(node => graphNodeRadius(incomingCounts.get(node.id) ?? 0) + 4).strength(0.8).iterations(2))
    fg.d3ReheatSimulation()
  }, [data, hasNodes, hasViewport, incomingCounts])

  const prepareEntrance = useCallback(() => {
    if (initialFitDone.current || entranceFrame.current !== null) return
    // The first render has completed the library's warmup and automatic zoom.
    // Fit before revealing the next frame; only nodes continue to settle.
    entranceFrame.current = requestAnimationFrame(() => {
      entranceFrame.current = null
      if (!containerRef.current?.clientWidth || !containerRef.current.clientHeight) return
      fitGraph(0)
      initialFitDone.current = true
      setPaintActive(true)
    })
  }, [fitGraph])

  const setGraphZoom = useCallback((target: number, duration: number, anchor?: { x: number; y: number }) => {
    const fg = fgRef.current
    if (!fg) return
    const toK = Math.min(zoomRange.current.max, Math.max(zoomRange.current.min, target))
    cancelZoom()
    zoomTarget.current = toK
    const fromK = fg.zoom(), viewport = sizeRef.current
    const point = anchor ?? { x: viewport.w / 2, y: viewport.h / 2 }
    const world = fg.screen2GraphCoords(point.x, point.y)
    const started = performance.now(), ms = reducedMotion() ? 0 : duration
    const tick = (now: number) => {
      const p = ms ? Math.max(0, Math.min(1, (now - started) / ms)) : 1
      const k = fromK + (toK - fromK) * (1 - (1 - p) ** 3)
      fg.zoom(k, 0)
      fg.centerAt(world.x - (point.x - viewport.w / 2) / k,
        world.y - (point.y - viewport.h / 2) / k, 0)
      zoomFrame.current = p < 1 ? requestAnimationFrame(tick) : null
    }
    zoomFrame.current = requestAnimationFrame(tick)
  }, [cancelZoom])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const wheel = (event: WheelEvent) => {
      if (event.target instanceof Element && event.target.closest('[aria-label="知识图谱缩放"]')) return
      event.preventDefault()
      if (!initialFitDone.current) return
      const rect = container.getBoundingClientRect()
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? Math.max(1, rect.height) : 1
      const delta = Math.max(-240, Math.min(240, event.deltaY * unit))
      setGraphZoom(zoomTarget.current * Math.exp(-delta * 0.0015), 110,
        { x: event.clientX - rect.left, y: event.clientY - rect.top })
    }
    container.addEventListener('wheel', wheel, { passive: false })
    return () => container.removeEventListener('wheel', wheel)
  }, [hasNodes, setGraphZoom])

  useEffect(() => {
    const change = () => {
      cancelZoom()
      startHover(null)
      if (document.hidden) fgRef.current?.pauseAnimation()
      else fgRef.current?.resumeAnimation()
    }
    document.addEventListener('visibilitychange', change)
    return () => document.removeEventListener('visibilitychange', change)
  }, [cancelZoom, startHover])

  useEffect(() => () => {
    if (entranceFrame.current !== null) cancelAnimationFrame(entranceFrame.current)
    if (hoverFrame.current !== null) cancelAnimationFrame(hoverFrame.current)
    if (zoomFrame.current !== null) cancelAnimationFrame(zoomFrame.current)
    if (labelFrame.current !== null) cancelAnimationFrame(labelFrame.current)
    if (dragEndTimer.current !== null) window.clearTimeout(dragEndTimer.current)
  }, [])

  const drawNode = useCallback((node: GraphNode, ctx: CanvasRenderingContext2D, scale: number) => {
    if (node.x === undefined || node.y === undefined) return
    const visual = nodeVisuals.current.get(node.id) ?? ZERO_VISUAL
    const baseRadius = graphNodeRadius(incomingCounts.get(node.id) ?? 0)
    const geometry = labelGeometry(baseRadius, scale, visual.highlight)
    ctx.save()
    ctx.globalAlpha = 1
    ctx.shadowBlur = 0
    ctx.beginPath()
    ctx.arc(node.x, node.y, geometry.radius, 0, Math.PI * 2)
    ctx.fillStyle = graphPaintColor(palette.node, visual, palette)
    ctx.fill()
    if (scale >= 0.6 || visual.highlight > 0 || node.id === hoveredRef.current) {
      const full = names.get(node.id) ?? node.name
      const label = full.length > 20 ? full.slice(0, 20) + '…' : full
      ctx.font = `${12 / scale}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      const ascent = ctx.measureText(label).actualBoundingBoxAscent
      ctx.fillStyle = graphPaintColor(palette.label, visual, palette, false)
      ctx.fillText(label, node.x, node.y + geometry.textTop + ascent)
    }
    ctx.restore()
  }, [incomingCounts, names, palette])

  const drawLink = useCallback((link: GraphLink, ctx: CanvasRenderingContext2D, scale: number) => {
    const source = link.source as GraphNode, target = link.target as GraphNode
    if (source.x === undefined || source.y === undefined || target.x === undefined || target.y === undefined) return
    ctx.save()
    ctx.globalAlpha = 1
    ctx.shadowBlur = 0
    ctx.beginPath()
    ctx.moveTo(source.x, source.y)
    ctx.lineTo(target.x, target.y)
    ctx.lineWidth = 1 / scale
    ctx.strokeStyle = graphPaintColor(palette.edge, edgeVisuals.current.get(graphLinkKey(link)) ?? ZERO_VISUAL, palette)
    ctx.stroke()
    ctx.restore()
  }, [palette])

  const isLocalNode = useCallback((id: string) => {
    const hovered = hoveredRef.current
    return hovered !== null && (id === hovered || neighbors.get(hovered)?.has(id))
  }, [neighbors])
  const isLocalLink = (link: GraphLink) => hoveredRef.current !== null
    && (endpointId(link.source) === hoveredRef.current || endpointId(link.target) === hoveredRef.current)

  const paintNode = (node: GraphNode, ctx: CanvasRenderingContext2D, scale: number) => {
    if (!isLocalNode(node.id)) drawNode(node, ctx, scale)
  }
  const paintLink = (link: GraphLink, ctx: CanvasRenderingContext2D, scale: number) => {
    if (!isLocalLink(link)) drawLink(link, ctx, scale)
  }
  const paintLocal = (ctx: CanvasRenderingContext2D, scale: number) => {
    for (const link of data.links) if (isLocalLink(link)) drawLink(link, ctx, scale)
    for (const node of data.nodes) if (isLocalNode(node.id)) drawNode(node, ctx, scale)
    if (!initialFitDone.current) {
      if (data.nodes.some(node => node.x !== undefined && node.y !== undefined)) prepareEntrance()
    } else if (!entranceReady) {
      // Reveal only after a complete frame has actually been painted with the
      // prepared camera, including when reduced motion stops the force engine.
      setEntranceReady(true)
    }
    // Close the finite paint window only AFTER the terminal values reached Canvas.
    // autoPauseRedraw keeps hit testing alive without redrawing indefinitely.
    if (paintActive && hoverFrame.current === null) setPaintActive(false)
  }

  const handleHover = (node: GraphNode | null) => {
    if (!dragging.current) startHover(node?.id ?? null)
  }

  if (!hasNodes) return <div className={styles.empty}><p>还没有笔记</p><p>新建笔记后图谱将自动生成</p></div>

  return (
    <div ref={containerRef} className={styles.canvas} data-testid="knowledge-graph"
      aria-busy={!entranceReady}
      data-node-count={data.nodes.length} data-link-count={data.links.length}
      onPointerLeave={() => { if (!dragging.current) startHover(null) }}
      onPointerDownCapture={event => {
        if (event.target instanceof HTMLCanvasElement) cancelZoom()
      }}>
      <div className={styles.toolbar}>{data.nodes.length} 个节点 · {data.links.length} 条关系</div>
      {!data.links.length && <div className={styles.relationHint}>还没有建立关联，可在笔记中输入 <code>[[文件名]]</code></div>}
      {hoveredId && <div className={styles.hoverCard}>{names.get(hoveredId)}</div>}
      {hasViewport && (
        <div className={styles.renderer} style={{ visibility: entranceReady ? 'visible' : 'hidden' }}>
          <ForceGraph2D<GraphNode, GraphLink>
            ref={fgRef} graphData={data} width={size.w} height={size.h}
            nodeLabel="" backgroundColor={palette.surface} minZoom={minZoom} maxZoom={MAX_ZOOM}
            enableZoomInteraction={false} nodeRelSize={4} autoPauseRedraw={!paintActive}
            onZoom={({ k }) => {
              if (labelFrame.current !== null) cancelAnimationFrame(labelFrame.current)
              labelFrame.current = requestAnimationFrame(() => { setZoomLabel(Math.round(k * 100)); labelFrame.current = null })
            }}
            onZoomEnd={({ k }) => { if (zoomFrame.current === null) zoomTarget.current = k }}
            onNodeClick={node => { if (!dragMoved.current) onSelectFile(node.id) }}
            onNodeHover={handleHover}
            onNodeDrag={node => { dragging.current = true; dragMoved.current = true; startHover(node.id) }}
            onNodeDragEnd={node => {
              dragging.current = false
              node.fx = undefined
              node.fy = undefined
              rememberPositions()
              startHover(null)
              if (dragEndTimer.current !== null) window.clearTimeout(dragEndTimer.current)
              dragEndTimer.current = window.setTimeout(() => { dragMoved.current = false; dragEndTimer.current = null }, 80)
              fgRef.current?.d3ReheatSimulation()
            }}
            onEngineStop={rememberPositions}
            nodeCanvasObject={paintNode} nodeCanvasObjectMode={() => 'replace'}
            nodePointerAreaPaint={(node, color, ctx, scale) => {
              if (node.x === undefined || node.y === undefined) return
              ctx.save()
              ctx.beginPath()
              ctx.arc(node.x, node.y, graphNodeRadius(incomingCounts.get(node.id) ?? 0) + 6 / scale, 0, Math.PI * 2)
              ctx.fillStyle = color
              ctx.fill()
              ctx.restore()
            }}
            linkCanvasObject={paintLink} linkCanvasObjectMode={() => 'replace'} onRenderFramePost={paintLocal}
            warmupTicks={motionReduced ? 240 : 80} cooldownTicks={motionReduced ? 0 : 240}
            cooldownTime={4000} d3AlphaDecay={0.02} d3VelocityDecay={0.35}
          />
        </div>
      )}
      <div className={styles.controls} aria-label="知识图谱缩放" style={{ visibility: entranceReady ? 'visible' : 'hidden' }}>
        <button type="button" aria-label="缩小知识图谱" title="缩小知识图谱"
          disabled={!entranceReady || zoomLabel <= Math.round(minZoom * 100)} onClick={() => setGraphZoom(zoomTarget.current / 1.2, 160)}><MinusOutlined /></button>
        <span className={styles.percentage} data-testid="graph-zoom-label">{zoomLabel}%</span>
        <button type="button" aria-label="放大知识图谱" title="放大知识图谱"
          disabled={!entranceReady || zoomLabel >= 400} onClick={() => setGraphZoom(zoomTarget.current * 1.2, 160)}><PlusOutlined /></button>
        <button type="button" aria-label="恢复知识图谱中心" title="恢复中心" disabled={!entranceReady} onClick={() => fitGraph()}><CompressOutlined /></button>
      </div>
    </div>
  )
})

export default KnowledgeGraph
