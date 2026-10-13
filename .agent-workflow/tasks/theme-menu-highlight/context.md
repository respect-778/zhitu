# Context

2026-10-07 用户要求主题菜单高亮不按主题色变化，固定蓝字灰底。

ThemeToggle 使用 Dropdown 的 selectable 与 selectedKeys；只为菜单增加 class，针对选中项覆盖 color/background-color。

同日用户调整要求：文字恢复主题色，保留灰色背景但修正暗黑模式下过亮的问题。使用 --accent-color（亮 #2e5995 / 暗 #85B2E5）；明亮模式灰底 #f0f0f0，暗黑模式使用 rgba(255,255,255,0.12) 叠加在当前深色菜单底上。

沿用既有手工任务记录回退：此前 agent-workflow CLI 不可用，本记录不冒充 CLI 输出。
