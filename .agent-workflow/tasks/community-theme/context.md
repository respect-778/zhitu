# Context

用户在 2026-10-03 提供加载留白、发布页黑字/白色编辑器、文章详情局部亮色的截图；先完成只读诊断后，明确授权实现，明确禁止提交及推送。

代码证据：Loading 使用 98vw/91vh；原生按钮固定黑色；ByteMD/CodeMirror 默认亮色；GitHub Markdown CSS 跟随系统偏好；详情作者统计、标签、辅助文字和 AI 按钮使用固定颜色。

复用现有 Redux 主题、AppThemeProvider 和 theme.less。agent-workflow CLI 在前次任务已确认不可用，继续使用现有 Markdown 记录回退。

追加：用户发现学习助手深度思考按钮白底亮字。Chat 和 ChatId 的 chatThinking 各自使用 #ffffff/#f2f3f4/#edf3fe 及固定浅色边框，现同步替换为已有 CSS 主题变量。保留用户另外修改的 theme.less 与 ArticleList。
