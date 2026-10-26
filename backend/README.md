# 知途后端系统

基于 Node.js + Express + TypeScript + MySQL 的后端 API 服务，采用 MVC 架构和 RESTful 设计风格。

## 技术栈

- **Node.js** - 运行时环境
- **Express** - Web 框架
- **TypeScript** - 提供类型安全
- **MySQL** - 关系型数据库
- **JWT** - 用户认证
- **bcryptjs** - 密码加密

## 项目结构

```text
backend/
|-- src/
|   |-- controllers/      # 控制器层
|   |-- middleware/       # 中间件
|   |-- models/           # 数据模型
|   |-- routes/           # 路由定义
|   |-- scripts/          # 脚本工具
|   |-- utils/            # 通用工具
|   `-- server.ts         # 服务入口
|-- database/             # 数据库脚本
|-- uploads/              # 上传文件目录
|-- package.json
`-- tsconfig.json
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

首次配置时将 `.env.example` 复制为 `.env`（PowerShell：`Copy-Item .env.example .env`），然后填写数据库、JWT、Redis 以及模型提供商相关配置。已有 `.env` 时保留原文件和原密钥，不覆盖。模板不包含真实密钥；新环境应填写独立随机密钥。

`.env`、`node_modules/`、`dist/` 和用户上传目录 `uploads/` 均不入库。

常见数据库配置如下：

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=zhitu
```

### 3. 初始化数据库

请参考 [DATABASE_SETUP.md](./DATABASE_SETUP.md) 完成数据库初始化。

以下初始化和种子数据命令只用于新建开发数据库；已有数据库不要重复导入。

快速命令如下：

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS zhitu CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p zhitu < database/init.sql
mysql -u root -p zhitu < database/seed.sql
```

### 4. 启动服务

开发模式：

```bash
npm run dev
```

生产模式：

```bash
npm run build
npm start
```

使用本仓库 `.env.example` 时，服务运行在 `http://localhost:4000`，与前端开发代理一致；未设置 `PORT` 时源码回退到 `3000`。

## API 示例

### 用户接口

登录：

```http
POST /api/user/login
Content-Type: application/json

{
  "username": "testuser",
  "password": "123456"
}
```

注册：

```http
POST /api/user/register
Content-Type: application/json

{
  "username": "newuser",
  "password": "123456",
  "mobile": "13800138000"
}
```

获取用户信息：

```http
GET /api/user/info
Authorization: Bearer <token>
```

### 社区接口

获取帖子列表：

```http
GET /api/community/list
```

搜索帖子：

```http
GET /api/community/search?keyword=学习
```

分页获取帖子：

```http
GET /api/community/page?pageNum=1&pageSize=10
```

创建帖子：

```http
POST /api/community/post
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "分享我的学习心得...",
  "photo": "https://example.com/image.jpg"
}
```

### 聊天接口

发起对话流式调用：

```http
POST /api/chat/call
Authorization: Bearer <token>
Content-Type: application/json

{
  "mode": 0,
  "userMessage": "你好",
  "session_id": 1
}
```

## 测试账号

| 用户名 | 密码 |
|--------|------|
| testuser | 123456 |
| admin | admin123 |

## 数据库说明

主要表包括：

- `users` - 用户表
- `posts` - 帖子表
- `comments` - 评论表
- `likes` - 点赞表
- `favorites` - 收藏表
- `follows` - 关注表
- `chat_sessions` - 对话会话表
- `chat_messages` - 对话消息表

详细表结构请查看 `database/init.sql`。

## 开发说明

新增接口的一般流程：

1. 在 `src/models` 中编写或更新数据模型
2. 在 `src/controllers` 中添加控制器方法
3. 在 `src/routes` 中注册路由
4. 根据需要接入认证或其他中间件

统一错误响应格式：

```json
{
  "message": "错误描述"
}
```

统一成功响应格式：

```json
{
  "message": "操作成功",
  "data": {},
  "token": "..."
}
```

## License

MIT
