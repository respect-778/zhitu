# 左侧分隔线简化与对齐

Date: 2026-10-09
Status: passed
Branch: `codex/workspace-citation-integrity`
Baseline: `fd5660b1f1194b081e13a2ee690078a0f6e1677c`

- Proof: `src/pages/Path/components/WorkspaceHeader/index.module.less`、`components/Sidebar/index.module.less`、`components/ResizableSidebar/`、`src/pages/Path/index.tsx`、`index.module.less`。
- 去除左侧顶部导航及文件工具栏两条横线，工具栏保留 39px 高以保持与文档导航居中对齐；6px 拖动命中区域不变，竖线移到右端与顶部边界衔接。折叠后隐藏失去对应关系的顶部边界和拖动条普通态竖线，悬停/键盘焦点仍显示拖动提示。
- `npm run build`：exit 0，保留原有大 chunk warning。
- 原有 `tests/path-layout-ui.py` 和 `tests/path-editor-ui.py` 均再次通过；导航覆盖 1440x1000/1024x768，编辑覆盖明亮 1440x1000/暗色 1024x768；明暗截图已人工检查。
- 临时只读 Playwright 测量：默认顶部/拖动边界均 x=287，键盘调宽后均 x=311，折叠再展开后仍均 x=311。折叠时顶部右边框 0px、拖动线 transparent，左侧两处底边框 0px。
- 定向 ESLint：0 error，主页面原有 navIndex 依赖 warning 保留；`git diff --check` 通过。21 项 Node 结果沿用同日上轮，本轮为样式修正未重复运行。
- 模拟 API，没有真实业务数据写入；临时服务已关闭并核查端口无监听。未提交、推送或部署。

## 顶部横线恢复（最新结论）

用户再次截图明确顶部文件/搜索下方应保留横线，上述“两条横线均移除”已被本节纠正：WorkspaceHeader 恢复 1px border-bottom，文件工具栏底部继续无边框；竖线对齐和拖动行为不变。

左右顶部行均使用 border-box：原 content-box 使 1px 边框超出 42px 父行，被下一行侧栏背景覆盖。本轮只读浏览器检查 1440 明亮与 1024 暗色，顶部导航及标签栏底边均为 y=107、厚度 1px、同主题颜色；elementFromPoint 确认边框区域属于顶部导航而未被覆盖，文件工具栏底边仍为 0px。截图 `path-header-line-1440.png`、`path-header-line-1024.png`。`git diff --check` 通过；整套构建/UI 回归沿用紧邻上轮结果，不声称本轮重跑。临时服务停止。
