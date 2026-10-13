# 等宽标签、宽度过渡与最右侧关闭菜单

日期：2026-10-10。目标：`codex/workspace-citation-integrity` 未提交工作区。

文件/图谱标签默认上限 200px；拥挤时按实测可用宽度均分，保留 64px 操作空间，不产生横向滚动条。新增和宽度恢复带 200ms ease 动画，减少动态效果时禁用。`+` 跟随标签，右侧箭头固定在栏末尾，点击打开下拉菜单，再选择“全部关闭”。无标签时仍可打开菜单，该菜单项禁用。

关闭通过单个 Redux action 清空 openTabs/activeTabId，原同步 listener 保存空白状态；主页面清空图谱和前进/后退历史。文件数据不删除，现有编辑器清理逻辑捕获末次输入。

验证：

- `npm run build` 通过，仅既有 chunk 体积 warning。
- `python tests/path-tabs-ui.py`：1440x1000 明亮、1024x768 暗色均 PASS。少量标签同为 200px，24 文件 + 1 图谱全部等宽且无横向溢出；新增缩窄和关闭后增宽测得中间值，侧栏开合/900px 窗口重排、减少动态效果均通过。标题区域实际点击仍正常切换文件，不误点关闭。
- 菜单箭头在两个视口、少量/拥挤/空白状态均贴栏最右边；打开菜单保持标签数量。选择全部关闭后文件/图谱均关闭、返回/前进禁用、空白工作区可新建。普通输入立即关闭后 mocked PUT 保留最后输入，其他原文件内容一致；刷新保持零标签，重开笔记能看到修改；图谱为活动标签或唯一标签也可全部关闭。
- `python tests/path-layout-ui.py`：两视口 PASS，原导航、图谱、侧栏拖动/过渡和布局回归保留。
- `node --test tests/workspace-save-queue.test.cjs tests/personal-storage.test.cjs tests/resume-sync.test.cjs`：21/21 通过。
- 定向 ESLint：TabBar、Path、pathStore 无错误；Path 保留此前 navIndex 依赖 warning。`git diff --check` 通过。

截图已人工检查：[明亮菜单](path-tabs-menu-1440.png)、[暗色菜单](path-tabs-menu-1024.png)、[少量标签](path-tabs-few-1440.png)、[拥挤标签](path-tabs-many-1440.png)、[全部关闭](path-tabs-closed-1440.png)。

浏览器使用临时本地 Vite 服务、模拟工作区 API 与本地编辑器资源。沙箱首次阻止 Vite/Playwright/构建缓存和 Node 子进程，经命令级授权后完成检查。未调用真实后端或用户目录，未提交、推送或部署。独立编辑模式脚本和全仓 lint 未重跑，原结论保留原日期。

临时 Vite 服务已停止，5175 端口确认无监听；项目记忆索引、变更记录及本验收记录的 35 个本地链接均确认存在。

## 页面返回不播放动画的跟进

用户要求从其他界面进入学习规划时已有标签直接显示。`python tests/path-tabs-ui.py` 增加 document 动画/宽度过渡事件采集，以真实顶部导航离开并返回。修复前失败输出：`unexpected route-entry motion` 包含一次 width transitionrun 和两次 tabEnter animationstart。

原样式把 tabEnter 应用于每个挂载的标签，初始恢复和测宽也参与 width transition。修复为：Path 本次用户工作区加载完成后结束 restoring；TabBar 恢复期先无动画地提交实际宽度，再开启后续 width transition，只对本实例新插入的标签设置入场标记。减少动态效果的覆盖规则同时覆盖新增标记。

最终验证：1440x1000 明亮与 1024x768 暗色均 PASS。首次异步加载、2 个标签离开再返回、24 个已操作标签离开再返回均无 tabEnter 或 width transition；页面内新增仍入场，拥挤缩窄和关闭恢复仍有动画中间值，reduced-motion 新增亦无动画。全部原菜单、最后输入保存、空白状态刷新、重新打开和新建验收仍通过，无 pageerror。最终 `npm run build` 通过，仅原 chunk warning；定向 lint 无错误、仅既有 navIndex warning；`git diff --check` 通过。本修复未重新执行 Node、独立导航/编辑脚本或全仓 lint，前述结果属于本日此前检查。
