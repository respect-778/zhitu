# Context

2026-10-06 用户授权按现有导航高度解决 Loading 覆盖导航问题，明确暂不提取统一高度。

已核实 Header 高度为 65px；Loading portal 到 body 并使用 fixed/inset:0。公共 Layout 内六处 fallback 改为 withHeader，其他调用默认全屏。既有并发加载滚动锁和 flex 居中保持原逻辑。

复用现有任务记录手工回退：agent-workflow CLI 在前次任务不可用；本记录不冒充 CLI 自动生成结果。
