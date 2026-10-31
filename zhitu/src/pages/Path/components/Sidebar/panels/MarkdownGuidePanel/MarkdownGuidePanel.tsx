import { useMemo, useState } from 'react'
import { SearchOutlined } from '@ant-design/icons'
import { Input } from 'antd'
import styles from './MarkdownGuidePanel.module.less'

interface GuideSection {
  id: string
  title: string
  aliases: string
  syntax: string
  example: string
  exit: string
}

const sections: GuideSection[] = [
  { id: 'heading', title: '标题', aliases: '标题 井号 层级', syntax: '## 二级标题', example: '显示为二级标题，用字号和字重建立内容层级。', exit: '删掉行首的 # 和空格即可恢复正文。' },
  { id: 'emphasis', title: '强调文字', aliases: '粗体 斜体 删除线 加粗', syntax: '**粗体**  *斜体*  ~~删除~~', example: '分别显示为粗体、斜体和删除线。', exit: '把文字两侧对应的 Markdown 标记删除。' },
  { id: 'list', title: '列表与任务', aliases: '圆点 减号 有序 任务 退出列表', syntax: '- 列表项\n1. 有序项\n- [ ] 待办', example: '依次显示为圆点列表、编号列表和可勾选任务。减号加空格可创建圆点列表。', exit: '在空列表项按 Enter 退出；删除当前前缀只取消这一项格式。' },
  { id: 'quote', title: '引用', aliases: '引用 大于号 退出引用', syntax: '> 这是一段引用', example: '显示为带轻量缩进和中性引号的引用段落。', exit: '光标进入后删除 >，只取消当前引用层。' },
  { id: 'inline-code', title: '行内代码', aliases: '反引号 小代码 取消', syntax: '`npm run build`', example: '命令 npm run build 会使用等宽字体和弱底色。', exit: '移到结束反引号之后继续输入，或删除两侧反引号。' },
  { id: 'code-block', title: '围栏代码块', aliases: '代码块 三个反引号 退出代码块 高亮', syntax: '```ts\nconst ready = true\n```', example: '显示为 TypeScript 代码块，并按语言进行语法着色。', exit: '把光标移到结束围栏后按 Enter 继续普通段落；也可删除首尾围栏并保留文字。' },
  { id: 'link', title: '网页链接', aliases: '链接 网页 外链', syntax: '[官网](https://example.com)', example: '链接文字显示为“官网”，地址指向对应网页。', exit: '删除链接标记即可恢复普通文字。' },
  { id: 'wiki-link', title: '笔记关联（双链）', aliases: '链接 双方括号 双链 知识关联 内部链接 Obsidian wiki', syntax: '[[Obsidian 日常归档 Skill]]\n[[Skills/Obsidian 日常归档 Skill]]\n[[Skills/Obsidian 日常归档 Skill|日常归档]]', example: '三种写法分别使用笔记名、完整目录路径、显示别名关联同一份笔记。完成输入后会显示成内部链接，单击即可打开。输入 [[ 可搜索笔记，用上下键选择，按 Enter 插入；同名文件请区分路径。', exit: '删除双方括号只取消关联，不会删除目标笔记；需要修改原始链接时可切到源码模式。找不到目标时只提示检查，不自动创建文件。' },
  { id: 'image', title: '图片', aliases: '图片 截图 太长 base64', syntax: '![图片说明](附件/示例.png)', example: '图片按原比例显示，并限制在正文宽度内；粘贴图片时正文只保留短附件路径。', exit: '删除整段图片语法即可移除图片引用，不会误删其他正文。' },
  { id: 'table', title: '表格', aliases: '表格 分隔行', syntax: '| 名称 | 状态 |\n| --- | --- |\n| 示例 | 完成 |', example: '显示为两列表格，适合少量结构化对比。', exit: '在源码模式删除分隔行与竖线，或把单元格内容移到普通段落。' },
  { id: 'divider', title: '分隔线与转义', aliases: '横线 分隔线 转义', syntax: '---\n\\*不显示为斜体\\*', example: '第一行显示章节分隔线；第二行保留星号原义。', exit: '删除横线或反斜杠标记即可。' },
]

const MarkdownGuidePanel = () => {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const filtered = useMemo(() => sections.filter(section => !normalizedQuery || `${section.title} ${section.aliases} ${section.syntax}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery)), [normalizedQuery])

  return (
    <section className={styles.panel} data-testid="markdown-guide-panel">
      <header className={styles.panelHeader}><h2>Markdown 说明</h2></header>
      <div className={styles.searchWrap}>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="搜索圆点、代码块、图片…"
          aria-label="搜索 Markdown 说明"
        />
      </div>
      <div className={styles.guideList}>
        {filtered.map(section => (
          <article className={styles.guideCard} key={section.id}>
            <div className={styles.cardTitleRow}>
              <h3>{section.title}</h3>
            </div>
            <div className={styles.label}>语法</div>
            <pre><code>{section.syntax}</code></pre>
            <div className={styles.label}>示例</div>
            <p>{section.example}</p>
            <div className={styles.label}>如何取消</div>
            <p>{section.exit}</p>
          </article>
        ))}
        {filtered.length === 0 && <div className={styles.empty}>没有找到相关格式，试试“圆点”“引用”或“代码块”。</div>}
      </div>
    </section>
  )
}

export default MarkdownGuidePanel
