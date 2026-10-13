# 阅读切文件后正文展开修复

Date: 2026-10-09
Status: implemented and verified locally; uncommitted
Branch: `codex/workspace-citation-integrity`

用户触发顺序：编辑 → 阅读 → 点击另一文件 → 编辑。1440px 视口原正文宽度 800px、x=463.5，修复前新文件正文宽度 1083px、x=322。

`python tests/path-editor-ui.py` 在修复前两次复现宽度断言失败，第二次只切换一次文件。临时探针证实隐藏时父容器宽度为 0、Vditor 行内边距为 `10px 35px`；显示后父宽度为 1153px，边距不更新。手动派发窗口 resize 后边距变为 `10px 176.5px`。本地依赖 `vditor/src/ts/ui/initUI.ts` 的 `setPadding` 与 resize 监听符合这一行为。

`EditorArea/index.module.less` 仅覆盖 IR 正文水平边距，使用容器百分比保持最大 800px 的正文列，保留桌面 35px 和移动端 10px 最小边距。CSS 随显示及容器宽度自然计算，不在模式切换时销毁编辑器，也不依赖全局 resize。探针已移除。

修复后验证：

- `python tests/path-editor-ui.py`：1440x1000 明亮、1024x768 暗色均 PASS。阅读时切另一文件再编辑、切回原文件后宽度和 x 坐标保持一致。
- 同一脚本检查侧栏最大宽度、收起/展开、窗口缩至 900px 再恢复；在一个浏览器任务内同时测正文/容器边界，避免 ResizeObserver 更新发生在两次测量之间。正文最大 800px，左右边距一致。
- 原格式显露、引用与表格修改、任务勾选、最后输入、撤销/重做及 mocked PUT 内容检查仍通过；没有 pageerror。
- `npm run build`：TypeScript 与 Vite exit 0，仅保留原大 chunk warning。`git diff --check` 通过。
- `path-editor-centered-1440.png`、`path-editor-centered-1024.png` 为切换后编辑状态截图，已人工检查。其余测试截图沿用原文件名。

本轮未重复 Node 回归、独立导航脚本或全仓 lint。测试使用模拟 API，未访问真实用户目录、业务数据库；临时 Vite 已停止，没有提交、推送或部署。
