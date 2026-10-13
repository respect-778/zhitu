# 两行布局与阅读／编辑验收

Date: 2026-10-09
Status: passed for requested behavior; baseline lint diagnostics retained
Branch: `codex/workspace-citation-integrity`
Baseline: `fd5660b1f1194b081e13a2ee690078a0f6e1677c`

## Proof

- `src/pages/Path/index.tsx`、`components/TabBar/`、`components/ResizableSidebar/index.tsx`：顶部标签与侧栏导航同层，宽度跟随侧栏。
- `src/pages/Path/components/EditorArea/DocumentToolbar.tsx`：第二行导航、完整祖先目录与模式切换。
- `src/pages/Path/components/EditorArea/index.tsx`、`index.module.less`：只读 Viewer、保留挂载的 IR 编辑器、同步输入捕获与明暗样式。
- `src/pages/Path/components/EditorArea/markdownEditing.ts`：链接显露、结构块原位源码编辑、原生撤销历史集成。
- `tests/path-editor-ui.py`：真实 Chrome 交互和隔离 mocked API 持久化验收。

## Executed checks

- 链接与引用块源码断言分别复现原行为缺口，实现后通过；两行布局位置由页面边界坐标断言验证。
- 快速源码提交后立即撤销的回归用例发现延迟撤销记录问题；实现同步事务记录并回传规范化内容后，Ctrl+Z/Ctrl+Y 均通过。
- `python tests/path-editor-ui.py`：1440x1000 明亮、1024x768 暗色均 PASS，检查两行位置、只读阅读、格式语法显露、引用/表格修改、任务勾选、快速切文件和模式、普通输入及最终 PUT 内容。没有 pageerror；阅读截图已人工检查。
- `python tests/path-layout-ui.py`：两个视口均 PASS，保留图谱独立切换、侧栏拖动、空间下限、文件树操作及保存回归。
- `npm run build`：TypeScript + Vite exit 0，保留既有大 chunk warning。
- `node --test tests/workspace-save-queue.test.cjs tests/personal-storage.test.cjs tests/resume-sync.test.cjs`：21/21 PASS。
- 定向 ESLint：新增文件无诊断；EditorArea 两个 error/两个 warning、主页面一个 warning 均为既有诊断，EditorArea 再次对 HEAD 复现。未声明全仓 lint 通过。

测试只使用模拟登录/API，没有配置或改写用户 Windows 资料目录、后端或数据库；临时 Vite 服务已停止。没有提交、推送或部署。
