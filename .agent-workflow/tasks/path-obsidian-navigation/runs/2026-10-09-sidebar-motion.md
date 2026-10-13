# 侧栏开合过渡与默认宽度

Date: 2026-10-09
Status: implemented and verified locally; uncommitted
Branch: `codex/workspace-citation-integrity`

用户要求按钮展开/收起增加过渡，默认左侧宽度适当增大。侧栏默认值从 240px 调为共享常量 300px；开合采用 200ms ease 宽度过渡，手动调宽后继续恢复最近宽度。

ResizableSidebar 的 ResizeObserver 报告实际宽度，Path 在绘制前直接更新 CSS 变量同步顶部标签边界，避免动画期间逐帧 React 状态回传慢一帧。拖动时关闭过渡，开始拖动读取实际宽度接管动画；CSS max-width 立即限制窗口变化，保留 420px 桌面主区与 560px 侧栏上限。系统 prefers-reduced-motion 为 reduce 时取消过渡。

验证证据：

- `python tests/path-layout-ui.py`：1440x1000、1024x768 均 PASS。默认宽度 300px；观察到开合中的中间宽度，宽度大于顶部按钮最小占位时顶部/分隔线边界差不超过 1px；动画期间主区不小于 420px。减少动态效果时没有中间宽度。拖动、图谱、文件树、上限、窗口缩小和键盘行为均通过。
- `python tests/path-editor-ui.py`：1440 明亮与 1024 暗色均 PASS，正文居中、文件与模式切换、语法显露、撤销/重做及 mocked PUT 保留。
- `npm run build` 最终版本通过，保留原大 chunk warning。
- 定向 ESLint 检查 ResizableSidebar 与 Path：0 error，仅既有 navIndex 依赖 warning；`git diff --check` 通过。
- 独立默认布局截图人工检查通过：`path-sidebar-default-1440.png`、`path-sidebar-default-1024.png`。实际默认侧栏均 300px，对应主区 1093px、677px。

本轮未重复 Node 回归或全仓 lint。浏览器使用拦截 API，没有授予真实用户目录或更改业务数据库。临时验证服务已关闭；没有提交、推送或部署。
