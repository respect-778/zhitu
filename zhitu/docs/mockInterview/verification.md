# 最新 main 接入验证（2026-11-12）

- 基线：main @ 261f31dada303c9b0f9734ffc7b00b301fd832b7；交付分支 codex/mock-interview。前端归属 zhitu/，独立服务归属 backend/services/mockInterview/。
- zhitu 的 npm run build 与新增官网入口/测试 ESLint 通过；沿用主站原有大包体提示。入口使用原登录保护、AppThemeProvider 与 5174/4100 设置。
- 3 项合成 Playwright 接入测试通过：健康检查后显示同源面试页、服务失败可重试、原登录保护。
- 迁入后的 Next.js 源码 npm run typecheck 通过；9 个测试文件、28 项测试通过。核验复用本机已有且版本一致的依赖目录，依赖链接不上传。未执行独立 Next.js 生产构建。
- 迁入后的 Python 源码完整运行 python -X utf8 -m pytest -q：260 通过、3 跳过、0 失败（164.74 秒）。使用本机原虚拟环境执行新路径源码；依赖目录不上传。
- 主站知识图谱、简历云端同步、主题提供器与 backend/src 保持 main 实现；官网启动器默认回跳地址已从旧 5186 适配为 localhost:5174。
- 原项目许可证、NOTICE、数据库迁移及共享契约保留；逐文件来源见 fileMap.json，sha256 为对应 Git blob 的 SHA-256。
- 未调用真实模型、语音服务或操作真实面试记录；需配置 LiveKit、模型等参数后才可执行真实语音面试。本次不宣称真实服务的端到端验收完成。

不上传 .env、私人简历、会话库、录音、真实报告、依赖与构建缓存。
