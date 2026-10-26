# 知识图谱与分隔线验收

Date: 2026-10-09
Status: passed for requested behavior; existing lint diagnostics retained
Branch: `codex/workspace-citation-integrity`
Baseline: `fd5660b1f1194b081e13a2ee690078a0f6e1677c`

## Proof

- `src/pages/Path/index.tsx`：顶部面板独立切换，知识图谱入口重复激活。
- `src/pages/Path/components/TabBar/index.tsx`、`src/pages/Path/components/EditorArea/index.tsx`：显示名称统一。
- `src/pages/Path/components/ResizableSidebar/`、`src/store/modules/pathStore.ts`：拖动、折叠状态与空间限制。
- `tests/path-layout-ui.py`：真实浏览器事件，API 边界模拟。

## Executed checks

- 修改前新图谱断言失败，修改后通过；新增分隔线测试先因 separator 不存在失败，实现后通过。
- `python tests/path-layout-ui.py`：1440x1000、1024x768 均 PASS。覆盖顶部只换左栏、实际文件选择、重复图谱点击、鼠标与键盘调宽、左拖收起和拖回、最近宽度、420px 主区下限、窗口缩至 900px、图谱画布尺寸及原文件保存回归。
- `npm run build`：exit 0，保留既有大 chunk warning。
- `node --test tests/workspace-save-queue.test.cjs tests/personal-storage.test.cjs tests/resume-sync.test.cjs`：21 tests，21 pass，0 fail。
- 新组件及主页面/TabBar/pathStore ESLint：0 errors，1 个既有 navIndex warning；EditorArea 两个 error、两个 warning 在 HEAD 同样复现，未进行范围外修复。
- `git diff --check`：通过。

服务仅用于本地 mocked-API 验收，没有修改后端或业务数据，没有提交、推送或部署。
