-- 知途数据库种子数据

USE zhitu;

-- 测试用户（密码均为示例加密值）
INSERT INTO users (username, password, mobile, gender, birthday, degree, avatar) VALUES
('testuser', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '13800138000', 1, '1995-06-15', '本科', 'https://api.dicebear.com/7.x/avataaars/svg?seed=testuser'),
('admin', '$2a$10$8Z3.3Qz3gXqLJk4xVJXxo.OBBhM6yR2F8wFp9F0QjPs.RKOc2mZjO', '13900139000', 1, '1990-01-01', '硕士', 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin'),
('alice', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '13700137000', 2, '1998-03-20', '本科', 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice'),
('bob', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '13600136000', 1, '1997-08-10', '专科', 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob'),
('carol', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '13500135000', 2, '1999-12-05', '硕士', 'https://api.dicebear.com/7.x/avataaars/svg?seed=carol');

-- 示例帖子
INSERT INTO posts (user_id, title, content, photo, likes_count, comments_count, favorites_count, pageviews_count) VALUES
(1, 'TypeScript 高级类型学习', '今天学习了 TypeScript 的高级类型，感觉非常有用！大家有什么好的学习资料推荐吗？', 'https://images.unsplash.com/photo-1516116216624-53e697fedbea?w=400', 15, 8, 5, 120),
(2, '番茄工作法分享', '分享一个学习技巧：番茄工作法真的很有效，25分钟专注学习 + 5分钟休息，效率提升了很多。', '', 23, 12, 10, 190),
(3, 'React 项目复盘', '刚刚完成了一个 React 项目，用到了 Hooks 和 Context API，代码质量提升了不少。', 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=400', 31, 15, 18, 260),
(1, '好书推荐：深入浅出 Node.js', '推荐一本好书《深入浅出 Node.js》，对理解 Node.js 原理很有帮助。', '', 19, 6, 8, 150),
(4, '动态规划求助', '今天学习算法遇到了难题，动态规划真的好难啊...有没有人能分享一下学习经验？', '', 8, 20, 3, 95),
(5, 'Canvas 动画笔记', '分享我的学习笔记：如何用 Canvas 绘制动画效果。', 'https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?w=400', 27, 9, 14, 205),
(2, '微服务学习心得', '最近在学习微服务架构，感觉打开了新世界的大门！', '', 12, 5, 7, 110),
(3, 'VS Code 插件推荐', '给大家推荐一个 VS Code 插件：GitHub Copilot，编程效率大大提升！', 'https://images.unsplash.com/photo-1618477388954-7852f32655ec?w=400', 42, 18, 25, 320),
(4, '坚持 Coding 的力量', '学习心得：每天坚持 coding 2 小时，一个月后你会感谢自己的。', '', 35, 22, 19, 280),
(5, '技术难关突破', '刚刚突破了一个技术难关，感觉特别有成就感！坚持就是胜利！', '', 28, 11, 9, 210);

-- 评论
INSERT INTO comments (post_id, user_id, content) VALUES
(1, 2, 'TypeScript 官方文档就很不错。'),
(1, 3, '推荐看《TypeScript Deep Dive》。'),
(2, 1, '我也在用番茄工作法，确实很有效！'),
(3, 2, '项目能分享一下吗？想学习学习。'),
(3, 4, '用 Hooks 写代码真的很爽。'),
(4, 5, '这本书我也看过，写得很好。'),
(5, 1, '多刷题，多总结，慢慢就会了。'),
(5, 2, '推荐 LeetCode 的动态规划专题。'),
(6, 3, '笔记在哪里可以看到？'),
(8, 1, 'Copilot 确实好用，但也要注意代码质量。');

-- 点赞
INSERT INTO likes (post_id, user_id) VALUES
(1, 2), (1, 3), (1, 4),
(2, 1), (2, 3), (2, 5),
(3, 1), (3, 2), (3, 4), (3, 5),
(4, 2), (4, 3),
(5, 1), (5, 3),
(6, 1), (6, 2), (6, 4),
(8, 1), (8, 2), (8, 3), (8, 5),
(9, 1), (9, 2), (9, 3),
(10, 1), (10, 4);

-- 收藏
INSERT INTO favorites (post_id, user_id) VALUES
(1, 2), (1, 4),
(2, 1), (2, 5),
(3, 1), (3, 2), (3, 5),
(4, 3),
(6, 1), (6, 3),
(8, 1), (8, 2), (8, 4),
(9, 2), (9, 5);

-- 关注关系
INSERT INTO follows (follower_id, following_id) VALUES
(1, 2), (1, 3),
(2, 1), (2, 3), (2, 4),
(3, 1), (3, 2),
(4, 1), (4, 2), (4, 3),
(5, 1), (5, 2), (5, 3), (5, 4);
