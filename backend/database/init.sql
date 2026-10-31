-- 知途数据库初始化脚本

USE zhitu;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE COMMENT '用户名',
    password VARCHAR(255) DEFAULT '' COMMENT '密码(bcrypt加密)',
    email VARCHAR(255) DEFAULT NULL UNIQUE COMMENT '邮箱',
    mobile VARCHAR(20) DEFAULT '' COMMENT '手机号',
    gender TINYINT DEFAULT 0 COMMENT '性别: 0-未知, 1-男, 2-女',
    birthday DATE DEFAULT NULL COMMENT '生日',
    degree VARCHAR(50) DEFAULT '' COMMENT '学历',
    art_count INT NOT NULL DEFAULT 0 COMMENT '原创文章数',
    avatar TEXT DEFAULT NULL COMMENT '头像URL',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_username (username),
    INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- OAuth 第三方账号绑定表
CREATE TABLE IF NOT EXISTS oauth_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL COMMENT '关联用户ID',
    provider VARCHAR(20) NOT NULL COMMENT '提供商: github / google',
    provider_user_id VARCHAR(100) NOT NULL COMMENT '第三方用户ID',
    email VARCHAR(255) DEFAULT '' COMMENT '第三方邮箱',
    avatar_url TEXT DEFAULT NULL COMMENT '第三方头像',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uniq_provider_uid (provider, provider_user_id),
    UNIQUE KEY uniq_user_provider (user_id, provider),
    CONSTRAINT fk_oauth_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='OAuth账号绑定表';

-- 帖子表
CREATE TABLE IF NOT EXISTS posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL COMMENT '用户ID',
    title VARCHAR(200) DEFAULT '' COMMENT '帖子标题',
    content TEXT NOT NULL COMMENT '帖子内容',
    cover VARCHAR(500) DEFAULT '' COMMENT '封面URL',
    `abstract` VARCHAR(300) DEFAULT '' COMMENT '文章摘要',
    photo VARCHAR(500) DEFAULT '' COMMENT '图片URL',
    video VARCHAR(500) DEFAULT '' COMMENT '视频URL',
    link VARCHAR(500) DEFAULT '' COMMENT '链接URL',
    likes_count INT DEFAULT 0 COMMENT '点赞数',
    comments_count INT DEFAULT 0 COMMENT '评论数',
    favorites_count INT DEFAULT 0 COMMENT '收藏数',
    pageviews_count INT DEFAULT 0 COMMENT '浏览量',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at),
    INDEX idx_hot_sort (likes_count, favorites_count, pageviews_count)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='帖子表';

-- 评论表
CREATE TABLE IF NOT EXISTS comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT NOT NULL COMMENT '帖子ID',
    user_id INT NOT NULL COMMENT '用户ID',
    content TEXT NOT NULL COMMENT '评论内容',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_post_id (post_id),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='评论表';

-- 点赞表
CREATE TABLE IF NOT EXISTS likes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT NOT NULL COMMENT '帖子ID',
    user_id INT NOT NULL COMMENT '用户ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_post_user (post_id, user_id),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='点赞表';

-- 收藏表
CREATE TABLE IF NOT EXISTS favorites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT NOT NULL COMMENT '帖子ID',
    user_id INT NOT NULL COMMENT '用户ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_post_user (post_id, user_id),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='收藏表';

-- 关注表
CREATE TABLE IF NOT EXISTS follows (
    id INT AUTO_INCREMENT PRIMARY KEY,
    follower_id INT NOT NULL COMMENT '关注者ID',
    following_id INT NOT NULL COMMENT '被关注者ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_follower_following (follower_id, following_id),
    INDEX idx_following_id (following_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='关注表';

-- AI 聊天会话表
CREATE TABLE IF NOT EXISTS ai_chat_session (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uuid CHAR(36) NOT NULL UNIQUE COMMENT '对外使用的会话 UUID',
    user_id INT NOT NULL COMMENT '用户ID',
    session_title VARCHAR(255) NOT NULL DEFAULT '' COMMENT '会话标题',
    scene_type VARCHAR(50) NOT NULL DEFAULT 'chat' COMMENT '会话场景',
    source_id INT DEFAULT NULL COMMENT '场景关联资源ID',
    history_summary LONGTEXT DEFAULT NULL COMMENT '压缩后的历史摘要',
    summary_up_to_id BIGINT UNSIGNED DEFAULT NULL COMMENT '摘要覆盖到的消息ID',
    is_deleted TINYINT NOT NULL DEFAULT 0 COMMENT '是否已删除',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_chat_session_user_updated (user_id, updated_at),
    INDEX idx_chat_session_scene_source (user_id, scene_type, source_id),
    CONSTRAINT fk_chat_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI聊天会话表';

-- AI 聊天消息表
CREATE TABLE IF NOT EXISTS ai_chat_message (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL COMMENT '会话ID',
    role VARCHAR(20) NOT NULL COMMENT '消息角色: user / ai',
    content LONGTEXT NOT NULL COMMENT '消息正文',
    reasoning_content LONGTEXT DEFAULT NULL COMMENT '模型推理内容',
    content_type VARCHAR(20) NOT NULL DEFAULT 'text' COMMENT '内容类型: text / voice',
    audio_url TEXT DEFAULT NULL COMMENT '语音地址',
    thinking_mode TINYINT NOT NULL DEFAULT 0 COMMENT '是否启用深度思考',
    token_usage INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Token 使用量',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_chat_message_session_created (session_id, created_at, id),
    CONSTRAINT fk_chat_message_session FOREIGN KEY (session_id) REFERENCES ai_chat_session(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI聊天消息表';

-- 成长规划工作区表
CREATE TABLE IF NOT EXISTS growth_workspace (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE COMMENT '用户ID',
    data JSON NOT NULL COMMENT '工作区数据(文件/标签页/状态等)',
    revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    CONSTRAINT fk_growth_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='成长规划工作区';

-- 用户简历正式版本，与浏览器缓存和电脑目录副本独立。
CREATE TABLE IF NOT EXISTS resume_workspace (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    data JSON NOT NULL,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
