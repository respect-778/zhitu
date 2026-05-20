import type React from 'react'
import { useRef, useEffect } from 'react'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
import { FileTextOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons'
import type { VFile } from '@/types/growth'
import styles from './index.module.less'

interface Props {
  file: VFile | null
  onContentChange: (id: string, content: string) => void
  canGoBack: boolean
  canGoForward: boolean
  onNavBack: () => void
  onNavForward: () => void
}

/** 编辑区域 — 集成 Vditor（IR 模式），包含面包屑导航和前进/后退按钮 */
const EditorArea: React.FC<Props> = ({ file, onContentChange, canGoBack, canGoForward, onNavBack, onNavForward }) => {
  const editorRef = useRef<HTMLDivElement>(null)       // Vditor 挂载的 DOM 容器
  const vditorRef = useRef<Vditor | null>(null)        // Vditor 实例引用
  const fileIdRef = useRef<string | null>(null)        // 当前文件 id（闭包内使用，避免 stale closure）

  // 文件切换时销毁旧 Vditor 实例并创建新的
  useEffect(() => {
    if (!editorRef.current || !file) {
      if (vditorRef.current) {
        vditorRef.current.destroy()
        vditorRef.current = null
      }
      return
    }

    if (vditorRef.current) {
      vditorRef.current.destroy()
      vditorRef.current = null
    }

    fileIdRef.current = file.id
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'

    const vd = new Vditor(editorRef.current, {
      mode: 'ir',
      value: file.content ?? '',
      height: '100%',
      toolbar: [],
      outline: { enable: false, position: 'right' },
      counter: { enable: false },
      cache: { enable: false },
      placeholder: '开始输入...',
      theme: isDark ? 'dark' : 'classic',
      preview: {
        theme: { current: isDark ? 'dark' : 'light' },
        hljs: { style: isDark ? 'native' : 'github', lineNumber: true },
        markdown: {
          codeBlockPreview: false,
          mathBlockPreview: false,
        },
      },
      input: (value) => {
        if (fileIdRef.current) {
          onContentChange(fileIdRef.current, value)
        }
      },
    })

    vditorRef.current = vd

    return () => {
      vd.destroy()
      vditorRef.current = null
    }
  }, [file?.id])

  // 监听主题切换，动态更新 Vditor 主题
  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (!vditorRef.current) return
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
      vditorRef.current.setTheme(
        isDark ? 'dark' : 'classic',
        isDark ? 'dark' : 'light',
        isDark ? 'native' : 'github',
      )
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  if (!file) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyContent}>
          <p className={styles.emptyAction}>新建笔记 (Ctrl + N)</p>
          <p className={styles.emptyAction}>打开文件 (Ctrl + O)</p>
          <p className={styles.emptyAction}>关闭标签页</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.editor}>
      <div className={styles.breadcrumb}>
        <div className={styles.navButtons}>
          <button
            className={`${styles.navBtn} ${!canGoBack ? styles.disabled : ''}`}
            onClick={onNavBack}
            disabled={!canGoBack}
          >
            <LeftOutlined />
          </button>
          <button
            className={`${styles.navBtn} ${!canGoForward ? styles.disabled : ''}`}
            onClick={onNavForward}
            disabled={!canGoForward}
          >
            <RightOutlined />
          </button>
        </div>
        <div className={styles.breadcrumbPath}>
          <FileTextOutlined className={styles.breadcrumbIcon} />
          <span>{file.name}</span>
        </div>
      </div>
      <div className={styles.editorContent}>
        <div ref={editorRef} className={styles.vditorContainer} />
      </div>
    </div>
  )
}

export default EditorArea
