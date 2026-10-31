# 路径配置与本地保存状态验收

## 结论

本次需求已完成：个人目录配置统一放在设置页；学习规划和简历分别展示本地保存状态；绿色“已保存到本地文件夹”仅在当前模块、当前版本同时得到服务器确认并完成本地写入时出现。

## 验收范围

- 设置页提供路径配置、选择、更换、重新授权和解除绑定，并显示目录名称及两个模块的相对目录结构。
- 学习规划齿轮跳转设置页的路径配置，简历页和编辑器不再重复放目录配置入口。
- 学习规划底部状态栏和简历标题区域均显示本地保存状态；未配置、等待、失败、冲突和其他模块的状态不会误显示绿色成功。
- 新版本产生后立即撤销旧的绿色成功状态；本地文件被人工修改时保留平台副本，不覆盖原文件。

## 自动化证据

| 检查 | 结果 |
|---|---|
| Node 回归测试 | `node --test tests/personal-storage.test.cjs tests/resume-sync.test.cjs tests/workspace-save-queue.test.cjs`，21/21 通过 |
| 前端构建 | `npm run build` 通过（`tsc -b && vite build`） |
| 差异检查 | `git diff --check` 通过 |
| 浏览器验收 | `tests/personal-storage-ui.py` 已完成隔离数据库、真实 Chrome IndexedDB/OPFS 写入和页面布局检查；11/11 场景通过 |

## 尚未宣称的范围

- 浏览器测试使用受控的原生目录选择模拟；真实 Windows 文件夹选择和系统权限变化仍需在目标机器上手工点选一次。
- 工作区当前未提交、未推送、未部署；本记录不把构建通过当作线上服务已更新。

## 追加检查计划：学习规划状态栏间距

- 在浏览器中测量保存提示文字至笔记数、笔记数至字数的间距；两个间距应均为 16px，检查保存中及成功两种状态、宽窄视口。
- 以隔离的接口响应和浏览器目录验证切换文件实际产生工作区保存请求及本地 `workspace.json` 更新，并确认没有改变笔记正文。
- 运行现有保存回归测试、前端构建和差异检查；不改真实账号或用户电脑目录。

## 追加验收结果（2026-10-08）

- 学习规划保存提示文字右对齐，其固定 132px 宽度保留。Chromium 实测 1440px 和 1024px 视口、等待与成功状态，两处可见间距均为 16px，右侧内容没有溢出。
- 浏览器切换 A/B 标签确实产生 `PUT /growth/workspace`，真实 OPFS 的 `workspace.json` 随后保存当前 `activeTabId`；本地云端版本与确认标记匹配，两篇笔记正文保持不变。
- 测试初始 Markdown 未带末尾换行时，Vditor 会规范化添加末尾换行；改用编辑器标准格式的验收数据后，切换行为没有正文变化。
- 本轮 Node 保存回归 21/21 通过、`npm run build` 通过、`git diff --check` 通过。浏览器没有 pageerror。
- 证据：`runs/status-gap-browser.json`、`runs/status-gap-pending.png`、`runs/status-gap-success.png`。本轮接口为内存模拟，目录选择为模拟、IndexedDB/OPFS 写入为真实 Chromium API；不代表正式 MySQL 或真实 Windows 目录验收。

## 2026-10-24 目录重选验收

- 原失败：`node --test tests/personal-storage.test.cjs` 新增目录重选测试在旧实现下明确失败：`must not create KNOWVIA inside selected KNOWVIA`，原有 12 项通过。
- 修改后：`node --test tests/personal-storage.test.cjs tests/resume-sync.test.cjs tests/workspace-save-queue.test.cjs`，30/30 通过（含矩阵子测试）。覆盖三种入口及持久化恢复、两模块原路径复用、取消、非法账号、旧清单、人工编辑保护和保存队列。
- 浏览器：`tests/personal-directory-reuse-ui.py` 的 8 个检查通过；实际 Chromium OPFS/IndexedDB 验证 Documents → KNOWVIA → user-2 → Documents、刷新恢复、取消、拒绝其他账号及人工修改保留。1440/1024px 路径卡片无横向溢出，pageerror 为 0。
- 构建：进程内 `NODE_OPTIONS=--max-old-space-size=1024 npm run build` 通过，既有大包提示保留。首次未设堆上限的构建在转换阶段退出 1、未给诊断，随后按既有验收方式限制堆内存重跑通过；不将第一次执行计为通过。
- Lint：目录服务和计划文件零诊断；Setting 保留与 HEAD 相同的两项既有问题（unused error、getAiModel 的 set-state-in-effect），本轮未改 AI 配置逻辑。`git diff --check` 通过。
- 证据：`runs/directory-reuse-browser.json`、`runs/directory-reuse-1440.png`、`runs/directory-reuse-1024.png`。
- 目录选择框与授权为模拟，文件及清单写入是真实隔离 OPFS；没有向用户的真实 Windows 目录、正式数据库或 AI 配置写入数据，也没有删除/合并旧嵌套目录。原生系统选目录仍需用户在新版手工确认一次。
- 改动未提交、未推送。agent-workflow CLI 仍不可用，沿用现有任务直接维护证据；未下载替代 CLI。

## 2026-10-24 差异警告恢复

- 新失败回归先复现旧警告缓存问题，修改后存储/保存队列 35/35 通过。
- 真实 Chromium OPFS/IndexedDB 的 11 条目录检查通过，确认后原件按字节保留、标准备份恢复、刷新后当前警告不复现；API 和原生目录选择仍隔离模拟。
- 学习规划两视口回归通过，验证右键移除菜单后文件和目录拖拽及权限确认仍生效。
- 限定堆内存的生产构建、源码差异检查通过；目录服务及 Sidebar lint 无诊断，Setting 无新增诊断，保留既有 unused error。
- 完整边界、早期脚本失败及最终证据：[差异恢复记录](runs/2026-10-24-conflict-recovery.md)。没有在用户真实目录执行恢复。
