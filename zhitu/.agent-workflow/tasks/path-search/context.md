# Context

## Why now

用户以 Obsidian 搜索截图为参照，要求增加文件路径和文件名匹配及搜索历史。

## Facts

- 现有 SearchPanel 只按整段关键词逐行搜索正文；没有历史。
- 复用 getWikiFilePath 解析工作区树路径，不读电脑绝对路径。
- 保留即时正文搜索；路径、文件名条件可组合，带空格的值用引号。
- 历史在回车确认、点击结果或离开搜索区后记录，保存于当前浏览器且按账号隔离，不保存逐次键入片段。
- 本地 agent-workflow CLI 无可执行入口（npx --no-install 失败）；任务和验证记录以 Markdown 维护。

## Open questions

tag、line、section、property 不在本次明确请求范围内，不显示不可用选项。
