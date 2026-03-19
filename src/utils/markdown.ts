import gfm from "@bytemd/plugin-gfm"
import highlight from "@bytemd/plugin-highlight"
import type { BytemdPlugin } from "bytemd"
import "bytemd/dist/index.css"
import "highlight.js/styles/github.css"

// gfm 英文转中文
const zhHansGfmLocale = {
  strike: "\u5220\u9664\u7ebf",
  strikeText: "\u6587\u672c",
  task: "\u4efb\u52a1\u5217\u8868",
  taskText: "\u5f85\u529e\u4e8b\u9879",
  table: "\u8868\u683c",
  tableHeading: "\u6807\u9898"
}

// 导出 bytemd 插件
export const markdownPlugins: BytemdPlugin[] = [
  gfm({ locale: zhHansGfmLocale }),
  highlight()
]

// 流式阶段只做 Markdown 结构渲染，不做代码高亮，避免高频重排导致闪烁。
export const markdownPluginsNoHighlight: BytemdPlugin[] = [
  gfm({ locale: zhHansGfmLocale }),
]

// 某些流式响应仅包含转义的换行符，需转换为正确的Markdown渲染格式。
export const normalizeMarkdownText = (value: string): string => {
  const normalized = value.replace(/\r\n/g, "\n")

  if (!normalized.includes("\n") && normalized.includes("\\n")) {
    return normalized.replace(/\\n/g, "\n")
  }

  return normalized
}
