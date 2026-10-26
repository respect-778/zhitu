# Loading below navigation

## Goal
公共 Layout 内的路由加载保留顶部导航可见、可操作；加载图标在导航下方的可用视口水平垂直居中。

## Scope
- repo path: src/components/Loading/index.tsx
- repo path: src/components/Loading/index.module.less
- repo path: src/router/index.tsx
- repo path: .agent-workflow/tasks/loading-below-header/

Out of scope: 导航高度/统一变量、独立路由布局、API、其他已有工作区修改、Git 提交和推送。

## Deliverables
可选 withHeader 样式变体；公共 Layout 路由启用此变体；验证记录。

## Risks
独立路由没有公共导航，不能统一偏移 65px。加载结束须正常恢复滚动。
