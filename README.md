# knowvia (Zhitu)

## 项目概述

knowvia是一个全栈 Web 应用程序，采用前后端分离架构。

- **项目名称**: knowvia
- **架构**: 前后端分离
- **后端**: Node.js + Express + TypeScript + MySQL
- **前端**: React + TypeScript + Vite + Ant Design + Redux Toolkit

## 项目结构

```
knowvia/
├── backend/          # 后端服务
│   ├── src/          # 源代码
│   │   ├── controllers/  # 控制器层 (业务逻辑)
│   │   ├── middleware/   # 中间件 (认证、错误处理、日志)
│   │   ├── models/       # 数据模型层
│   │   ├── routes/       # 路由定义
│   │   ├── scripts/      # 数据库脚本
│   │   ├── utils/        # 工具函数
│   │   └── server.ts     # 服务入口
│   ├── database/     # 数据库初始化脚本
│   ├── dist/         # 编译输出
│   └── .env          # 环境变量配置
│
└── zhitu/            # 前端应用
    ├── src/
    │   ├── api/          # API 请求封装
    │   ├── components/   # 通用组件
    │   ├── pages/        # 页面组件
    │   ├── router/       # 路由配置
    │   ├── store/        # Redux 状态管理
    │   ├── styles/       # 全局样式
    │   ├── types/        # TypeScript 类型定义
    │   └── utils/        # 工具函数
    ├── dist/           # 构建输出
    └── .env.*          # 环境变量配置
```

## 技术栈

### 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | - | 运行时 |
| Express | ^4.18.2 | Web 框架 |
| TypeScript | ^5.0.0 | 类型安全 |
| MySQL2 | ^3.6.5 | 数据库驱动 |
| bcryptjs | ^2.4.3 | 密码加密 |
| jsonwebtoken | ^9.0.3 | JWT 认证 |
| multer | ^2.0.0 | 文件上传 |
| cors | ^2.8.5 | 跨域处理 |
| dotenv | ^16.3.1 | 环境变量 |

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | ^19.2.0 | UI 框架 |
| TypeScript | ~5.9.3 | 类型安全 |
| Vite | ^7.2.4 | 构建工具 |
| Ant Design | ^6.1.0 | UI 组件库 |
| Redux Toolkit | ^2.11.2 | 状态管理 |
| React Router | ^7.10.1 | 路由管理 |
| Axios | ^1.13.2 | HTTP 客户端 |
| Three.js | ^0.182.0 | 3D 图形 |
| React Three Fiber | ^9.4.2 | React 3D 渲染 |
| Less | ^4.5.1 | CSS 预处理器 |

## 开发命令

### 后端 (`backend/`)

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 编译 TypeScript
npm run build

# 生产环境运行
npm start

# 数据库初始化
npm run db:init    # 执行 database/init.sql
npm run db:seed    # 执行 database/seed.sql
```

### 前端 (`zhitu/`)

```bash
# 安装依赖
npm install

# 开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview

# 代码检查
npm run lint
```

## 数据库架构

使用 MySQL 数据库，主要表结构：

| 表名 | 说明 |
|------|------|
| `users` | 用户表 |
| `posts` | 帖子表 |
| `comments` | 评论表 |
| `likes` | 点赞表 |
| `favorites` | 收藏表 |
| `follows` | 关注表 |
| `chat_sessions` | 聊天会话表 |
| `chat_messages` | 聊天消息表 |

## 后端架构

采用 **MVC 架构模式**：

### 目录结构说明

- **`controllers/`** - 控制器层，处理 HTTP 请求和响应
  - `userController.ts` - 用户相关操作（登录、注册、获取信息）
  - `communityController.ts` - 社区功能（帖子、评论、点赞、收藏）
  - `chatController.ts` - 聊天功能

- **`models/`** - 数据模型层，封装数据库操作
  - 每个模型对应一张数据库表
  - 提供 CRUD 操作方法

- **`routes/`** - 路由层，定义 API 端点
  - `index.ts` - 路由入口，聚合所有子路由
  - `userRoutes.ts` - 用户路由
  - `communityRoutes.ts` - 社区路由
  - `chatRoutes.ts` - 聊天路由

- **`middleware/`** - 中间件
  - `authMiddleware.ts` - JWT 认证
  - `optionalAuthMiddleware.ts` - 可选认证
  - `errorHandler.ts` - 全局错误处理
  - `logger.ts` - 请求日志

- **`utils/`** - 工具函数
  - `db.ts` - 数据库连接池
  - `jwt.ts` - JWT 工具
  - `response.ts` - 统一响应格式

## 前端架构

### 目录结构说明

- **`pages/`** - 页面组件
  - `Layout/` - 布局组件（包含 Header、Footer）
  - `Welcome/` - 欢迎页
  - `Login/` - 登录页
  - `Path/` - 路径页
  - `Community/` - 社区页（含 DetailContent 详情）
  - `Chat/` - 聊天页（含 ChatId 会话）
  - `NotFound/` - 404 页

- **`components/`** - 通用组件
  - `ThemeToggle/` - 主题切换组件

- **`store/`** - Redux 状态管理
  - `index.ts` - Store 配置
  - `modules/userStore.ts` - 用户状态

- **`api/`** - API 请求封装
  - 按功能模块组织 API 调用

- **`types/`** - TypeScript 类型定义
  - `user.ts`, `community.ts`, `chat.ts`

- **`utils/`** - 工具函数
  - `http.ts` - Axios 实例配置
  - `store.ts` - 本地存储封装

### 路由配置

使用 React Router v7 的 `createBrowserRouter`：

```
/               -> Layout + Welcome (首页)
/path           -> Layout + Path (路径页)
/community      -> Layout + Community (社区列表)
/community/:id  -> Layout + DetailContent (帖子详情)
/chat           -> Layout + Chat (聊天列表)
/chat/:id       -> Layout + Chat + ChatId (聊天会话)
/login          -> Login (登录页)
*               -> NotFound (404)
```

## 代码风格指南

### TypeScript

- 启用严格模式 (`strict: true`)
- 使用路径别名 `@/` 指向 `src/`
- 类型定义放在 `types/` 目录

### 命名规范

- **组件**: PascalCase (如 `UserController.ts`)
- **文件/目录**: camelCase (如 `userStore.ts`)
- **CSS 模块**: `index.module.less`
- **常量**: UPPER_SNAKE_CASE

### 后端响应格式

统一使用 `ResponseUtil` 工具类：

```typescript
// 成功响应
ResponseUtil.success(message, data?)
ResponseUtil.login(token, message)
ResponseUtil.userInfo(userInfo, token, message)

// 错误响应
ResponseUtil.error(message)
```

### 前端状态管理

使用 Redux Toolkit 的 Slice 模式：

```typescript
const slice = createSlice({
  name: 'sliceName',
  initialState,
  reducers: { ... }
})
```

异步操作使用 Thunk：

```typescript
const fetchAction = (params) => async (dispatch: AppDispatch) => {
  const res = await apiCall(params)
  dispatch(sliceAction(res))
}
```

## 环境变量

### 后端 (`backend/.env`)

```bash
PORT=3000                           # 服务端口
NODE_ENV=development                # 环境模式
DB_HOST=localhost                   # 数据库主机
DB_PORT=3306                        # 数据库端口
DB_USER=root                        # 数据库用户
DB_PASSWORD=xxx                     # 数据库密码
DB_NAME=zhitu                       # 数据库名
JWT_SECRET=xxx                      # JWT 密钥
JWT_EXPIRES_IN=7d                   # JWT 过期时间
CORS_ORIGIN=http://localhost:5173   # CORS 允许来源
GLM_MODEL_FAST=xxx                  # AI 模型 API Key
```

### 前端 (`zhitu/.env.development`)

```bash
VITE_BASE_URL=/api    # API 基础路径（开发时代理到 localhost:3000）
```

## API 端点

### 用户相关

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | /api/user/login | 用户登录 | 否 |
| POST | /api/user/register | 用户注册 | 否 |
| GET | /api/user/info | 获取用户信息 | 是 |
| PUT | /api/user/info | 更新用户信息 | 是 |

### 社区相关

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | /api/community/posts | 获取帖子列表 | 可选 |
| GET | /api/community/posts/:id | 获取帖子详情 | 可选 |
| POST | /api/community/posts | 发布帖子 | 是 |
| POST | /api/community/posts/:id/like | 点赞/取消点赞 | 是 |
| POST | /api/community/posts/:id/favorite | 收藏/取消收藏 | 是 |
| POST | /api/community/posts/:id/comments | 发表评论 | 是 |
| GET | /api/community/posts/:id/comments | 获取评论列表 | 否 |
| POST | /api/community/follow/:userId | 关注/取消关注 | 是 |

### 聊天相关

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | /api/chat/sessions | 获取会话列表 | 是 |
| POST | /api/chat/sessions | 创建会话 | 是 |
| GET | /api/chat/sessions/:id/messages | 获取消息历史 | 是 |
| POST | /api/chat/sessions/:id/messages | 发送消息 | 是 |

## 测试账号

初始数据包含以下测试账号：

| 用户名 | 密码 | 说明 |
|--------|------|------|
| testuser | 123456 | 普通测试用户 |
| admin | admin123 | 管理员账号 |
| alice | 123456 | 测试用户 |
| bob | 123456 | 测试用户 |
| carol | 123456 | 测试用户 |

## 安全注意事项

1. **环境变量**: `.env` 文件包含敏感信息，已加入 `.gitignore`
2. **密码加密**: 使用 bcryptjs 进行密码哈希（salt rounds: 10）
3. **JWT 认证**: 所有敏感操作需要有效的 Bearer Token
4. **CORS**: 限制允许的源地址
5. **SQL 注入**: 使用参数化查询防止注入攻击

## 开发工作流

1. 启动 MySQL 数据库
2. 初始化数据库（执行 `init.sql` 和 `seed.sql`）
3. 启动后端服务：`cd backend && npm run dev`
4. 启动前端开发服务器：`cd zhitu && npm run dev`
5. 访问前端页面（默认 http://localhost:5173）

## 部署说明

1. **后端**: 编译后运行 `npm start`，监听端口 3000
2. **前端**: 构建后部署 `dist/` 目录内容
3. **代理**: 生产环境建议配置 Nginx 反向代理
4. **数据库**: 确保 MySQL 服务可访问

## 常见问题

### 数据库连接失败
- 检查 `.env` 中的数据库配置
- 确认 MySQL 服务已启动
- 验证数据库和用户权限

### 前端 API 请求失败
- 确认后端服务已启动
- 检查 Vite 代理配置
- 验证 CORS 设置

### 认证失败
- 检查 JWT_SECRET 配置
- 确认 Token 未过期
- 验证请求头格式：`Authorization: Bearer <token>`
