# Verification

Status: passed（代码验证）。

# 最新 main 接入验证（2026-11-12）

- 基线：main @ 261f31dada303c9b0f9734ffc7b00b301fd832b7；交付分支 codex/job-application。前端归属 zhitu/，服务及数据归属 backend/。
- zhitu 的 npm run build、backend 的 npm run build、岗位库 catalog:typecheck 通过；沿用主站原有大包体提示。
- 新增模块前端、配置和测试 ESLint 通过。原主站 53 项 Node 单元测试通过。
- 81 项合成 Playwright 回归全部通过：Moka/飞书/北森表单、账号简历隔离、BOSS 导航状态、官网筛选分页、并发链接读取、手机布局及 Vite 服务端文件隔离；新增 main 集成验证覆盖 5174 来源连接、云端加载等待、账号切换隔离与深色主题。
- 测试桩补充明确类型后，导航和目录查询的 9 项针对性复测通过；其余改动仅为可擦除的测试类型声明和未使用导入清理。
- Linux 物理文件系统中的岗位库原生测试：144 通过、0 失败、5 项专用数据库用例按配置跳过。使用同一源码及锁定依赖；未放宽超时或数据库限制。
- XLSX 解析实测依赖目录 198 个（上限 256），路径校验、符号链接拒绝、文件权限、压缩包边界回归通过。
- 邮件服务 12 项合成测试通过，包括 localhost/127.0.0.1:5174 来源。
- 迁入时发现 Git 换行转换破坏审核数据的字节校验：已证明仅为换行差异，恢复原审核文件字节，保留既有批准校验值，并对审核文件和公开数据导出设置 -text。修复后全量岗位库测试通过。
- 数据清单包含 100 岗/40 企业 JSON、对应 Excel 及 104 岗公开快照；manifest 的字节数和 SHA-256 另在暂存审计中逐项核对。
- 主站主题提供器、知识图谱、Redux 云端存储和 backend/src 不作修改；简历投影使用现有 loaded/loadRequestId 和账号归属。
- 未执行真实平台投递、聊天发送、SMTP、数据库写入或生产部署；原 Python/Vue 独立应用完整 E2E 未重跑。

依赖、生成的 Prisma Client、运行数据、凭据与构建产物不入库。真实服务运行前须按 README 准备 PostgreSQL、Prisma Client 及邮箱配置。逐文件来源见 fileMap.json；sha256 为对应 Git blob 的 SHA-256。

上传阶段还将核对远端 parent/tree；上传回执由会话记录，不能用本文件代替远端核验。
