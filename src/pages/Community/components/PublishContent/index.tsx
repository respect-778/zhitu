import { useCallback, useEffect, useRef, useState } from "react"
import "bytemd/dist/index.css"
import { markdownPlugins } from "@/utils/markdown"
import "highlight.js/styles/github.css"
import { Editor } from "@bytemd/react"
import type { BytemdLocale } from "bytemd"
import type { Image as MdastImage } from "mdast"
import styles from "./index.module.less"
import { useBeforeUnload, useBlocker, useNavigate } from "react-router"
import { addCommunityAPI, uploadImageAPI } from "@/api/community"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { confirmSave, cancelSave, setSavedContentValue, setSavedTitleValue, delSavedTitleValue, delSavedContentValue } from "@/store/modules/communityStore"
import { getStore } from "@/utils/store"
import { message, Modal } from "antd"
import type { IContent } from "@/types/community"
import { formatDateTime } from "@/utils/formatDateTime"

const zhHansLocale: Partial<BytemdLocale> = {
  write: "编辑",
  preview: "预览",
  writeOnly: "仅编辑区",
  exitWriteOnly: "恢复默认",
  previewOnly: "仅预览区",
  exitPreviewOnly: "恢复默认",
  help: "帮助",
  closeHelp: "关闭帮助",
  toc: "目录",
  closeToc: "关闭目录",
  fullscreen: "全屏",
  exitFullscreen: "退出全屏",
  source: "源代码",
  cheatsheet: "Markdown 语法",
  shortcuts: "快捷键",
  words: "字数",
  lines: "行数",
  sync: "同步滚动",
  top: "回到顶部",
  limited: "已达最大字符数限制",
  h1: "一级标题",
  h2: "二级标题",
  h3: "三级标题",
  h4: "四级标题",
  h5: "五级标题",
  h6: "六级标题",
  headingText: "标题",
  bold: "粗体",
  boldText: "粗体文本",
  italic: "斜体",
  italicText: "斜体文本",
  quote: "引用",
  quotedText: "引用文本",
  link: "链接",
  linkText: "链接描述",
  image: "图片",
  imageAlt: "alt",
  imageTitle: "图片描述",
  code: "代码",
  codeText: "代码",
  codeBlock: "代码块",
  codeLang: "编程语言",
  ul: "无序列表",
  ulItem: "项目",
  ol: "有序列表",
  olItem: "项目",
  hr: "分割线",
}

// 标题布局状态类型 -> 根据当前的布局模式动态处理标题栏
type TitleLayoutState = {
  sidebarOpen: boolean // 侧边栏是否显示 （包括：目录模式、帮助模式）
  writeOnly: boolean // 编辑区显示、预览区隐藏 （仅编辑模式）
  previewOnly: boolean // 编辑区隐藏，预览区显示 （仅预览模式）
  fullscreen: boolean // 是否全屏展示 （全屏模式）
}

// ByteMD 还未挂载时，标题的默认布局状态。
const initialTitleLayoutState: TitleLayoutState = {
  sidebarOpen: false,
  writeOnly: false,
  previewOnly: false,
  fullscreen: false,
}

// 模式标记未变化时，跳过 setState，避免无意义重渲染。
const isSameTitleLayout = (a: TitleLayoutState, b: TitleLayoutState): boolean => {
  return (
    a.sidebarOpen === b.sidebarOpen &&
    a.writeOnly === b.writeOnly &&
    a.previewOnly === b.previewOnly &&
    a.fullscreen === b.fullscreen
  )
}

// 从 ByteMD 的 DOM 结构读取当前模式（侧边栏/仅编辑/仅预览/全屏）。
const readTitleLayout = (root: HTMLElement): TitleLayoutState => {
  const sidebar = root.querySelector(".bytemd-sidebar") as HTMLElement | null
  const editorPane = root.querySelector(".bytemd-editor") as HTMLElement | null
  const previewPane = root.querySelector(".bytemd-preview") as HTMLElement | null

  const editorDisplay = editorPane ? window.getComputedStyle(editorPane).display : "none"
  const previewDisplay = previewPane ? window.getComputedStyle(previewPane).display : "none"

  const writeOnly = editorDisplay !== "none" && previewDisplay === "none"
  const previewOnly = editorDisplay === "none" && previewDisplay !== "none"

  return {
    sidebarOpen: Boolean(sidebar && !sidebar.classList.contains("bytemd-hidden")),
    writeOnly,
    previewOnly,
    fullscreen: root.classList.contains("bytemd-fullscreen"),
  }
}

const PublishContent = () => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()

  const userInfo = useAppSelector((state) => state.user.userInfo) // 用户信息
  const isSaveContentValue = getStore("isSaveContent") === "true"
  const savedTitleValue = getStore("savedTitleValue") // 保存的文章标题
  const savedContentValue = getStore("savedContentValue") // 保存的文章内容

  const imgs = useRef<string[]>([])
  const editorHostRef = useRef<HTMLDivElement>(null) // 外层容器，用于拿到 <Editor /> 内部生成的 ".bytemd" 根节点。
  const [titleValue, setTitleValue] = useState("") // 文章标题
  const [contentValue, setContentValue] = useState("") // 文章内容
  const [isBackModalOpen, setIsBackModalOpen] = useState(false) // 是否打开"返回"弹框
  const [isContinueEdit, setIsContinueEdit] = useState(false) // 是否继续编辑
  const [titleLayout, setTitleLayout] = useState<TitleLayoutState>(initialTitleLayoutState) // 仅用于标题位置与显隐控制的布局状态。

  // 当有标题或内容时，要关闭/刷新/地址栏跳转，进行浏览器（BOM）拦截
  const isDirty = titleValue.trim().length > 0 || contentValue.trim().length > 0 // 当前标题或内容是否不为空
  const allowLeaveRef = useRef(false) // 用于放行 “发布成功后跳转” 等程序化跳转

  //  处理关闭/刷新/地址栏跳转（BOM）
  useBeforeUnload(
    useCallback((event) => {
      // 如果当前标题和内容都为空
      if (!isDirty || allowLeaveRef.current) return
      event.preventDefault()
      event.returnValue = "" // 必须设置，浏览器才会弹原生确认
    }, [isDirty])
  )

  // 处理站内跳转/浏览器后退（SPA）
  const blocker = useBlocker(
    // 这里是在对 
    ({ currentLocation, nextLocation }) =>
      !allowLeaveRef.current &&
      isDirty &&
      (
        currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search ||
        currentLocation.hash !== nextLocation.hash
      )
  )

  // 继续编辑确定按钮
  const handleEditOk = () => {
    // 继续编辑保存下来的文章
    setTitleValue(savedTitleValue ?? "")
    setContentValue(savedContentValue ?? "")
    setIsContinueEdit(false)
  }

  // 继续编辑取消按钮
  const handleEditCancel = () => {
    dispatch(cancelSave())
    // 清空保存下来的标题和内容
    dispatch(delSavedTitleValue())
    dispatch(delSavedContentValue())
    setIsContinueEdit(false)
  }

  // 返回弹框确定按钮
  const handleBackOk = () => {
    setIsBackModalOpen(false)
    if (blocker.state === "blocked") blocker.proceed() // 放行刚才那次跳转
  }

  // 返回弹框取消按钮
  const handleBackCancel = () => {
    setIsBackModalOpen(false)
    if (blocker.state === "blocked") blocker.reset() // 取消跳转，留在当前页
  }

  // 点击返回按钮
  const goBack = () => {
    setIsBackModalOpen(true)
    navigate("/")
  }

  // 在笔记中输入标题时触发
  const changeTitleValue = (v: string) => {
    // 标题长度大于 100，就禁用
    if (v.length > 100) {
      return
    }
    setTitleValue(v)
  }

  // 在笔记中输入内容时触发
  const changeConentValue = (v: string) => {
    setContentValue(v)
  }

  // 保存文章
  const handleSaveDraft = (title: string, content: string) => {
    if (!title || !content) {
      message.warning("请输入文章内容")
      return
    }

    dispatch(confirmSave())
    dispatch(setSavedTitleValue(title))
    dispatch(setSavedContentValue(content))
    message.success("保存成功")
  }

  // 发送文章
  const handlePublishBlog = async () => {
    if (!titleValue || !contentValue) {
      message.warning("请输入文章内容")
      return
    }

    if (titleValue.length < 5 || titleValue.length > 100) {
      message.error("标题长度应在5 ~ 100个字之间")
      return
    }

    const data: IContent = {
      avatar: userInfo.data.photo,
      name: userInfo.data.username,
      time: formatDateTime(JSON.stringify(new Date())),
      title: titleValue,
      content: contentValue,
      likes: 0,
      comments: 0,
      collection: 0,
      photo: imgs.current,
      isLiked: false,
      isCollected: false,
      Pageviews: 0
    }

    await addCommunityAPI(data)

    message.success("文章发布成功")
    dispatch(cancelSave())
    // 清空保存的文章标题和内容
    dispatch(delSavedTitleValue())
    dispatch(delSavedContentValue())
    allowLeaveRef.current = true // 不被拦截
    navigate("/community")
  }

  // 上传图片
  const uploadImages = (files: File[]): Promise<Pick<MdastImage, "url" | "alt" | "title">[]> => {
    return Promise.all(
      files.map(async (file) => {
        const formData = new FormData()
        formData.append("files", file)

        const res = await uploadImageAPI(formData)
        const url = res.data.urls?.[0] ?? ""
        imgs.current.push(url)

        if (!url) {
          throw new Error("图片上传失败，服务端未返回可用地址")
        }

        return {
          url,
          alt: file.name,
          title: file.name,
        }
      })
    )
  }

  // 组件挂载后，检查是否有保存草稿
  useEffect(() => {
    if (!isSaveContentValue) return
    // 打开是否继续编辑文章弹框
    setIsContinueEdit(true)
  }, [isSaveContentValue])

  // 监听 bytemd 中几种模式的变化
  useEffect(() => {
    const host = editorHostRef.current
    if (!host) return

    let bytemdRoot: HTMLElement | null = null
    let modeObserver: MutationObserver | null = null
    let bootObserver: MutationObserver | null = null

    // 根据当前 ByteMD DOM 状态重新计算标题布局模式。
    const syncLayout = () => {
      if (!bytemdRoot) return

      const next = readTitleLayout(bytemdRoot)
      setTitleLayout((prev) => (isSameTitleLayout(prev, next) ? prev : next))
    }

    // 在 ".bytemd" 出现后挂载监听器。
    const attachRootObserver = (): boolean => {
      const root = host.querySelector(".bytemd") as HTMLElement | null
      if (!root) return false

      bytemdRoot = root
      syncLayout()

      // 工具栏切换模式会改动该子树的 class/style，监听这些变化即可。
      modeObserver = new MutationObserver(syncLayout)
      modeObserver.observe(root, {
        attributes: true,
        subtree: true,
        attributeFilter: ["class", "style"],
      })

      return true
    }

    // <Editor /> 内部 DOM 不是同步出现，先等待挂载完成再绑定监听。
    if (!attachRootObserver()) {
      bootObserver = new MutationObserver(() => {
        if (!attachRootObserver()) return
        if (bootObserver) {
          bootObserver.disconnect()
          bootObserver = null
        }
      })

      bootObserver.observe(host, { childList: true, subtree: true })
    }

    window.addEventListener("resize", syncLayout)

    return () => {
      window.removeEventListener("resize", syncLayout)
      modeObserver?.disconnect()
      bootObserver?.disconnect()
    }
  }, [])

  // 分栏+侧边栏打开时，标题需要同步收窄。
  const shouldNarrowTitle = titleLayout.sidebarOpen && !titleLayout.writeOnly && !titleLayout.previewOnly
  // 仅编辑区 + 侧边栏（目录/帮助）时，标题需要和编辑区同宽。
  const shouldWideTitleInWriteOnly = titleLayout.writeOnly && titleLayout.sidebarOpen

  // 将模式状态映射到对应 class，驱动标题样式适配。
  const titleOverlayClassName = [
    styles.titleOverlay,
    shouldNarrowTitle ? styles.titleOverlayNarrow : "",
    titleLayout.writeOnly ? styles.titleOverlayWriteOnly : "",
    shouldWideTitleInWriteOnly ? styles.titleOverlayWriteOnlyWide : "",
    titleLayout.previewOnly ? styles.titleOverlayHidden : "",
    titleLayout.fullscreen ? styles.titleOverlayFullscreen : "",
  ]
    .filter(Boolean) // 过滤掉空值 => .filter((item) => Boolean(item))
    .join(" ") // 拼接

  return (
    <div className={styles.publishContainer}>
      <div className={styles.header}>
        <div className={styles.gobackBtn} onClick={goBack}>
          <img style={{ height: '60px' }} src="/imgs/logo.png" alt="log" draggable="false" />
        </div>
        <div className={styles.publishBtns}>
          <div onClick={() => handleSaveDraft(titleValue, contentValue)} className={styles.saveDraftBtn}>
            保存草稿
          </div>
          <div onClick={handlePublishBlog} className={styles.publishBlogBtn}>
            发布文章
          </div>
        </div>
      </div>

      <div className={styles.center}>
        <div className={titleOverlayClassName}>
          <textarea
            className={styles.centerTitle}
            placeholder="请输入文章标题 (5 ~ 100字)"
            value={titleValue}
            onChange={(e) => changeTitleValue(e.target.value)}
          />
          <span className={styles.centerTitleLength}>{titleValue.length}/100</span>
        </div>

        <div ref={editorHostRef}>
          <Editor
            placeholder={`# 创作灵感
- 记录工作实践、项目复盘
- 写技术笔记，巩固知识要点
- 发表职场感悟心得
搬运自己的原创文章到这里`}
            value={contentValue}
            plugins={markdownPlugins}
            locale={zhHansLocale}
            uploadImages={uploadImages}
            onChange={(v) => changeConentValue(v)}
          />
        </div>
      </div>

      {/* 返回弹框 */}
      <Modal
        title="是否离开网站"
        closable={{ "aria-label": "Custom Close Button" }}
        open={isBackModalOpen}
        onOk={handleBackOk}
        onCancel={handleBackCancel}
        centered
        okText="确定"
        cancelText="取消"
      >
        <p>你所做的更改可能未保存。</p>
      </Modal>

      {/* 询问弹框 */}
      <Modal
        title="编辑文章"
        closable={false}
        open={isContinueEdit}
        onOk={handleEditOk}
        onCancel={handleEditCancel}
        maskClosable={false}
        centered
        okText="继续"
        cancelText="取消"
      >
        <p>文章：<strong>{savedTitleValue}</strong></p>
        <p>是否继续编辑</p>
      </Modal>
    </div>
  )
}

export default PublishContent
