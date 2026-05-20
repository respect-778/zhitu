import type React from 'react'
import { Viewer } from '@bytemd/react'
import { markdownPlugins } from '@/utils/markdown'
import './MarkdownContent.less'

interface Props {
  content: string
}

const MarkdownContent: React.FC<Props> = ({ content }) => {
  if (!content) return null
  return (
    <div className="resume-markdown">
      <Viewer value={content} plugins={markdownPlugins} />
    </div>
  )
}

export default MarkdownContent
