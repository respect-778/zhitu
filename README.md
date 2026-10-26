# 知途 / KNOWVIA

前后端共用一个 Git 仓库，分别安装依赖、启动和构建。

```text
.
├── zhitu/       # React + TypeScript + Vite 前端
└── backend/     # Express + TypeScript + MySQL 后端
```

## 本地配置

在仓库根目录使用 PowerShell 执行。已有配置文件时保留原文件，不覆盖：

```powershell
npm --prefix zhitu ci
npm --prefix backend ci
if (!(Test-Path zhitu/.env.development)) { Copy-Item zhitu/.env.example zhitu/.env.development }
if (!(Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
```

填写 `backend/.env` 中的数据库连接及独立随机密钥；第三方服务配置按需填写。模板中的密钥为空，不能直接用于部署。已有环境应保留原密钥，尤其是用于已保存模型配置加密的密钥。

数据库首次配置见 [后端数据库指南](backend/DATABASE_SETUP.md)。初始化和种子脚本只用于新建开发数据库，已有数据库不要重复导入。

## 启动与构建

在两个终端分别运行：

```powershell
npm --prefix backend run dev
```

```powershell
npm --prefix zhitu run dev
```

按模板配置时，前端地址为 `http://localhost:5173`，后端地址为 `http://localhost:4000`。前端使用 `/api`，开发代理将它转发到 `4000` 并移除 `/api` 前缀，与现有 `zhitu/vite.config.ts` 一致。

```powershell
npm --prefix zhitu run build
npm --prefix backend run build
```

部署时前端工作目录设为 `zhitu`，输出为 `dist`；后端工作目录设为 `backend`，构建后使用 `npm start`。两端的依赖清单和锁文件各自保留。生产反向代理也应将 `/api/*` 转发给后端并移除 `/api` 前缀，Vite 开发代理不会包含在静态构建中。

## 版本管理范围

- 提交源码、数据库结构及示例脚本、测试、锁文件和 `.env.example`。
- 本地 `.env*`、依赖、编译输出、日志及 `backend/uploads/` 不入库。
- 根目录只纳入两个应用目录及本说明和 `.gitignore`，工作区中的论文、个人资料和本地工具目录保持本地。

原前端 Git 历史继续保留；结构调整前的历史路径没有 `zhitu/` 前缀。前端详情见 [前端文档](zhitu/README.md)，后端详情见 [后端文档](backend/README.md)。
