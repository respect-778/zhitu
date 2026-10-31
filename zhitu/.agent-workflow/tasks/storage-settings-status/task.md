# 统一目录设置与保存提示

状态：已完成，2026-10-08。

## Goal
把学习规划和简历共用的电脑目录配置移到全局设置，两个页面分别显示当前内容的本地保存状态。

## Scope
现有 PersonalStorage 组件、personalDirectory 状态、全局 Setting、学习规划状态栏与设置齿轮、简历配置入口、相关测试与项目记录。

## Acceptance
- 设置侧栏有路径配置，可选择、更换、授权和解除目录；展示目录名及两模块实际子目录，不虚构浏览器无法取得的 Windows 绝对路径。
- 简历页与编辑器不再放目录配置按钮；学习规划齿轮跳转设置的路径配置。
- 个人资料文件夹配置的 JSX 与样式直接放在 Setting 目录中，紧接 API Key 区域；不再引用全局配置组件。
- 只有同一模块当前版本已获服务器确认并完成本地写入，才显示绿色“已保存到本地文件夹”。新编辑立即撤销旧成功提示；异常仍可见并可恢复。
- 保留已有保存、迁移、账号隔离、人工文件保护。做单元回归与隔离数据库浏览器验收。

## 验收记录
- `node --test tests/personal-storage.test.cjs tests/resume-sync.test.cjs tests/workspace-save-queue.test.cjs`：21/21 通过。
- `npm run build`：通过；保留既有 Vite 大包提示。
- `git diff --check`：通过。
- 静态归属检查通过：`PersonalStorageSettings` 已移除，目录配置 JSX 与样式分别位于 `Setting/index.tsx` 与 `Setting/index.module.less`；`src/components/PersonalStorage/` 仅保留学习规划和简历共用的保存状态提示组件。
- `Setting/index.tsx` 的定向 lint 仍有 2 个基线错误；以 `HEAD` 文件复核后确认均为本次修改前已存在，未扩大范围修复。
- 浏览器端目录存储验收沿用既有隔离环境 11/11 结果；本次仅调整设置页代码归属，未在真实用户目录上重新执行端到端写入。
- 追加状态栏修正：提示文字在固定宽度内右对齐，1440px/1024px 浏览器实测两处间距均为 16px；保存回归 21/21 和构建通过。模拟接口与真实 OPFS 验证切换笔记保存工作区状态，标准格式的笔记正文保持不变；本轮未访问正式数据库或真实用户目录。

## Out of scope
改业务存储格式、原生目录反向导入、区块链、Wiki、提交/推送及已有无关修改。

## 2026-10-24 目录重选修复

- Goal：选择父目录、已有 KNOWVIA 或当前账号 user-ID 时复用同一账号目录，保留账号分层和手工文件保护。
- Scope：repo path: src/utils/personalDirectory.ts；repo path: src/utils/personalDirectoryPlan.ts；repo path: src/pages/Layout/components/Setting/index.tsx；repo path: tests/personal-storage.test.cjs；repo path: tests/personal-directory-reuse-ui.py；repo path: .agent-workflow/tasks/storage-settings-status/；repo path: .agent-workflow/memory/architecture.md。
- 验收：三个入口、旧句柄恢复、取消选择、其他账号目录拒绝、保护清单兼容、设置预览、1440/1024px 布局和现有保存回归。
- 边界：不删除或合并此前误生成的嵌套目录，不反向导入本地笔记，不访问用户真实 Windows 资料目录，不改 AI 助手。

## 2026-10-24 本地警告处理与移动菜单

- 用户要求解释并消除本地差异警告，同时移除学习规划右键“移动到…”，继续通过拖拽移动。
- 补充范围：repo path: src/pages/Path/components/Sidebar/index.tsx；repo path: tests/path-wiki-foundation-ui.py；repo path: .agent-workflow/tasks/learning-wiki-foundation/。其余目录服务、设置页、存储测试沿用上述范围。
- 明确确认后先保留电脑原件、再恢复平台备份；不自动消音真实差异，不执行用户真实目录修复，不反向上传本地内容。
