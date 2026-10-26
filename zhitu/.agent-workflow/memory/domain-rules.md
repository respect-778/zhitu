# Domain rules

- 网站亮暗主题与简历内容的主题色是独立设置，不互相覆盖。
- 保留 `localStorage` 的 `data-theme` 键，值为 `default`、`dark` 或 `system`。
- 跟随系统时 HTML 属性记录解析后的亮暗值，存储仍保留 `system`。
- 新功能分支从 `dev` 创建。
- UI 验证不得调用真实 AI 配置提交，不得保存测试简历或更改数据库。
