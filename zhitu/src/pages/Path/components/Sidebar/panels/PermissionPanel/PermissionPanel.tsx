import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { CheckOutlined, DownOutlined, LeftOutlined, LockOutlined, RightOutlined } from '@ant-design/icons'
import { Dropdown, Radio, Tooltip } from 'antd'
import type { AgentPermission, VFile } from '@/types/path'
import {
  AGENT_PERMISSION_DESCRIPTION,
  AGENT_PERMISSION_LABEL,
  collectSubtreeIds,
  getEffectiveAgentPermission,
  getStoredAgentPermission,
} from '../../../../utils/wikiPermissions'
import styles from './PermissionPanel.module.less'

export interface PermissionRequest {
  resourceId: string
  permission: AgentPermission
}

interface Props {
  files: VFile[]
  request: PermissionRequest | null
  onRequestHandled: () => void
  onSetPermissions: (ids: string[], permission: AgentPermission) => void
}

type Scope = 'subtree' | 'self'

const orderedChildren = (files: VFile[], parentId: string | null) => files
  .filter(file => file.parentId === parentId)
  .sort((a, b) => a.type === b.type ? a.order - b.order : a.type === 'folder' ? -1 : 1)

const PermissionPanel = ({ files, request, onRequestHandled, onSetPermissions }: Props) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(files.filter(file => file.type === 'folder').map(file => file.id)))
  const [preview, setPreview] = useState<PermissionRequest | null>(null)
  const [scope, setScope] = useState<Scope>('subtree')
  const scrollRef = useRef<HTMLDivElement>(null)
  const savedScrollTop = useRef(0)
  const knownFolderIds = useRef<Set<string>>(new Set(files.filter(file => file.type === 'folder').map(file => file.id)))

  useEffect(() => {
    const addedFolderIds = files
      .filter(file => file.type === 'folder' && !knownFolderIds.current.has(file.id))
      .map(file => file.id)
    if (addedFolderIds.length > 0) {
      setExpandedIds(current => new Set([...current, ...addedFolderIds]))
      addedFolderIds.forEach(id => knownFolderIds.current.add(id))
    }
  }, [files])

  useEffect(() => {
    if (!request) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      const file = files.find(candidate => candidate.id === request.resourceId)
      if (!file) {
        onRequestHandled()
        return
      }
      if (file.type === 'file') {
        if (getStoredAgentPermission(file) !== request.permission) onSetPermissions([file.id], request.permission)
        onRequestHandled()
        return
      }
      savedScrollTop.current = scrollRef.current?.scrollTop ?? 0
      setScope('subtree')
      setPreview(request)
      onRequestHandled()
    })
    return () => { cancelled = true }
  }, [files, onRequestHandled, onSetPermissions, request])

  const previewTarget = preview ? files.find(file => file.id === preview.resourceId) ?? null : null
  const affectedIds = useMemo(() => {
    if (!previewTarget) return []
    return scope === 'self' ? [previewTarget.id] : collectSubtreeIds(files, previewTarget.id)
  }, [files, previewTarget, scope])
  const changedIds = useMemo(() => preview ? affectedIds.filter(id => {
    const file = files.find(candidate => candidate.id === id)
    return file && getStoredAgentPermission(file) !== preview.permission
  }) : [], [affectedIds, files, preview])

  const closePreview = () => {
    setPreview(null)
    requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = savedScrollTop.current })
  }

  const choosePermission = (file: VFile, permission: AgentPermission) => {
    if (file.type === 'folder') {
      savedScrollTop.current = scrollRef.current?.scrollTop ?? 0
      setScope('subtree')
      setPreview({ resourceId: file.id, permission })
      return
    }
    if (getStoredAgentPermission(file) !== permission) onSetPermissions([file.id], permission)
  }

  const toggleFolder = (id: string) => setExpandedIds(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const renderRow = (file: VFile, depth: number) => {
    const expanded = expandedIds.has(file.id)
    const effective = getEffectiveAgentPermission(file, files)
    const ownPermission = getStoredAgentPermission(file)
    const menuItems = (Object.keys(AGENT_PERMISSION_LABEL) as AgentPermission[]).map(permission => ({
      key: permission,
      label: (
        <span className={styles.permissionMenuItem}>
          <span>{AGENT_PERMISSION_LABEL[permission]}</span>
          {ownPermission === permission && <CheckOutlined aria-label="当前设置" />}
        </span>
      ),
    }))
    const children = file.type === 'folder' ? orderedChildren(files, file.id) : []
    const fullName = file.name
    const sourceLabel = file.createdByKind === 'bootstrap' ? '初始化创建' : file.createdByKind === 'agent' ? 'Agent 创建' : '用户创建'

    return (
      <div key={file.id} role="treeitem" aria-expanded={file.type === 'folder' ? expanded : undefined}>
        <div className={styles.permissionRow} style={{ '--permission-depth': depth } as CSSProperties}>
          <button
            type="button"
            className={styles.fileIdentity}
            onClick={() => file.type === 'folder' && toggleFolder(file.id)}
            aria-label={file.type === 'folder' ? `${expanded ? '折叠' : '展开'} ${fullName}` : fullName}
          >
            <span className={`${styles.treeArrow} ${expanded ? styles.treeArrowExpanded : ''}`} aria-hidden="true">
              {file.type === 'folder' ? <RightOutlined /> : null}
            </span>
            <Tooltip title={`${fullName} · ${sourceLabel}`} placement="topLeft" mouseLeaveDelay={0.05}>
              <span className={styles.fileName} tabIndex={0}>{fullName}</span>
            </Tooltip>
          </button>
          <Dropdown
            trigger={['click']}
            menu={{ items: menuItems, onClick: ({ key }) => choosePermission(file, key as AgentPermission) }}
          >
            <button
              type="button"
              className={styles.permissionButton}
              aria-label={`${fullName} Agent 权限：${AGENT_PERMISSION_LABEL[effective.permission]}`}
              title={effective.blockedBy ? `自身设置：${AGENT_PERMISSION_LABEL[ownPermission]}；受父级「${effective.blockedBy.name}」限制` : AGENT_PERMISSION_DESCRIPTION[effective.permission]}
            >
              {effective.blockedBy && <LockOutlined aria-hidden="true" />}
              <span>{AGENT_PERMISSION_LABEL[effective.permission]}</span>
              <DownOutlined aria-hidden="true" />
            </button>
          </Dropdown>
        </div>
        {file.type === 'folder' && (
          <div
            className={`${styles.folderChildren} ${expanded ? styles.folderExpanded : ''}`}
            aria-hidden={!expanded}
          >
            <div className={styles.folderChildrenInner} role="group" inert={expanded ? undefined : true}>
              {children.map(child => renderRow(child, depth + 1))}
            </div>
          </div>
        )}
      </div>
    )
  }

  if (preview && previewTarget) {
    const descendantCount = Math.max(0, affectedIds.length - 1)
    const hiddenImpact = preview.permission === 'none' && scope === 'self' && descendantCount > 0
    return (
      <section className={styles.panel} data-testid="permission-impact-preview">
        <header className={styles.panelHeader}>
          <button type="button" className={styles.backButton} onClick={closePreview}><LeftOutlined /> 返回权限树</button>
        </header>
        <div className={styles.previewBody}>
          <div>
            <div className={styles.eyebrow}>权限调整</div>
            <h2 title={previewTarget.name}>{previewTarget.name}/</h2>
          </div>
          <p className={styles.targetPermission}>改为：<strong>{AGENT_PERMISSION_LABEL[preview.permission]}</strong></p>
          <Radio.Group value={scope} onChange={event => setScope(event.target.value)} className={styles.scopeOptions}>
            <Radio value="subtree">此文件夹及现有全部子项</Radio>
            <Radio value="self">仅此文件夹</Radio>
          </Radio.Group>
          <div className={styles.impactCard}>
            <p>影响：1 个目录、{descendantCount} 个子项</p>
            <p>将更新 {changedIds.length} 项设置。</p>
            {hiddenImpact && <p className={styles.impactWarning}>子树将全部对 Agent 隐藏，子项自身设置保持不变。</p>}
            <p>以后由你新建的内容仍默认只读。</p>
          </div>
        </div>
        <footer className={styles.previewActions}>
          <button type="button" className={styles.secondaryButton} onClick={closePreview}>取消</button>
          <button type="button" className={styles.primaryButton} onClick={() => {
            if (changedIds.length) onSetPermissions(changedIds, preview.permission)
            closePreview()
          }}>确认更改 {changedIds.length} 项</button>
        </footer>
      </section>
    )
  }

  return (
    <section className={styles.panel} data-testid="permission-tree-panel">
      <header className={styles.panelHeader}><h2>Agent 权限</h2></header>
      <div ref={scrollRef} className={styles.tree} role="tree">
        {orderedChildren(files, null).map(file => renderRow(file, 0))}
      </div>
      <footer className={styles.permissionLegend}>
        <p><strong>不可访问：</strong>不向 Agent 提供内容</p>
        <p><strong>只读：</strong>可读取引用，不可修改</p>
        <p><strong>完全管理：</strong>按你的指令管理，可恢复</p>
        <p>仅限制 Agent，不影响你自己编辑。</p>
      </footer>
    </section>
  )
}

export default PermissionPanel
