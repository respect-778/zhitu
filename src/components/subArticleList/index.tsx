import { useState, useRef, useEffect } from 'react'
import { SearchOutlined, FolderOutlined, PlusOutlined, BookOutlined, SortAscendingOutlined, ClockCircleOutlined, DeleteOutlined, ReadOutlined } from '@ant-design/icons'
import { message, Popconfirm, Modal, Select, DatePicker } from 'antd'
import { createFolderAPI, deleteFolderAPI, getFoldersAPI } from '@/api/community'
import { formatDateTime } from '@/utils/formatDateTime'
import styles from './index.module.less'
import type { IArticleItem, IFolder } from '@/types/community'
import locale from 'antd/locale/zh_CN';
import 'dayjs/locale/zh-cn';

interface SubArticleListProps {
  headerTitle: string
  headerDesc?: string
  title: string
  count: number
  folderType: 'collection' | 'history'
  searchPlaceholder?: string
  emptyIcon?: React.ReactNode
  emptyTitle?: string
  emptyDesc?: string
  emptyBtnText?: string
  onEmptyBtnClick?: () => void
  onSearch?: (keyword: string) => void
  onFolderChange?: (folderId: number | null) => void
  onSortChange?: (sort: 'newest' | 'oldest') => void
  onReset?: (date: string | null) => void
  onDateChange?: (date: string | null) => void
  list: IArticleItem[]
  onContinueRead?: (postId: number) => void
  onMoveToFolder?: (id: number, folderId: number | null) => void
  onDelete?: (id: number) => void
  deleteTooltip?: string
}

const FOLDER_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#14b8a6']

const SubArticleList: React.FC<SubArticleListProps> = ({
  headerTitle,
  headerDesc,
  title,
  count,
  folderType,
  searchPlaceholder = '搜索文章...',
  emptyIcon,
  emptyTitle = '还没有任何内容',
  emptyDesc = '去发现更多优质内容吧',
  emptyBtnText = '去发现好内容',
  onEmptyBtnClick,
  onSearch,
  onFolderChange,
  onSortChange,
  onReset,
  onDateChange,
  list,
  onContinueRead,
  onMoveToFolder,
  onDelete,
  deleteTooltip = '删除',
}) => {
  const [searchValue, setSearchValue] = useState('')
  const [sortType, setSortType] = useState<'newest' | 'oldest'>('newest')
  const [folders, setFolders] = useState<IFolder[]>([])
  const [activeFolderId, setActiveFolderId] = useState<number | null>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)

  // 归类弹窗状态
  const [classifyVisible, setClassifyVisible] = useState(false)
  const [classifyItemId, setClassifyItemId] = useState<number | null>(null)
  const [classifyFolderId, setClassifyFolderId] = useState<number | null>(null)

  // 创建文件夹弹窗状态
  const [showFolderModal, setShowFolderModal] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [folderColor, setFolderColor] = useState(FOLDER_COLORS[0])
  const modalRef = useRef<HTMLDivElement>(null)

  // 获取文件夹列表
  const fetchFolders = async () => {
    try {
      const res: any = await getFoldersAPI(folderType)
      if (res?.data) {
        setFolders(res.data || [])
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    fetchFolders()
  }, [folderType])

  // 点击外部关闭弹窗
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setShowFolderModal(false)
      }
    }
    if (showFolderModal) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showFolderModal])

  // 处理搜索
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value)
    onSearch?.(e.target.value)
  }

  // 按时间排序
  const toggleSort = () => {
    const next = sortType === 'newest' ? 'oldest' : 'newest'
    setSortType(next)
    onSortChange?.(next)
  }

  // 创建文件夹
  const handleCreateFolder = async () => {
    if (!folderName.trim()) return
    try {
      const res: any = await createFolderAPI({ name: folderName.trim(), color: folderColor, type: folderType })
      if (res?.message) {
        message.success('文件夹创建成功')
        setFolderName('')
        setFolderColor(FOLDER_COLORS[0])
        setShowFolderModal(false)
        fetchFolders()
      }
    } catch {
      message.error('创建失败')
    }
  }

  // 删除文件夹
  const handleDeleteFolder = async (e: React.MouseEvent, folderId: number) => {
    e.stopPropagation()
    try {
      const res: any = await deleteFolderAPI(folderId)
      if (res?.message) {
        message.success('文件夹已删除')
        if (activeFolderId === folderId) {
          setActiveFolderId(null)
          onFolderChange?.(null)
        }
        fetchFolders()
      }
    } catch {
      message.error('删除失败')
    }
  }

  // 选择指定的文件夹
  const handleSelectFolder = (folderId: number | null) => {
    setActiveFolderId(folderId)
    onFolderChange?.(folderId)
  }

  // 打开分类弹窗
  const openClassifyModal = (itemId: number) => {
    setClassifyItemId(itemId)
    setClassifyFolderId(null)
    setClassifyVisible(true)
  }

  // 保存到文件中去
  const handleClassifySave = () => {
    if (classifyItemId !== null) {
      onMoveToFolder?.(classifyItemId, classifyFolderId)
    }
    setClassifyVisible(false)
    setClassifyItemId(null)
  }

  return (
    <div className={styles.wrapper}>
      {/* ===== 头部 ===== */}
      <div className={styles.header}>
        <span className={styles.headerTitle}>{headerTitle}</span>
        <div style={{ fontSize: '13px', color: '#8e9aa7' }}>/</div>
        <div style={{ fontSize: '13px', color: '#8e9aa7' }}>{headerDesc}</div>
      </div>

      <div className={styles.container}>
        {/* ===== 左侧边栏 ===== */}
        <div className={styles.sidebar}>
          <div
            className={styles.countLabel}
            onClick={() => handleSelectFolder(null)}
            style={{ cursor: 'pointer' }}
          >
            {title} ({count})
          </div>

          {/* 文件夹 */}
          <div className={styles.sectionHeader} style={{ position: 'relative' }}>
            <div className={styles.sectionTitle}>
              <FolderOutlined className={styles.sectionIcon} />
              <span>文件夹</span>
            </div>
            <PlusOutlined
              className={styles.addBtn}
              onClick={() => setShowFolderModal(!showFolderModal)}
            />

            {/* 创建文件夹弹窗 */}
            {showFolderModal && (
              <div className={styles.folderModal} ref={modalRef}>
                <input
                  className={styles.folderModalInput}
                  placeholder="文件夹名称"
                  value={folderName}
                  onChange={e => setFolderName(e.target.value)}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                />
                <div className={styles.colorPicker}>
                  {FOLDER_COLORS.map(c => (
                    <div
                      key={c}
                      className={`${styles.colorDot} ${folderColor === c ? styles.colorActive : ''}`}
                      style={{ background: c }}
                      onClick={() => setFolderColor(c)}
                    />
                  ))}
                </div>
                <button
                  className={`${styles.folderModalBtn} ${folderName.trim() ? styles.folderModalBtnActive : ''}`}
                  onClick={handleCreateFolder}
                  disabled={!folderName.trim()}
                >
                  创建
                </button>
              </div>
            )}
          </div>

          {/* 文件夹列表 */}
          {folders.length > 0 ? (
            <div className={styles.folderList}>
              {folders.map(f => (
                <div
                  key={f.id}
                  className={`${styles.folderItem} ${activeFolderId === f.id ? styles.folderActive : ''}`}
                  onClick={() => handleSelectFolder(f.id)}
                >
                  <div className={styles.folderLeft}>
                    <div className={styles.folderDot} style={{ background: f.color }} />
                    <span className={styles.folderName}>{f.name}</span>
                  </div>
                  <Popconfirm
                    title="确定删除该文件夹吗？"
                    onConfirm={(e) => { e?.stopPropagation(); handleDeleteFolder(e as any, f.id); }}
                    onCancel={(e) => e?.stopPropagation()}
                    okText="删除"
                    cancelText="取消"
                  >
                    <DeleteOutlined
                      className={styles.folderDel}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </Popconfirm>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.hintText}>添加文件夹来组织你的内容</div>
          )}
        </div>

        {/* ===== 右侧内容区 ===== */}
        <div className={styles.content}>
          {/* 顶部工具栏 */}
          <div className={styles.toolbar}>
            <div className={styles.searchBox}>
              <SearchOutlined className={styles.searchIcon} />
              <input
                className={styles.searchInput}
                type="text"
                value={searchValue}
                onChange={handleSearch}
                placeholder={searchPlaceholder}
              />
            </div>
            <div className={styles.sortArea}>
              <div className={styles.sortBtn} onClick={toggleSort}>
                <SortAscendingOutlined className={styles.sortIcon} />
                <span>{sortType === 'newest' ? '最新' : '最早'}</span>
              </div>
              <div style={{ position: 'relative', display: 'inline-flex' }}>
                <ClockCircleOutlined
                  className={styles.clockIcon}
                  onClick={() => setShowDatePicker(!showDatePicker)}
                />
                {showDatePicker && (
                  <div className={styles.datePickerWrap}>
                    <DatePicker
                      open
                      locale={locale.DatePicker}
                      onChange={(date) => {
                        onDateChange?.(date ? date.format('YYYY-MM-DD') : null)
                        setShowDatePicker(false)
                      }}
                      allowClear
                      placeholder="选择日期"
                      getPopupContainer={(trigger) => trigger.parentElement!}
                    />
                  </div>
                )}
              </div>
              <div className={styles.resetBtn} onClick={() => onReset?.(null)}>重置</div>
            </div>
          </div>

          {/* 内容区域 */}
          <div className={styles.listArea}>
            {list.length > 0 ? (
              <div className={styles.cardList}>
                {list.map(item => (
                  <div key={item.id} className={styles.card}>
                    <div className={styles.cardTop}>
                      {item.cover ? (
                        <img src={item.cover} alt="封面" className={styles.cardCover} loading='lazy' decoding='async' />
                      ) : (
                        <img src={item.avatar || './imgs/admin.png'} alt="头像" className={styles.cardAvatar} loading='lazy' decoding='async' />
                      )}
                      <div className={styles.cardBody}>
                        <div className={styles.cardTitle}>{item.title}</div>
                        <div className={styles.cardMeta}>
                          <span>{item.username}</span>
                          {item.read_count !== undefined && <span>阅读 {item.read_count} 次</span>}
                        </div>
                        {item.abstract && (
                          <div className={styles.cardAbstract}>{item.abstract}</div>
                        )}
                      </div>
                    </div>
                    <div className={styles.cardBottom}>
                      <div className={styles.lastReadTime}>
                        最后阅读: {formatDateTime(item.last_read_at || item.created_at || '')}
                      </div>
                      <div className={styles.cardActions}>
                        <div className={styles.actionBtn} onClick={() => onContinueRead?.(item.post_id)}>
                          <ReadOutlined /> 继续阅读
                        </div>
                        <div className={styles.actionBtn} onClick={() => openClassifyModal(item.id)}>
                          <FolderOutlined />
                        </div>
                        <Popconfirm
                          title={`确定${deleteTooltip}吗？`}
                          onConfirm={() => onDelete?.(item.id)}
                          okText="确定"
                          cancelText="取消"
                        >
                          <div className={`${styles.actionBtn} ${styles.actionBtnDanger}`} title={deleteTooltip}>
                            <DeleteOutlined />
                          </div>
                        </Popconfirm>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>
                <div className={styles.emptyIconWrap}>
                  {emptyIcon || <BookOutlined className={styles.emptyIcon} />}
                </div>
                <div className={styles.emptyTitle}>{emptyTitle}</div>
                <div className={styles.emptyDesc}>{emptyDesc}</div>
                <button className={styles.emptyBtn} onClick={onEmptyBtnClick}>
                  {emptyBtnText}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* 归类弹窗 */}
      <Modal
        title="归类"
        open={classifyVisible}
        onCancel={() => setClassifyVisible(false)}
        onOk={handleClassifySave}
        okText="保存"
        cancelText="取消"
        width={360}
        centered
      >
        <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
          选择文件夹把该文章归进对应分类。
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <FolderOutlined style={{ fontSize: 14, color: 'var(--text-secondary)' }} />
          <span style={{ fontSize: 13 }}>文件夹</span>
        </div>
        <Select
          style={{ width: '100%' }}
          placeholder="选择文件夹"
          value={classifyFolderId}
          onChange={setClassifyFolderId}
          allowClear
          options={folders.map(f => ({ label: f.name, value: f.id }))}
        />
      </Modal>
    </div>
  )
}

export default SubArticleList