# 岗位库开发现状

## 2026-11-11 当前进度

T01–T09及本地检查点A已验收，历史复审中断经本轮独立review闭合。100条已审企业官网实习岗已导入，40企业、每家最多5岗，24条明确数字届数。API和当前页面回读一致，缺失字段统一显示“未知”。本地官网为http://127.0.0.1:5186/applications?source=catalog，合计104条已发布。

T10已验收，包含原始附件CAS存储、数据库元数据和引用、受限子进程文字PDF/XLSX解析及离线check/store入口。中文文字与坐标、跨页/续行、合并主格、ZIP展开和矩形预算、子进程结果契约、重复导入与观察时间均已验证。源码最长222行，解析与存储分别归属各自owner。

主方案第7.5节与todo共同验收已纳入本次官网采集注意事项。最终完整catalog149项中141通过、8环境跳过，真实DB1/1、Linux受限解析16/16通过。CLI正常入口两次同文件和引用，合成DB元数据已精确清理，原文件保留作证据。本地岗位仍106条、已发布104条，原100条输入hash保持一致。

依赖使用固定ExcelJS4.4.0、PDF.js6.5.438、saxes5.0.1，uuid override11.1.1已在实际安装树和锁中核对。项目要求npm>=11.18.0以支持工作区override。新增依赖链已知告警0，主项目原有8条审计告警继续记录在dependency-security.md，部署验收时按主方案安全要求闭合。

下一步为T11人社官网公告与多岗位拆分，将岗位编号、附件行、共同条件和报名方式关联入现有岗位链路。实现、review及验收见outputs/catalog-mainline-next-2026-11-11/checkpoint.md和T10-verification.json。

以下内容保留2026-11-09初始核对记录。

核对日期为 2026-11-09，执行依据为根 AGENTS.md、交接方案和任务清单。

## 工程与代码归属

- 根目录为 D:/knownai，Node 实测 v24.12.0，现有两个 npm workspaces 为 website/frontend 和 ai-resume-optimization。
- /applications 由 consumer/src/routes.tsx 提供，JobSearch.tsx 的轮询、详情及外链均依赖 BOSS 扩展语义。新增数据库模式需要独立客户端和展示映射。
- consumer/src/model.ts 的 jobLink 仅接受 BOSS 详情地址。官网来源链接需要独立校验。
- ai-job-application 是独立 Git 仓库，根 .gitignore 忽略整个目录。catalog 的代码归属该子仓库，根 workspace 配置归属根仓库。已有根目录迁移变更及子仓库修改均列入 Git 基线。
- 新增 catalog 目录前未发现已有岗位库 workspace 或共享搜索 API。
- 5186 正由 PID 52984 监听。5197、5198、5432、55432 在初次检查时没有监听记录，实际启动前再次检查。

## 环境与验证边界

- PostgreSQL 命令行工具未出现在 PATH，专属岗位数据库待建立。
- Docker 客户端已安装，首次 docker info 报 Linux engine 命名管道不存在。已请求启动 Docker Desktop，隔离运行能力待验证。
- Semgrep、GuardDog、OSV-Scanner、Gitleaks 未出现在 PATH，扫描工具的来源核验、安装和实际扫描待执行。
- 小橙子生产数据库类型、连接、容量及备份状态仍待核实。首版数据库测试使用专属本地实例。
- 存量技能备份位于 D:/Skills安全备份/2026-11-08。当前安全依据为 plan.md 第 3.5 节与 code-review-and-quality 工作流。

## 首批来源

腾讯招聘列表接口在本机返回有效 JSON，Code 为 200，reportedTotal 为 2191。本轮请求 pageSize 为 2，仅证明这两条样本可读取。样本包含产品运营和技术岗位，PostId 为字符串，LastUpdateTime 作为来源更新时间处理。

人社部公告选作附件结构研究样本，官方页面的搜索索引缓存列有两个 XLSX 附件，观察记录见 mohrss-index-observation.json。已记录标题、发布时间、单位范围、报名入口和可用字段，附件实际内容待核对。本机请求返回 JavaScript 验证页面，自动接入状态记为受阻。深圳人社备用入口发生 TLS 握手错误，接入能力待验证。

证据位于 outputs/job-catalog-handoff-2026-11-08/evidence/2026-11-09，路径相对根工程。Git 基线、抓取 URL、响应类型和哈希分别记录在 git-baseline.json 与 fetch-report.json。

## 执行边界

TDD 模式为 off。使用计划明确要求的回归测试验证字段、分页、链接与失败行为。每个 T 任务完成验证后进入独立 review，发现重要问题后修复复验。当前根索引包含大量先前迁移变更，提交操作需只涵盖可识别的本任务内容。
