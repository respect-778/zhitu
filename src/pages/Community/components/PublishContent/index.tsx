import { useEffect, useRef, useState } from "react"
import "bytemd/dist/index.css"
import { markdownPlugins } from "@/utils/markdown"
import "highlight.js/styles/github.css"
import { Editor } from "@bytemd/react"
import type { BytemdLocale } from "bytemd"
import type { Image as MdastImage } from "mdast"
import styles from "./index.module.less"
import { useNavigate } from "react-router"
import { addCommunityAPI, uploadImageAPI } from "@/api/community"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { confirmSave, cancelSave, setSavedContentValue, setSavedTitleValue } from "@/store/modules/communityStore"
import { delStore, getStore } from "@/utils/store"
import { message, Modal } from "antd"
import type { IContent } from "@/types/community"
import { formatDateTime } from "@/utils/formatDateTime"

const zhHansLocale: Partial<BytemdLocale> = {
  write: "\u7f16\u8f91",
  preview: "\u9884\u89c8",
  writeOnly: "\u4ec5\u7f16\u8f91\u533a",
  exitWriteOnly: "\u6062\u590d\u9ed8\u8ba4",
  previewOnly: "\u4ec5\u9884\u89c8\u533a",
  exitPreviewOnly: "\u6062\u590d\u9ed8\u8ba4",
  help: "\u5e2e\u52a9",
  closeHelp: "\u5173\u95ed\u5e2e\u52a9",
  toc: "\u76ee\u5f55",
  closeToc: "\u5173\u95ed\u76ee\u5f55",
  fullscreen: "\u5168\u5c4f",
  exitFullscreen: "\u9000\u51fa\u5168\u5c4f",
  source: "\u6e90\u4ee3\u7801",
  cheatsheet: "Markdown \u8bed\u6cd5",
  shortcuts: "\u5feb\u6377\u952e",
  words: "\u5b57\u6570",
  lines: "\u884c\u6570",
  sync: "\u540c\u6b65\u6eda\u52a8",
  top: "\u56de\u5230\u9876\u90e8",
  limited: "\u5df2\u8fbe\u6700\u5927\u5b57\u7b26\u6570\u9650\u5236",
  h1: "\u4e00\u7ea7\u6807\u9898",
  h2: "\u4e8c\u7ea7\u6807\u9898",
  h3: "\u4e09\u7ea7\u6807\u9898",
  h4: "\u56db\u7ea7\u6807\u9898",
  h5: "\u4e94\u7ea7\u6807\u9898",
  h6: "\u516d\u7ea7\u6807\u9898",
  headingText: "\u6807\u9898",
  bold: "\u7c97\u4f53",
  boldText: "\u7c97\u4f53\u6587\u672c",
  italic: "\u659c\u4f53",
  italicText: "\u659c\u4f53\u6587\u672c",
  quote: "\u5f15\u7528",
  quotedText: "\u5f15\u7528\u6587\u672c",
  link: "\u94fe\u63a5",
  linkText: "\u94fe\u63a5\u63cf\u8ff0",
  image: "\u56fe\u7247",
  imageAlt: "alt",
  imageTitle: "\u56fe\u7247\u63cf\u8ff0",
  code: "\u4ee3\u7801",
  codeText: "\u4ee3\u7801",
  codeBlock: "\u4ee3\u7801\u5757",
  codeLang: "\u7f16\u7a0b\u8bed\u8a00",
  ul: "\u65e0\u5e8f\u5217\u8868",
  ulItem: "\u9879\u76ee",
  ol: "\u6709\u5e8f\u5217\u8868",
  olItem: "\u9879\u76ee",
  hr: "\u5206\u5272\u7ebf"
}

const PublishContent = () => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const userInfo = useAppSelector(state => state.user.userInfo)
  const isSaveContentValue = getStore('isSaveContent') === "true" // 是否保存了文章
  const savedTitleValue = getStore('savedTitleValue') // 保存的文章标题
  const savedContentValue = getStore('savedContentValue') // 保存的文章内容
  const imgs = useRef<string[]>([])
  const [titleValue, setTitleValue] = useState("") // 输入的文章标题
  const [contentValue, setContentValue] = useState("") // 输入的文章内容
  const [isModalOpen, setIsModalOpen] = useState(false) // 返回弹框


  // 弹框确定按钮
  const handleOk = () => {
    navigate("/community")
  }

  // 弹框取消按钮
  const handleCancel = () => {
    setIsModalOpen(false)
  }

  // 点击返回按钮
  const goBack = () => {
    setIsModalOpen(true) // 打开弹框提醒未保存
  }

  // 在笔记中输入标题时触发
  const changeTitleValue = (v: string) => {
    setTitleValue(v)
  }

  // 在笔记中输入内容时触发
  const changeConentValue = (v: string) => {
    setContentValue(v)
  }

  // 保存草稿
  const handleSaveDraft = (titleValue: string, contentValue: string) => {
    if (titleValue === '' || contentValue === '') {
      message.warning("请输入文章内容")
      return
    }

    dispatch(confirmSave()) // 设置为保存
    dispatch(setSavedTitleValue(titleValue)) // 保存当前文章标题
    dispatch(setSavedContentValue(contentValue)) // 保存当前文章内容
    message.success("保存成功")
  }

  // 发布文章
  const handlePublishBlog = async () => {
    if (titleValue === '' || contentValue === '') {
      message.warning("请输入文章内容")
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
      isCollected: false
    }
    await addCommunityAPI(data)

    message.success("文章发布成功")
    dispatch(cancelSave()) // 取消保存，因为已经提交。
    delStore("savedTitleValue") // 清除旧文章标题
    delStore("savedContentValue") // 清除旧文章内容
    navigate('/community') // 回到文章列表页
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
          throw new Error("图片上传失败，服务端未返回可用的图片地址")
        }

        return {
          url,
          alt: file.name,
          title: file.name,
        }
      })
    )
  }

  // 组件挂载时，检查是否有保存草稿
  useEffect(() => {
    if (!isSaveContentValue) return
    setTitleValue(savedTitleValue!)
    setContentValue(savedContentValue!)
  }, [isSaveContentValue])

  return (
    <div className={styles.publishContainer}>
      <div className={styles.header}>
        <div className={styles.gobackBtn} onClick={goBack}>
          返回
        </div>
        <div className={styles.publishBtns}>
          <div onClick={() => handleSaveDraft(titleValue, contentValue)} className={styles.saveDraftBtn}>保存草稿</div>
          <div onClick={handlePublishBlog} className={styles.publishBlogBtn}>发布文章</div>
        </div>
      </div>

      <form className={styles.center}>
        <textarea
          className={styles.centerTitle}
          placeholder="请输入文章标题  (5 ~ 100字)"
          value={titleValue}
          onChange={(e) => changeTitleValue(e.target.value)}
        />
        <span className={styles.centerTitleLength}>{titleValue === null ? 0 : titleValue.length}/100</span>
        <Editor
          placeholder="#创作灵感#
·记录工作实践、项目复盘
·写技术笔记巩固知识要点
·发表职场感悟心得
搬运自己的原创文章到这
"
          value={contentValue}
          plugins={markdownPlugins}
          locale={zhHansLocale}
          uploadImages={uploadImages}
          onChange={(v) => changeConentValue(v)}
        />
      </form>


      {/* 返回弹框 */}
      <Modal
        title="是否离开网站"
        closable={{ 'aria-label': 'Custom Close Button' }}
        open={isModalOpen}
        onOk={handleOk}
        onCancel={handleCancel}
        okText="确定"
        cancelText="取消"
      >
        <p>你所做的更改可能未保存。</p>
      </Modal>
    </div>
  )
}

export default PublishContent
