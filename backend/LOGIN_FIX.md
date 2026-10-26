# 登录问题修复说明

## 问题描述

用户即使输入正确的用户名和密码，后端仍然返回 `401 Unauthorized`。

## 问题原因

初始化数据中的密码哈希值不正确，导致 `bcrypt` 校验失败。

具体表现为：

- 初始哈希并不是根据当前测试账号密码生成的
- `123456` 和 `admin123` 无法通过实际的 bcrypt 比对

## 解决方案

项目中新增并执行了密码更新脚本 `src/scripts/updatePasswords.ts`，为测试账号重新生成了正确的 bcrypt 哈希。

示意代码如下：

```typescript
const hash123456 = await bcrypt.hash('123456', 10);
const hashAdmin123 = await bcrypt.hash('admin123', 10);

UPDATE users SET password = ? WHERE username IN ('testuser', 'alice', 'bob', 'carol');
UPDATE users SET password = ? WHERE username = 'admin';
```

## 修复后的测试账号

| 用户名 | 密码 | 状态 |
|--------|------|------|
| testuser | 123456 | 可用 |
| admin | admin123 | 可用 |
| alice | 123456 | 可用 |
| bob | 123456 | 可用 |
| carol | 123456 | 可用 |

## 验证步骤

可以通过下面的请求验证登录是否恢复正常：

```bash
curl -X POST http://localhost:3000/api/user/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"123456"}'
```

预期响应：

```json
{
  "message": "登录成功",
  "token": "eyJhbGc..."
}
```

## 相关文件

- [updatePasswords.ts](./src/scripts/updatePasswords.ts)
- [userController.ts](./src/controllers/userController.ts)
- [User.ts](./src/models/User.ts)
