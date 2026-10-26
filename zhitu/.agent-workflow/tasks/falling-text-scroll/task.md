# FallingText 页面滚动修复

## Goal
保留 FallingText 的文字拖拽效果，同时允许鼠标位于动画区域时继续滚动 Welcome 页面。

## Scope
- repo path: src/components/FallingText/FallingText.tsx
- repo path: .agent-workflow/tasks/falling-text-scroll/

Out of scope: Welcome 页面布局、Matter.js 依赖版本、其他滚动容器和业务 API。

## Deliverables
移除 Matter.js 自动绑定的滚轮拦截，清理鼠标事件和动画帧，并完成构建验证。

## Risks
鼠标拖拽和触摸交互不能被误删；组件卸载后不能继续运行动画循环。
