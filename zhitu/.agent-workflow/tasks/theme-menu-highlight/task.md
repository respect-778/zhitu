# Task

主题菜单选中项文字与图标跟随主题强调色，保留中性灰色背景；明亮模式浅灰，暗黑模式深灰，不恢复原主题蓝色背景。

## Scope

- repo path: src/components/ThemeToggle/
- repo path: .agent-workflow/tasks/theme-menu-highlight/
- 不改变全局主题、主题状态或其他组件；不提交或 push。

## Deliverables and risks

菜单局部 class 与选中/悬停配色覆盖。浮层由 Ant Design 挂载，需要把 class 直接传给 menu。
