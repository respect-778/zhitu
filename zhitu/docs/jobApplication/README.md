# 网申投递模块

本分支从 `respect-778/zhitu` 的最新 `main`（`261f31dada303c9b0f9734ffc7b00b301fd832b7`）创建为 `codex/job-application`，只加入网申模块及其依赖。网页沿用宿主的登录保护、Redux 简历数据、导航与 `/applications` 路由。

## 目录与代码约定

| 目录 | 内容 |
| --- | --- |
| `zhitu/src/pages/JobApplication/` | 网申页面、页面组件、`index.module.less` |
| `zhitu/src/api/jobApplication/` | 浏览器桥接、岗位库 API、投递 API |
| `zhitu/src/hooks/jobApplication/` | 页面状态 hooks |
| `zhitu/src/types/jobApplication/` | 自动填写类型、服务端岗位契约的类型导出 |
| `zhitu/src/utils/jobApplication/` | 筛选、缓存、展示模型、简历数据投影 |
| `zhitu/extensions/jobApplication/` | 原浏览器扩展全部源码 |
| `backend/services/jobApplication/` | 原网申工程及许可证、岗位库、邮件服务、原生测试 |
| `backend/database/jobApplication/` | 官网岗位 JSON、Excel、公开岗位库快照 |
| `zhitu/tests/jobApplication/` | 合成岗位、合成简历及网页表单回归 |

前端使用目标仓库的 React、TypeScript、`@/` 导入、页面目录和 Less Modules。Python/Vue 旧工程和 Node 岗位库保持各自的语言与依赖约定；旧 Vue 界面保留在服务目录，当前官网使用 `zhitu/` 下的 React 页面。原 `consumer/src` 已迁入上述前端目录，扩展已迁出到 `extensions`，没有另留第二套官网页面。逐文件来源及 SHA-256 见 [fileMap.json](fileMap.json)。

## 本地启动

使用 Node 24.12.x，前端位于 `zhitu/`：

```sh
cd zhitu
npm ci --ignore-scripts
# 首次安装：复制 .env.example 为 .env（VITE_BASE_URL=/api）
npm run dev
```

打开 `http://localhost:5174/applications`，先通过宿主网站登录。宿主原有 `/api` 代理仍指向其 4100 端口服务。扩展从 Chrome/Edge 的“加载已解压的扩展程序”选择 `zhitu/extensions/jobApplication`；使用当前浏览器账号登录对应平台。开发端口保持 main 的 5174；扩展桥与邮件接口已适配 localhost/127.0.0.1 的 5174 来源。

官网默认查询岗位库：`/api/catalog/*` 代理到 5198。先在仓库根目录执行 `cd backend && npm ci --ignore-scripts` 安装岗位库工作区依赖；然后在 `zhitu/` 中执行下列转发命令。需要独立 PostgreSQL、数据库角色与生成的 Prisma Client；`catalog/.env.example` 只提供参数说明，服务不会自动读取 `.env`。按 [存储说明](../../../backend/services/jobApplication/catalog/docs/storage.md)配置。数据库生成/迁移包装器要求预备的 Linux x64 容器及已校验的 `/review-tools/schema-engine`，不会在 Windows 自动执行迁移。准备好服务环境后使用：

```sh
npm run catalog:db:generate
npm run catalog:typecheck
npm run catalog:api
```

这里的网申模块也保留 BOSS、智联、猎聘读取、官网申请页辅助填写、邮件投递和扩展中的 BOSS 会话能力。宿主原来没有 KNOWVIA 工作台，工作台页面不混入这个分支。原 Python/Vue 工程的独立启动方式见 [原工程 README](../../../backend/services/jobApplication/README.md)。

邮件接口仅绑定本机 5199，网页通过 `/api/applications/*` 代理访问：

```sh
npm run applications:api
```

用户在页面选择附件和邮箱并确认发送。SMTP 授权码、实际投递回执、浏览器登录资料不随源码上传。原功能的“填写完成”“请求已发送”和“平台投递成功”保持区分。

## 官网数据

[数据目录](../../../backend/database/jobApplication/)包含 100 条经审核的官网岗位、40 家企业及对应 Excel，JSON 保留采集的正文；另外包含本地公开岗位 API 的 104 条已发布记录快照。计数和文件 SHA-256 在 `manifest.json`。该快照是公开 DTO 导出，不是私人数据库备份。

可重放的 100 条审核清单位于 `backend/services/jobApplication/catalog/config/reviewed/official-internships-2026-11-11.json`。在岗位库运行环境中先离线校验，再用专用 writer 角色导入：

```sh
cd backend/services/jobApplication/catalog
node src/worker/ingest-reviewed-official.ts --check
# 配置专用 writer 数据库环境后，明确执行入库发布：
node src/worker/ingest-reviewed-official.ts --publish
```

本次重新接入没有执行真实数据库发布或岗位投递。

## 检查

```sh
npm run build
npm run test:module
npm run catalog:typecheck
npm run catalog:test
```

浏览器回归使用独立无头浏览器、5297 端口与合成数据。首次使用需安装 Playwright Chromium（`npx playwright install chromium`）；Windows 默认使用已安装 Edge。岗位库完整回归使用 Linux，数据库集成用例仅在明确配置专用测试数据库时运行。邮件服务测试：在 `consumer/server` 运行 `python -X utf8 -m unittest -q test_application_mail`。

接入保留 main 的主题、知识图谱和云端简历实现；自动填写等待当前账号的云端简历加载完成，切换账号时立即隔离旧资料。新增导航适配窄屏。XLSX 解析依赖从 backend 的工作区依赖树解析，上限保持 256；路径校验、符号链接拒绝与子进程文件权限继续保留。

原服务的历史文档保留其原工程路径和历史验证说明；本文件是本分支的目录与启动入口。实际验证结果见 [verification.md](verification.md)。
