# Context

## Why now

用户截图显示暗色模式下 AI 提供商弹窗保持白色，简历中间编辑区域白底浅字。用户授权统一主题状态和全局 Ant Design 算法，并要求分支基于 dev。

## Facts

- 原 ThemeToggle 内部持有状态；main 中 ConfigProvider 仅配置固定主色。
- 简历样式存在 `.dark` 选择器，但应用切换的是 HTML `data-theme`。
- 原代码已在提交 `654eb1a` 保存并推送 main；dev 创建于同一提交；当前分支为 `codex/unified-dark-theme`。
- 项目要求使用 agent-workflow，但初始化 CLI 无法运行（npm 无法确定可执行文件）；使用最小 Markdown 记录作为回退，不宣称 CLI 初始化或验证成功。

## Open questions

完整登录状态下的真实 AI 配置与用户简历还需由用户验收；当前组件验证不提交密钥，不触发 AI 请求。
