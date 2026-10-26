# Verification

- 本次仅修改 Less；Vite resolveConfig + preprocessCSS 编译通过，暗黑属性选择器与局部 CSS Modules 类正确生成。选中、悬停与 active 使用 --accent-color / --theme-menu-selected-bg。
- git diff --check（样式文件）：通过。
- 上次完整构建与定向 ESLint 通过；本次使用项目实际 Vite 配置编译修改样式，无 TS 改动。
- 两次独立编译调用失败（无效 transform 导出、未解析的 Vite 配置），改为 resolveConfig 后检查通过。
- 未进行浏览器实际视觉验收，不将构建结果视为视觉验收。
