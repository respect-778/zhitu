# 知途后端系统 - 数据库初始化指南

## 前提条件

请确保已经安装 MySQL，并且数据库服务正在运行。

## 初始化步骤

### 1. 创建数据库

先连接到 MySQL：

```bash
mysql -u root -p
```

然后执行：

```sql
CREATE DATABASE IF NOT EXISTS zhitu CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;
```

### 2. 初始化表结构

在 `backend` 目录下执行：

```bash
mysql -u root -p zhitu < database/init.sql
```

执行过程中输入你的数据库密码即可。

### 3. 导入初始数据

```bash
mysql -u root -p zhitu < database/seed.sql
```

### 4. 验证数据

登录 MySQL：

```bash
mysql -u root -p zhitu
```

执行以下语句检查表和数据：

```sql
-- 查看所有表
SHOW TABLES;

-- 查看用户数据
SELECT id, username, mobile FROM users;

-- 查看帖子数据
SELECT id, content, likes_count, comments_count FROM posts LIMIT 5;

-- 退出
EXIT;
```

## 测试账号

初始数据中包含以下测试账号：

| 用户名 | 密码 | 说明 |
|--------|------|------|
| testuser | 123456 | 普通测试用户 |
| admin | admin123 | 管理员账号 |
| alice | 123456 | 测试用户 |
| bob | 123456 | 测试用户 |
| carol | 123456 | 测试用户 |

## 常见问题

### 问题 1：密码认证失败

如果遇到 `Access denied` 错误，请确认：

- MySQL root 密码是否正确
- 当前账号是否有权限访问数据库

### 问题 2：字符集问题

请确认数据库使用的是 `utf8mb4`：

```sql
ALTER DATABASE zhitu CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 问题 3：外键约束错误

如果需要重新初始化，可以先删除并重建数据库：

```sql
DROP DATABASE IF EXISTS zhitu;
CREATE DATABASE zhitu CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

然后重新执行初始化脚本。
