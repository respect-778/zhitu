# Architecture

- 前端入口：`src/main.tsx`，React + React Router，Redux Toolkit，Ant Design 6。
- 主题选择：`src/store/modules/themeStore.ts`；`src/hooks/useTheme.ts` 解析明亮、暗黑和跟随系统。
- `src/components/AppThemeProvider/index.tsx` 位于 Redux Provider 内、路由外，统一 Ant Design 算法、HTML `data-theme` 和本地持久化。
- 自定义组件使用 `src/styles/theme.less` 的 CSS 变量。
- 独立简历编辑路由使用 Workbench，复用全局主题配置。
