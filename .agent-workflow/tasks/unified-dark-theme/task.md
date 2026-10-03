# Unified dark theme

## Goal

统一主题状态和 Ant Design 的亮暗配色，修正 AI 提供商弹窗和简历操作区域；右侧简历纸张保持白色。

## Scope

In scope:
- repo path: src/main.tsx
- repo path: src/store/index.ts
- repo path: src/store/modules/themeStore.ts
- repo path: src/hooks/useTheme.ts
- repo path: src/components/AppThemeProvider/
- repo path: src/components/ThemeToggle/
- repo path: src/styles/theme.less
- repo path: src/pages/Chat/components/Config/
- repo path: src/pages/Resume/components/
- repo path: src/pages/Path/components/EditorArea/index.tsx (仅修正现有构建阻塞的可选坐标保护)
- repo path: .agent-workflow/

Out of scope: 数据库、接口、登录、AI 请求和简历模板内容、导出逻辑、布局重设计。

## Deliverables

基于 dev 的主题修复分支，统一的 Redux 主题状态及 Provider，局部样式修正，验证记录。

## Risks

全局算法将改变所有处于 ConfigProvider 下的 Ant Design 组件配色。自定义硬编码样式仍需局部修正。未登录浏览器无法直接验收受保护的真实用户路由。
