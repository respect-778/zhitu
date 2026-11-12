# 岗位库运行骨架与独立存储

此 workspace 提供独立的 Fastify API 和 Crawlee Worker，复用 `contracts/index.ts` 的 Source、Job、ListPage、RunReport 运行时校验。API 提供存活检查及 T08 数据库只读岗位查询；Worker 保留固定合成自检，并增加 Tencent 原生社招官网的受限采样入口。T05 提供独立 PostgreSQL/Prisma 存储，T07 增加捕获文件离线清洗及事务入库；前端接入尚未实现。

要求 Node 24.12–24.x。Node 原生执行可擦除类型的 TypeScript，不生成构建产物。直接依赖固定为 Fastify 5.12.8 与 `@crawlee/basic` 3.18.2；后者已导出所需 core API，无额外浏览器依赖。TypeScript 5.9.3 与 `@types/node` 24.10.4 仅用于检查。依赖须经根工程审查后，以禁用生命周期脚本的 workspace 安装流程准备。

根 `package.json` 将 `@crawlee/core@3.18.2` 的 `minimatch` 传递依赖限定覆盖为 11.0.5，用于修复原解析版本 9.0.9 受 GHSA-g3hv-75wg-m249 影响的模式放大拒绝服务漏洞。覆盖仅作用于这个父包；版本锁与漏洞复扫由根工程维护。`tests/dependencies.test.ts` 直接调用 Crawlee 的链接筛选，验证包含、排除、不同主机及大小写匹配兼容性，无网络访问。

在根工程 `D:/knownai` 运行：

| 命令 | 当前行为 |
| --- | --- |
| `npm run catalog:api` | 前台启动 API，默认监听 `127.0.0.1:5198` |
| `npm run catalog:crawl -- --source fixture` | Crawlee 处理固定两页合成数据，输出一行 JSON 后退出 |
| `npm run catalog:crawl -- --source fixture --scenario retry-once` | 第二页首次失败、一次重试恢复，覆盖报告仍完整 |
| `npm run catalog:crawl -- --source fixture --scenario always-fail` | 第二页两次失败，输出部分覆盖报告，以退出码 1 结束 |
| `npm run catalog:verify -- --verify-live --source tencent-native --max-pages 2 --page-size 2 --max-details 4` | 明确授权一次真实腾讯官网采样；最多 2 页／4 条详情，输出 `synthetic: false, persisted: false`，覆盖不完整时退出 1 |
| `npm run catalog:ingest -- --source tencent-native --input /input/capture.json` | Linux 隔离环境读取单个可信采样 JSON，逐条清洗入库，输出独立采集与入库报告；Windows 明确报平台限制 |
| `npm run catalog:typecheck` | 对契约、运行代码和测试执行严格无输出类型检查 |
| `npm run catalog:test` | Node 内置测试执行契约、端口、健康状态、环境边界与真实 Crawlee 重试检查 |

也可使用 `npm run <api|crawl|verify|ingest|typecheck|test> --workspace=@knowvia/job-catalog`；Worker 参数放在 `--` 后。根命令由根 workspace 配置转发。

## API

端口可用进程环境变量 `CATALOG_API_PORT` 配置，只接受 1024–65535 的整数字符串；不会自动读取 `.env`。启动失败以非零退出码结束，仅打印固定错误说明，不打印原始错误、环境值或堆栈。端口冲突不会自动抢占或切换到其他服务。默认监听回环地址；受限 Linux 容器绑定选项见 [search-api.md](docs/search-api.md)。

`GET /health` 返回 HTTP 200、`check: "liveness"`、`status: "alive"`、`ready: false`，数据库仅指出是否配置，采集由独立 Worker 执行。它只说明 API 进程存活；不得作为数据库或采集就绪探针。`/api/catalog/v1/jobs`、`sources`、`jobs/:id` 查询已达到发布门槛的数据库记录；未配置或故障返回固定 503，不返回假空结果。`/ready`、`/jobs` 等旧路由返回固定 404。参数、公共响应、显式 writer 发布和测试边界见 [search-api.md](docs/search-api.md)。API 以 SIGINT / SIGTERM 关闭连接并断开 reader，关闭限时为 5 秒。

## 合成 Worker 边界

必须显式指定 `--source fixture`；真实来源、未指定来源和未知参数均失败退出。合成来源为保留的 `.invalid` 域名，URL 只充当队列身份与示例证据，不发起请求。队列固定两页、单并发、每页最多一次重试、处理超时 5 秒。输出含 `mode: "fixture"`、`synthetic: true`、`persisted: false`；岗位全部 `hidden + pending`，不宣称真实核验或入库。报告中成功恢复的重试不算未恢复请求失败。

Worker 在导入 Crawlee 前拒绝任何 `CRAWLEE_` / `APIFY_` 环境变量以及当前目录中的 `crawlee.json`，只检查变量名和文件存在性，不打印或读取其内容，也不修改进程环境。传入显式独立配置，关闭 `purgeOnStart`、存储持久化、元数据写入和统计持久化。内存存储使用每次随机、未创建的临时路径，避免读取宿主已有的默认 `storage/`；不主动创建该目录。固定内存预算配置与纯事件管理器避开默认宿主资源探测；这不是 OS 资源隔离。运行完成后关闭事件和队列调度。

首轮新增依赖执行必须由根任务在无网络、非 root、只读、受 CPU / 内存 / PID 限制的隔离容器中完成，并观察网络、子进程与文件访问。此代码本身不替代该验证。测试的文件写入只用于系统临时目录内的合成 `crawlee.json` 拒绝场景，并在结束后删除。

浏览器共享入口仅为 `@knowvia/job-catalog/contracts`；API、Worker、Node 文件和第三方后端库没有包导出。前端不得直接导入 `src/api`、`src/worker` 或 `src/runtime`。

## 独立岗位存储（T05）

`prisma/schema.prisma` 和版本化 SQL 迁移只定义专属 catalog schema 内的业务对象；schema 本身由独立初始化流程预建并归 migrator 所有，迁移账号不需要数据库级 CREATE 权限。`src/storage` 提供受限数据库配置、Prisma 客户端构造和事务岗位 upsert。同源同 ID 保持内部身份，同名的不同来源或岗位不合并。运行写入、读取和迁移分别使用 writer、reader、migrator 角色；T08 API 仅使用 reader。配置、生成、迁移、明确跳过的默认集成测试以及备份恢复要求见 [storage.md](docs/storage.md)；实际审查与验证结果见 `docs/reviews/T05.md`。

## 腾讯来源采样（T06）

`catalog:verify` 当前仅是有界采样，不是定时任务或已发布岗位生命周期核验。范围固定为 `tencent:native:all-categories:zh-cn`，没有技术类别过滤；大陆校招不属于本来源。默认 `enabled: false` 不被命令改写。`--verify-live` 只对这一轮采样授权，最多 10 页、每页 25 条、250 条详情，详情预算至少等于页数乘每页条数。每次列表／详情读取及失败重试调用的起点至少间隔 1 秒，单并发、一次重试；测试注入的纯合成 getter 才跳过间隔。单次调用最多重定向 3 次（合计最多 4 个 GET），跳转逐跳安全校验，当前不单独限速。

每页按原始 Count、实际条数、跨页身份及总量稳定性核对，SourceID=4 作为有证据的范围外计数，破损／未知类型为拒绝。到达页数上限、缺口、重复或失败均输出不完整报告，不能用于关闭未读岗位。详情每轮重新读取，职责和要求保留完整文本；更新时间保持日期原文和精度，发布时间、截止时间及未证实报名链接为 null。岗位全部 hidden。采样进程不入库；其 JSON 输出可交由 T07 独立离线进程处理。

真实请求须使用已审隔离环境和明确出口约束；首次真实验证与独立审查由主任务执行，不能从单元测试推断源站可用。网络策略、已验证事项和边界见 [tencent-adapter.md](docs/tencent-adapter.md)。

## 离线清洗与入库（T07）

`ingest` 只读取可信 T06 capture，不发起 HTTP。最大 8 MiB／1,000 条，来源按仓库固定配置核对；synthetic capture 不进入正式来源。每条记录规范校验后独立事务，重复运行不新增重复岗位，部分失败不丢成功项。同源锁内合并保留缺失旧值，明确改变的原文会撤销失效派生字段；学历、城市、用工及招聘渠道保持独立。不确定有效记录进入 review，结构拒绝只留报告，当前没有持久 review 队列或运营后台。容器命令、输入限制、计数语义、保真范围及数据库验证要求见 [ingestion.md](docs/ingestion.md)。

## 原始附件与离线解析（T10）

维护者在 `catalog` 目录运行 `node src/worker/import-artifact.ts --check --source tencent-native --source-url https://careers.tencent.com/attachment.pdf --observed-at 2026-11-11T02:00:00Z --input D:\reviewed\attachment.pdf --report D:\reviewed\attachment-report.json`。输入为本轮审查过的本地 PDF／XLSX，`--source` 选择仓库已有可信来源，HTTPS URL 主机匹配其 `allowedHosts`，`--observed-at` 填原始实际读取时间，缓存重导保留原时间。路径使用当前操作系统的规范绝对路径。报告文件排他创建并保存完整提取证据，标准输出仅含固定摘要。

将 `--check` 改为 `--store` 并增加 `--root D:\catalog-artifacts`，完成解析后写入受控根下 `sha256/<前两位>/<完整hash>`，再以现有 writer 配置写元数据和来源引用。首次使用先应用 `202611110002_document_artifacts` 迁移。相同字节共用一个文件，相同来源、URL 和 hash 共用引用，原始观察时间只取明确提供的时间。数据库失败报告 `ARTIFACT_DATABASE_FAILED_BYTES_RETAINED` 并保留字节供 T17 处理。岗位发布仍通过现有独立流程执行。

PDF.js 6.5.438 保留每页字符串、坐标、行和段落定位，重复表头与跨页续行均保留。无文字页报告 `needs_ocr`，OCR 后续由 T12 处理。ExcelJS 4.4.0 保留 sheet／行／列、空行、合并主格和范围、公式文本及已有缓存，链接只记录文本。XML 通过 saxes 5.0.1 预检，含 DTD、ExcelJS 会丢弃的 CDATA 或带前缀的 SpreadsheetML 核心元素时明确返回 `parse_failed`，保留原文件供后续核验。`r:id`、`xml:space` 等属性和非核心格式扩展沿用 ExcelJS 的识别范围。解析子进程禁用 native addon 和字符串代码生成，使用白名单环境，并按固定解析器的 required 依赖闭包逐个真实包目录授予读取权限，排除 workspace 链接及 optional native 包。PDF 只接收字节并拒绝外部字体、CMap、WASM 等资源读取。依赖安装使用根 `packageManager` 指定的 npm 11.18.0，并带 `--ignore-scripts`。

默认上限为 20 MiB 输入、100 页、20 个工作表、合计 20,000 行／100,000 个矩形单元格、2,000,000 个文字字符、2,000 个 ZIP 条目、单条展开 16 MiB／累计 64 MiB、200 倍压缩比、20 秒、192 MiB V8 old-space 和 32 MiB 报告。ZIP 在 ExcelJS 加载前逐条实际有限展开，预检稀疏坐标与合并矩形面积。超限、超时、不支持格式或解析失败均明确报告，子进程强制终止并回收，结果不会标记完整。`documentLimits` 允许来源降低上限。V8 堆限制覆盖 JS old-space，进程 RSS 与禁网由部署容器的 OS 边界约束，宿主离线入口自身只执行本地解析。
