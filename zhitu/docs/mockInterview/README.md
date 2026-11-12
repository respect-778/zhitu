# 模拟面试模块

本分支从 `respect-778/zhitu` 的最新 `main`（`261f31dada303c9b0f9734ffc7b00b301fd832b7`）创建为 `codex/mock-interview`。官网入口为 `/interview`，复用宿主登录保护和导航。

## 目录与代码约定

| 目录 | 内容 |
| --- | --- |
| `zhitu/src/pages/MockInterview/index.tsx` | 官网入口、连接状态与重试 |
| `zhitu/src/pages/MockInterview/index.module.less` | 页面样式，使用宿主主题变量 |
| `backend/services/mockInterview/apps/web/` | 原 Next.js 面试设置、面试室和报告 |
| `backend/services/mockInterview/apps/agent/` | 原 Python/FastAPI 与语音 Agent |
| `backend/services/mockInterview/packages/` | 原共享契约、企业扩展 |
| `backend/services/mockInterview/supabase/` | 原数据库迁移 |
| `backend/services/mockInterview/consumer/server.mjs` | 官网模式启动器 |
| `zhitu/tests/mockInterview/` | 官网接入回归 |

宿主前端采用既有 `pages`、`@/` 和 Less Modules 规范。Next.js、pnpm、Python/uv 项目保持原有内部结构，避免破坏文件路由和包依赖。原 `consumer/src` 页面迁入宿主 `zhitu/src/pages/MockInterview`。完整源文件映射及 SHA-256 见 [fileMap.json](fileMap.json)。DeepInterview 的 Apache-2.0 LICENSE、NOTICE 和其他原始资源均保留。

## 安装与启动

前端位于 `zhitu/`：

```sh
cd zhitu
npm ci --ignore-scripts
# 首次安装：复制 .env.example 为 .env（VITE_BASE_URL=/api）
npm run dev
```

从仓库根目录另开终端，模拟面试服务使用自己的锁文件：

```sh
cd backend/services/mockInterview
pnpm install --frozen-lockfile
cd apps/agent
uv sync --extra dashscope
```

按服务根目录 `.env.example` 创建本机 `.env`，填写 LiveKit、模型及语音服务参数；Next.js 的本机公开连接参数放在 `apps/web/.env.local`。本分支不包含真实密钥。具体可选后端、LiveKit 与模型配置见 [原工程 README](../../../backend/services/mockInterview/README.md)。

在 `zhitu/` 目录另开终端运行 `npm run interview:dev`，官网模式 Next.js 绑定 3001，并使用 `/mock-interview` 基础路径。Python API 绑定 8000，LiveKit 默认 7880，需要按原工程启动。官网同源 `/mock-interview/*` 代理到 3001；打开 `http://localhost:5174/interview`。

官网只在面试服务健康检查通过后显示内嵌页面；服务未启动时保留重新连接入口。独立 Next.js 默认 3000 的运行方式仍在原工程 README 中，接入官网时应使用上述 `interview:dev` 命令。

生产构建命令分别为 `npm run build`（宿主）和 `npm run interview:build`（面试 Next.js）。两者均完成后，面试服务可通过 `npm run interview:start` 启动；生产环境还需配置对应反向代理及服务端参数。

## 验证与数据

```sh
npm run test:module
# 在 backend/services/mockInterview 中：
pnpm --filter @deepinterview/web typecheck
pnpm --filter @deepinterview/web test
# 在 apps/agent 中：
uv run python -X utf8 -m pytest -q
```

官网回归使用独立无头浏览器、5298 端口、合成登录与拦截的健康检查。首次使用需安装 Playwright Chromium；Windows 默认使用已安装 Edge。Python 在 Windows 上显式使用 UTF-8 读取迁移文件。

未上传私人简历、面试录音、会话数据库、真实报告、`.env`、依赖目录或构建缓存。数据表结构和历史存储代码保留，首次运行不会带入原本地账号的面试记录。本次验证未调用真实模型、语音服务或创建真实面试。

接入保留 main 的主题、知识图谱、云端简历与主站后端实现，仅加入模拟面试导航及独立服务代理。验证结果见 [verification.md](verification.md)。
