# Architecture

- 前端入口：`src/main.tsx`，React + React Router，Redux Toolkit，Ant Design 6。
- 主题选择：`src/store/modules/themeStore.ts`；`src/hooks/useTheme.ts` 解析明亮、暗黑和跟随系统。
- `src/components/AppThemeProvider/index.tsx` 位于 Redux Provider 内、路由外，统一 Ant Design 算法、HTML `data-theme` 和本地持久化。
- 自定义组件使用 `src/styles/theme.less` 的 CSS 变量。
- 独立简历编辑路由使用 Workbench，复用全局主题配置。
- 学习规划仍以 MySQL growth_workspace.data JSON 保存；GET/PUT 使用 revision，旧版本写入返回 409。
- src/utils/workspaceSaveQueue.ts 管理每用户串行保存；Redux listener 触发保存，未确认草稿保留本地，状态栏显示保存状态。
- 冲突由用户选择保留副本后更新，不自动覆盖远端引用。相邻 backend 引用服务核实来源、私人会话及具体消息归属、文章选段；工作区追加使用行锁事务。
- 首次有效引用在同一事务内创建默认工作区和引用文件，无需先打开学习规划；已有工作区只补建缺失的 folder-cite，遇到目录 ID 被文件占用或损坏数据时拒绝覆盖。默认目录为 MySQL JSON 内的虚拟文件系统，不是电脑目录。
- 简历正式版本使用相邻后端 resume_workspace（每用户一条 JSON 集合、revision）；GET/PUT /resume/workspace 以登录身份隔离，旧版本返回 409。启动时幂等建表，勿重跑整库初始化。
- resumeStore 复用 WorkspaceSaveQueue，旧缓存只在迁移标记缺失时参与首次迁移；同 ID 不同内容另存恢复副本。保存确认前保留每用户、每页面草稿；迟到加载响应以队列已接受的版本回填。
- 共用目录配置界面和样式直接归属 src/pages/Layout/components/Setting/，位于 API Key 卡片下方；src/components/PersonalStorage/ 只提供学习规划和简历共用的保存状态提示。File System Access 读写句柄按账号放入 IndexedDB。personalDirectory 串行输出 KNOWVIA/user-账号/学习规划/workspace.json、Markdown 及 简历/resumes.json、单份 JSON；手工修改文件保留原件另存平台副本，不自动反向上传或删除历史文件。
- 云端与目录保存独立；目录权限须由点击显式恢复，后台不得弹窗。账号/目录变化停止后续旧任务写入；本地集合标注云端版本及确认状态。测试记录在 tasks/personal-storage/，原生选择框模拟、真实 OPFS 写入，不代表已对用户 Windows 目录完成验收。
