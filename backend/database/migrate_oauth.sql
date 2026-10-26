-- 知途数据库迁移: 添加 OAuth 支持
-- 在现有数据库上执行

USE zhitu;

-- 1. users 表新增 email 字段，password 改为可空，avatar 改为 TEXT
ALTER TABLE users
  ADD COLUMN email VARCHAR(255) DEFAULT NULL UNIQUE COMMENT '邮箱' AFTER username,
  MODIFY COLUMN password VARCHAR(255) DEFAULT '' COMMENT '密码(bcrypt加密)',
  MODIFY COLUMN avatar TEXT DEFAULT NULL COMMENT '头像URL';

-- 2. 新增 oauth_accounts 表
CREATE TABLE IF NOT EXISTS oauth_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL COMMENT '关联用户ID',
    provider VARCHAR(20) NOT NULL COMMENT '提供商: github / google',
    provider_user_id VARCHAR(100) NOT NULL COMMENT '第三方用户ID',
    email VARCHAR(255) DEFAULT '' COMMENT '第三方邮箱',
    avatar_url VARCHAR(500) DEFAULT '' COMMENT '第三方头像',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uniq_provider_uid (provider, provider_user_id),
    UNIQUE KEY uniq_user_provider (user_id, provider),
    CONSTRAINT fk_oauth_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='OAuth账号绑定表';
