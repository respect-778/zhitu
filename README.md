<div align="center">
  <img src="./zhitu/public/imgs/logo.png" alt="Knowvia Logo" width="420" />

  <h1>知途 · Knowvia</h1>

  <p><strong>把知识发现、深度阅读、学习规划与成长实践连接起来。</strong></p>
  <p>面向学生与终身学习者的 AI 学习成长平台。</p>

  <p>
    <a href="https://github.com/respect-778/zhitu/actions/workflows/ci.yml"><img src="https://github.com/respect-778/zhitu/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
    <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&amp;logoColor=white" alt="React 19" />
    <img src="https://img.shields.io/badge/Node.js-24-339933?logo=nodedotjs&amp;logoColor=white" alt="Node.js 24" />
    <img src="https://img.shields.io/badge/MySQL-8-4479A1?logo=mysql&amp;logoColor=white" alt="MySQL 8" />
  </p>

  <p>
    <a href="#核心能力">核心能力</a> ·
    <a href="#快速开始">快速开始</a> ·
    <a href="#项目结构">项目结构</a> ·
    <a href="#参与开发">参与开发</a> ·
    <a href="#许可证">许可证</a>
  </p>
</div>

---

## 关于 Knowvia

Knowvia 希望减少学习过程中反复搜索、零散收藏和来回整理的负担，让用户把更多注意力放在真正的理解与实践上。

它将知识广场、文章阅读、成长规划、AI 助手和简历工作台放进同一个学习流程：发现值得读的内容，留下标注与引用，沉淀为自己的学习资料，再把学习结果用于项目、求职和长期成长。

> [!NOTE]
> Knowvia 仍在持续开发中，功能、接口和数据库结构可能继续调整。目前更适合本地体验与共同开发。

## 核心能力

| 模块 | 能做什么 |
| --- | --- |
| **知识广场** | 浏览、搜索和筛选文章，查看热门、新内容、每周精选与个人早报，管理收藏和阅读历史。 |
| **文章精读** | 使用 AI 生成摘要与关键词，在阅读时留下高亮，并把有价值的内容引用到成长工作区。 |
| **成长规划** | 通过文档、标签页、文章引用与知识图谱组织学习资料，让零散内容逐渐形成自己的知识结构。 |
| **AI 助手** | 保存会话、流式对话与联网检索，并支持为不同 AI 服务商配置个人模型。 |
| **简历工作台** | 创建、管理和持续完善简历，把学习经历与项目成果沉淀为可展示的内容。 |
| **账户与体验** | 支持账户体系、可选的 GitHub / Google 登录、个人资料与明暗主题。 |

## 技术栈

| 层级 | 主要技术 |
| --- | --- |
| 前端 | React 19、TypeScript、Vite、Ant Design、Redux Toolkit、TanStack Query、Three.js |
| 后端 | Node.js、Express、TypeScript、LangChain、JWT、MySQL2、Redis |
| 数据与基础设施 | MySQL 8、Redis（可选，连接失败时使用内存降级）、GitHub Actions |

## 项目结构

```text
.
├── .github/workflows/   # GitHub Actions CI
├── backend/             # Express + TypeScript + MySQL 后端
│   ├── database/        # 数据库结构、种子与迁移脚本
│   ├── src/             # API、业务逻辑、模型与 AI Agent
│   └── tests/           # 后端集成测试
├── zhitu/               # React + TypeScript + Vite 前端
│   ├── public/          # 静态资源
│   ├── src/             # 页面、组件、状态与 API 封装
│   └── tests/           # 前端测试
├── LICENSE
└── README.md
```

## 快速开始

### 1. 环境要求

- Node.js 24
- npm
- MySQL 8
- Redis（可选）

### 2. 获取项目并安装依赖

```bash
git clone https://github.com/respect-778/zhitu.git knowvia
cd knowvia
npm --prefix zhitu ci
npm --prefix backend ci
```

### 3. 准备环境变量

PowerShell：

```powershell
Copy-Item zhitu/.env.example zhitu/.env.development
Copy-Item backend/.env.example backend/.env
```

填写 `backend/.env` 中的数据库连接，并为 `JWT_SECRET`、`JWT_REFRESH_SECRET` 和 `MODEL_CONFIG_SECRET` 分别生成独立随机值。前端开发环境默认使用 `/api`，通常不需要修改 `zhitu/.env.development`。

AI 摘要、关键词、联网搜索及 OAuth 均为可选能力，按需配置对应密钥。未配置时，账户、文章浏览、学习工作区和简历等基础功能仍可运行，对应的 AI 或第三方登录能力不可用。

> [!IMPORTANT]
> 不要把 `.env`、API Key、OAuth Secret 或数据库密码提交到 Git。`VITE_*` 变量会进入浏览器构建，也不能存放私密凭据。

### 4. 初始化数据库

确保 MySQL 命令行工具已安装并加入 `PATH`，且当前数据库用户拥有创建数据库和表的权限。先在仓库根目录进入 MySQL：

```bash
mysql -u root -p
```

然后在 MySQL 客户端中执行：

```sql
CREATE DATABASE IF NOT EXISTS zhitu CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE zhitu;
SOURCE backend/database/init.sql;
SOURCE backend/database/seed.sql;
EXIT;
```

`seed.sql` 只用于新的本地开发环境，已有数据库不要重复导入。更多说明见 [数据库初始化指南](./backend/DATABASE_SETUP.md)。

### 5. 启动项目

在两个终端分别运行：

```bash
npm --prefix backend run dev
```

```bash
npm --prefix zhitu run dev
```

默认访问地址：

- 前端：<http://localhost:5173>
- 后端：<http://localhost:4000>
- 健康检查：<http://localhost:4000/health>

前端通过 `/api` 访问后端；开发环境由 Vite 代理到 `4000` 端口并移除 `/api` 前缀。

## 构建与测试

```bash
# 生产构建
npm --prefix backend run build
npm --prefix zhitu run build

# 现有测试（后端测试需要已初始化的 MySQL 和 backend/.env）
node --test backend/tests/*.test.cjs
node --test zhitu/tests/*.test.cjs
```

后端集成测试需要可用的 MySQL 测试数据库。仓库的 [CI 工作流](./.github/workflows/ci.yml) 会在每次推送和 Pull Request 中验证数据库结构、后端构建与集成测试，以及前端测试与生产构建。

## 配置与部署

- 环境变量模板：[前端](./zhitu/.env.example) · [后端](./backend/.env.example)
- 数据库指南：[backend/DATABASE_SETUP.md](./backend/DATABASE_SETUP.md)
- 前端文档：[zhitu/README.md](./zhitu/README.md)
- 后端文档：[backend/README.md](./backend/README.md)

生产部署时，前端工作目录设为 `zhitu`、输出目录填写 `dist`（从仓库根目录看即 `zhitu/dist`）；后端工作目录设为 `backend`，执行 `npm run build` 后使用 `npm start`。反向代理需要将 `/api/*` 转发给后端并移除 `/api` 前缀。

## 参与开发

欢迎通过 Issue 提交问题、建议或学习场景，也欢迎通过 Pull Request 参与改进。

提交前请至少确认：

1. 前后端可以完成生产构建。
2. 与改动相关的测试已经通过。
3. 没有提交本地环境变量、密钥、上传文件或构建产物。
4. 数据库结构变化同时包含可复现的脚本或迁移说明。

## 许可证

Knowvia 使用 [MIT License](./LICENSE) 开源。第三方依赖及其资源仍遵循各自的许可证。
