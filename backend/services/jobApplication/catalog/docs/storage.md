# T05 专属岗位库

数据库模型目前只有 `catalog.sources` 与 `catalog.jobs`。来源含固定 scopeKey、adapter、kind；已登记 sourceId 不能无声改绑到其他范围或适配器。岗位以 `(source_id, source_job_id)` 唯一，内部 UUID 由 PostgreSQL 生成。公司名和标题不参与唯一性。同一来源的事务写入串行化，数据库唯一约束仍作为最后防线。

`upsertJob(client, source, job)` 先通过共享运行时契约，再在同一事务中登记来源和写入岗位。重复写入保持内部 UUID，保留最早 firstSeenAt，晚到的旧 lastSeenAt 快照不覆盖新数据。全部字段构成一份完整快照；**T07 负责部分字段合并，调用本函数前不能把“本次未读到”转换成覆盖已有可靠字段的 null**。本阶段没有自动采集、发布策略或删除接口。

筛选字段使用独立列；来源日期以 JSON 保留 raw/value/precision/timezone，不用系统时间补日期。薪资原文、标准薪资 JSON 和 evidence 分开保存。数据库 CHECK 保护关键状态、身份、来源证据及字段关系；完整 JSON 字段结构仍由共享契约校验。后续生成迁移须保留手写 CHECK，Prisma schema 尚不能完整表示它们。

## 连接与权限

当前仅支持以下显式配置。没有读取 `.env` 或默认 DATABASE_URL 的代码。

| 配置 | 允许值 |
| --- | --- |
| CATALOG_DATABASE_ENDPOINT | `local` 或 `container` |
| local 地址 | `127.0.0.1:55432` |
| container 地址 | 隔离 Docker 网络内 `catalog-db:5432` |
| 数据库 | `knowvia_catalog_test`、`knowvia_catalog_restore` |
| 运行读取角色 | `catalog_reader` |
| 运行写入角色 | `catalog_writer` |
| 迁移角色 | `catalog_migrator` |

`CATALOG_DATABASE_URL` 必须是完整 `postgresql://角色:密码@地址:端口/库名`。拒绝 URL 查询参数、fragment、空密码、环境中的 PG 前缀变量及其他地址/库/角色。运行客户端还拒绝 DEBUG、NODE_OPTIONS、NODE_PG_FORCE_NATIVE，并检查真实进程环境，不能用传入的配置对象掩盖环境覆盖。pg 仅收到逐项显式配置，不能通过 sslcert、sslkey、sslrootcert、socket 或 pgpass 引入文件读取。固定关闭 TLS 只适用于此受限本地/隔离环境；生产 TLS 与可信地址配置需要另行实现和审查。

运行连接池最多 4 个连接，连接/SQL/锁/空闲事务均有超时。迁移配置在验证输入后只添加可信的 `?schema=catalog`，保证 `_prisma_migrations` 也落在 catalog，不允许用户以查询参数覆盖。

初始化由独立管理流程完成：创建专属库和 catalog schema，schema owner 为 migrator；writer 只授予 catalog 的 SELECT/INSERT/UPDATE/DELETE，reader 只授予 SELECT。三者均无超级用户、CREATEDB、CREATEROLE 权限，撤销 public schema 的 CREATE 权限。新表的默认授权属于 migrator。现有业务数据库不属于此初始化目标。

首次迁移及备份恢复后，由 migrator 撤销应用角色对迁移元数据的访问：`REVOKE ALL ON TABLE catalog._prisma_migrations FROM catalog_writer,catalog_reader;`。业务表的默认授权不应让应用角色修改迁移历史。

业务迁移只在预建的 catalog schema 内创建表和索引，不负责创建 schema，也不授予 migrator 数据库级 CREATE 权限。已在 PostgreSQL 18.6 实际复现：`CREATE SCHEMA IF NOT EXISTS catalog` 即使目标已存在，仍会先检查数据库 CREATE 权限；因此初始迁移不包含该语句。缺失 schema 或 owner 配置错误应修复初始化流程，不通过提升迁移账号权限绕过。

## 生成、迁移与验证

在新增依赖审查通过后，从准备好的 Linux x64 隔离容器调用对应 workspace 命令（由根 package 统一维护）。Windows 直接调用 CLI 入口会清晰失败，不尝试下载 Windows 引擎；Windows 上的纯配置测试与纯 JS 存储客户端不受此 CLI 平台边界影响。只使用已锁定本地 Prisma CLI，避免 `npx` 自动下载其他版本。

```text
npm run db:generate --workspace=@knowvia/job-catalog
npm run db:validate --workspace=@knowvia/job-catalog
npm run db:migrate --workspace=@knowvia/job-catalog
npm run db:status --workspace=@knowvia/job-catalog
npm run db:test --workspace=@knowvia/job-catalog
```

四个 CLI 命令只经过 `src/storage/prisma-cli.ts`，不转交任意用户参数。固定 Prisma 7.10.1，schema engine 必须只读挂载为 `/review-tools/schema-engine`，大小 23,516,472 bytes、SHA256 `7116e00278a793ee13db6f0a732c1aaec10f795a37bc02e3a7df3b06b2f1311f`。CLI 的子进程环境采用白名单，强制 CHECKPOINT_DISABLE/CI/PRISMA_HIDE_UPDATE_MESSAGE，移除代理、调试、Node 和引擎镜像覆盖，stdin 不可交互。原始第三方输出可能包含诊断信息，入口只输出固定 JSON 结果；失败的诊断由维护者在同等隔离边界内收集，不在用户页面回显。命令超时 120 秒，取消或超时先发送温和终止信号，保留 5 秒后的进程组 SIGKILL；即使 leader 提前退出也不会取消后备清理或提前报告结束。该流程由 `process-group.ts` 统一负责，合成回归覆盖后代忽略 SIGTERM 的场景。

生成使用固定 schema，输出 `src/generated/prisma`，不把生成客户端加入浏览器导出。先在断网、非 root、只读输入、独立可写输出目录中验证生成器；迁移仅接入专属 Docker internal network。禁止自动下载/上报或生命周期脚本。迁移使用 `migrate deploy`，**没有 migrate reset / db push / 生产重置命令**。同一迁移执行第二次应为无待执行变更。以上网络、文件和资源限制由运行容器实施，CLI 包装器自身不是操作系统隔离。

数据库集成测试需明确设置 `CATALOG_DB_TEST=1` 和 writer 凭据，默认普通测试会说明跳过该数据库套件，不伪报数据库验证成功。测试只创建随机前缀的合成来源/岗位，finally 仅删除这些确切 ID，无 TRUNCATE 或整库清理。覆盖重复写入、同名身份分离、更新与旧重试、并发首次写入、事务回滚、scope 改绑拒绝、唯一约束和禁止创建 public 表。

## 备份与恢复边界

使用经过审查的 PostgreSQL 镜像工具，对 `knowvia_catalog_test` 的 **catalog schema** 执行 `pg_dump --format=custom --schema=catalog --no-owner --no-privileges`，备份仅进入本任务受控目录。凭据由受控运行环境注入，不出现在命令参数、源码或日志。

恢复只能指向另建的 `knowvia_catalog_restore`，其空 catalog schema 已归 migrator。备份归档包含 `CREATE SCHEMA catalog`，所以不能直接全量恢复到这个预建 schema。先检查目标 namespace 中除预设默认授权外没有对象，再审阅 TOC，只移除恰好一条 `SCHEMA - catalog` 创建条目，保留其他条目及其顺序。

以下在已审查的 PostgreSQL 工具容器中执行；`/backup/catalog.dump` 为只读归档、`/out` 为本任务可写目录，数据库凭据通过受控环境注入。`set -eu` 和明确的检查使任一步失败后停止，不继续恢复。

```sh
set -eu
test "$(psql --host=catalog-db --port=5432 --username=catalog_migrator --dbname=knowvia_catalog_restore \
  -XAt --set=ON_ERROR_STOP=1 --command="SELECT current_database() = 'knowvia_catalog_restore' AND current_user = 'catalog_migrator' AND NOT EXISTS (SELECT 1 FROM pg_depend WHERE refclassid = 'pg_namespace'::regclass AND refobjid = 'catalog'::regnamespace AND classid <> 'pg_default_acl'::regclass)")" = t
pg_restore --list /backup/catalog.dump > /out/catalog.toc
awk '/^[0-9]+; [0-9]+ [0-9]+ SCHEMA - catalog[[:space:]]/ { removed++; next } { print } END { if (removed != 1) exit 2 }' \
  /out/catalog.toc > /out/catalog.restore.toc
```

人工或受控脚本核对两个 TOC 的差异只有该 schema 创建条目后，使用审核后的 TOC 恢复：

```sh
pg_restore --host=catalog-db --port=5432 --username=catalog_migrator --dbname=knowvia_catalog_restore \
  --use-list=/out/catalog.restore.toc --no-owner --no-acl --role=catalog_migrator --exit-on-error /backup/catalog.dump
```

不使用 `--clean` 或 DROP；目标非空、schema 缺失、TOC 条目数量异常均应停止。恢复后重新撤销应用角色对 `_prisma_migrations` 的权限，并比较来源数、岗位数、唯一身份、内部 UUID 和关键字段；重复运行迁移应无待执行变更。备份/恢复不会操作任何已有业务库。root 已实际执行此 TOC 流程：一来源、两条隐藏合成岗位恢复后全部字段及 UUID 一致，只读写入和迁移元数据访问均被拒绝；证据为 `evidence/2026-11-09/db-runtime/backup/restore-verification.json`（相对交接输出目录）。

这些是操作与验收要求，实际执行结果由 T05 review 记录，不能仅凭文档认定验证完成。

参考：[Prisma 7 生成器](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators)、[Prisma 多 schema](https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/multi-schema)。采用 ESM、`.ts` 生成与导入扩展名和纯 JS driver adapter，运行时不隐式加载 dotenv。
