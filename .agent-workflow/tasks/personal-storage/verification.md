# Verification

状态：本次实现及自动化验收通过；2026-10-07。未提交、推送或部署。

## 实际执行

| 检查 | 命令与结果 |
|---|---|
| 前端保存、迁移及目录 | `node --test tests/resume-sync.test.cjs tests/personal-storage.test.cjs tests/workspace-save-queue.test.cjs`：18/18 通过 |
| 简历接口及页面 | 后端 `RUN_PERSONAL_STORAGE_UI=1 node --test tests/resume-storage.test.cjs`：11/11 通过，包含 9 个接口场景、1 条页面链路及父测试 |
| 原引用功能回归 | 后端 `RUN_FIRST_CITATION_UI=1 node --test tests/workspace-integrity.test.cjs`：23/23 通过，包含 21 个接口场景、1 条页面链路及父测试 |
| 后端构建 | `npm run build` 通过 |
| 前端构建 | `NODE_OPTIONS=--max-old-space-size=1024 npm run build` 通过；原有大包提示保留 |
| 定向 lint | 新增源码、resumeStore、store/index、EditorHeader、Workbench、Path ActivityBar 均通过 |
| 原简历列表页 lint | 仍有 6 处既有 `react-hooks/static-components` / `react-hooks/refs` 报错；用 HEAD 原文件通过 stdin 复核，同样 6 处。本次未扩大范围修复，不宣称全仓 lint 通过 |
| 差异 | `git diff --check` 通过；新文件及后端另行检查空白与源码快照 |

合计 Node 测试统计 52 项，0 失败，其中包含两项父测试。测试期间新增的迟到加载响应回填、错误姓名对象写入用例先复现失败，再修复并通过；没有通过修改预期掩盖失败。

## 页面验收

真实页面连到生产路由、生产存储模型及隔离 MySQL，完成以下流程：

1. 旧 localStorage 简历迁移，服务器确认后才记录迁移标记。
2. 编辑姓名后立即返回列表，服务器保存最后一次输入。
3. 选择一次个人目录，实际生成简历集合 JSON、每份简历 JSON、学习规划集合 JSON。
4. 学习规划新建笔记、编辑 Vditor，服务器与同一目录的 Markdown 均包含新内容。
5. 清空 localStorage 后，简历从服务器恢复，目录句柄从 IndexedDB 恢复。
6. 取消目录选择保留原绑定；权限失效不影响云端保存；显式重新授权恢复目录写入。
7. 强制远端先更新，旧页面收到真实 409；点击“保留副本并更新”，远端与本地两份内容都保留。
8. 手工修改目录内 resumes.json，平台保留原文件并生成“平台副本”。

页面无 pageerror。检查 1440×1000 和 1024×800；目录弹窗完整可见、按钮未超出视口。截图等待弹窗动画结束，避免把过渡帧当作最终布局。

证据：[结构化页面结果](runs/personal-storage-browser.json)、[共用目录截图](runs/shared-directory.png)、[原文件保护截图](runs/directory-protection.png)。失败截图只作调试记录，不是最终结果。

## 验收边界与环境清理

- 系统原生目录选择框和权限变化在自动化中模拟；实际文件写入、读取、createWritable 和 IndexedDB 句柄保存使用真实 Chrome OPFS。未用 OS 选择框选取用户真实 Windows 目录，不能把这部分宣称为真实电脑目录端到端验收。
- 手工验收：加载新版后端，在 Chrome/Edge 打开学习规划设置或简历“个人资料存储”，选择测试目录，编辑笔记/简历，查看所选目录下 KNOWVIA/user-账号/ 的 JSON 与 Markdown。
- 两组测试只写随机隔离库，结束后删除；原业务库各表行数前后相同。没有删除用户资料、重启用户原有服务或写入其个人目录。
- 验收专用 5175 Vite 服务在测试结束后关闭；当前原运行服务及线上部署未验收。后端启动会幂等创建 resume_workspace，不应重新执行整库初始化。
- 本地副本为单向输出，不是本地文件编辑后自动上传。旧删除/重命名文件保留为历史副本，当前内容以集合 JSON 为准。
- 退出浏览器会终止目录写入；服务器的页面卸载 keepalive 受浏览器限制，不能保证大照片在强制关闭时立即提交。未确认草稿仍保留供下次恢复；不要在未保存时清空全部站点数据。
