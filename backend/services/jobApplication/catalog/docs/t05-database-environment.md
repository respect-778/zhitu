# T05 专属数据库验证环境

2026-11-09，root 建立。仅用于本地合成数据验证，尚非生产配置。

- 容器：`knowvia-catalog-db-20261109`；专属卷：`knowvia-catalog-pg-20261109`。
- PostgreSQL 18.6，官方镜像固定为 `postgres@sha256:f1ea2a1a4fb7b68d4836be1fdcb8a6466a89b072158bf9d97663600538c294c5`。
- 独立 internal 网络：`knowvia-catalog-test-20261109`，数据库别名 `catalog-db:5432`。创建参数仅允许宿主 `127.0.0.1:55432`，但 2026-11-09 复查时 Docker 的实际 `NetworkSettings.Ports` 为空；不能据此宣称宿主端口已可连接。已完成的数据库验证全部使用 internal 网络内的 `catalog-db:5432`。宿主连接方式尚需另行验证，当前不开放额外网络来绕过这一隔离边界。
- 数据库：`knowvia_catalog_test`、`knowvia_catalog_restore`，业务 schema 为 `catalog`。初始化不连接或修改其他已有容器和库。
- UID/GID 999，根文件系统只读、cap-drop ALL、no-new-privileges；512 MiB 内存且不额外 swap、1 CPU、128 PID。仅专属数据卷、临时 socket／tmp 目录可写。
- 每个角色独立随机测试密码。文件位于证据目录 `db-runtime/private`，Windows ACL 限当前用户与 SYSTEM；不提交密码、连接串、原始容器环境或真实业务配置。

`catalog_migrator` 拥有 catalog schema；writer 仅获该 schema 表的 SELECT/INSERT/UPDATE/DELETE，reader 仅 SELECT。三者均没有超级用户、CREATEDB、CREATEROLE 或管理员数据库 CONNECT 权限；writer/reader 无 schema CREATE。权限证据在 `db-runtime/initial-role-check.txt`。初始化管理账号只供这台专属测试实例使用，不交给应用进程。

迁移和恢复完成后，显式执行 `REVOKE ALL ON TABLE catalog._prisma_migrations FROM catalog_writer,catalog_reader`，使默认业务表授权不会覆盖迁移元数据。实际确认 writer 能读写岗位、reader 只能读取岗位，二者均不能读取或修改迁移记录。恢复库中的 reader 写入尝试和迁移记录查询都以 SQLSTATE 42501 被拒绝。

TCP 身份验证为 SCRAM-SHA-256。容器内 socket 仅用于受信初始化／测试管理，应用容器没有挂载 socket 或数据卷。本地隔离连接不使用 TLS，远程生产连接必须另行配置、审查与验证。

官方镜像入口脚本已静态阅读，SHA256 为 `9c440299ae04a0a79d55b8bf03307036d890a40979d2fb698073c9050d4b20a5`。它会读取 POSTGRES_*、准备数据目录、执行 initdb 和受信初始化目录中的 SQL／脚本，随后启动 postgres；初始化参数含 eval 路径，因此只传固定的本项目参数，初始化目录仅含本次生成的 SQL。没有网络下载逻辑。没有将原生 PostgreSQL 或基础镜像所有系统包声称为逐行已审或经 npm 漏洞库扫描。

版本选择参考 [PostgreSQL 官方 18.6 修复公告](https://www.postgresql.org/about/news/postgresql-186-1711-1615-1519-1424-and-19-beta-3-released-3365/)。镜像摘要证明所运行的固定发布内容，不能替代运行权限、应用输入和后续漏洞复核。

公开验证收据位于 `D:/knownai/outputs/job-catalog-handoff-2026-11-08/evidence/2026-11-09/db-runtime`。备份恢复和应用读写结果在完成后由 T05 review 记录引用。
