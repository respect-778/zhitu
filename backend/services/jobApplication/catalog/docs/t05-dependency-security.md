# T05 Prisma／PostgreSQL 依赖安全审查

日期：2026-11-09。审查者：review_t05_dependencies。状态：固定版本源码、候选实际包和当前接入代码的重点静态审查通过，可进入下述受限生成／迁移／CRUD 验证。root 继续补齐实际 workspace 自动扫描及动态运行证据；当前不是 T05 完成或生产部署批准。

## 版本与审查边界

拟使用 `prisma`、`@prisma/client`、`@prisma/adapter-pg` 7.10.1，`pg` 8.23.1。CLI 是生成和迁移工具，不应进入 API／Worker 的执行入口；运行时使用生成的本地 Prisma Client、adapter-pg 和 pg。T04 已审查的 Fastify／Crawlee 不重复计作本次新审查。

GitHub API 将 Prisma `7.10.1` tag 解析到提交 `97ea359250335c1a174504c9b2b7e5fe030ab937`；node-postgres `pg@8.23.1` tag 解析到 `0980cefebe0ae461da8883703be049fe13ca96cf`。以下永久链接对应这两个提交。源码定位是审查线索，实际 npm 编译产物与锁文件仍须比对；没有逐行审完全部打包库、WASM 或原生二进制的声明。

安装审查必须 `--ignore-scripts --no-audit --no-fund`，仅挂载候选 manifest 和专属暂存目录，不挂载项目源代码、用户 home 或宿主 Docker socket。禁用安装脚本不等于运行时没有下载／遥测。

## CLI 的外联、文件与执行路径

| 路径 | 实际行为 | 本项目约束 |
|---|---|---|
| 使用遥测 | [CLI.ts 64–75](https://github.com/prisma/prisma/blob/97ea359250335c1a174504c9b2b7e5fe030ab937/packages/cli/src/CLI.ts#L64) 调用 checkpoint；[checkpoint.ts 34–96](https://github.com/prisma/prisma/blob/97ea359250335c1a174504c9b2b7e5fe030ab937/packages/cli/src/utils/checkpoint.ts#L34) 收集项目／CLI 路径 hash、schema provider、generator、命令等。 | 固定 `CHECKPOINT_DISABLE=1`；该分支在收集前早退。`PRISMA_HIDE_UPDATE_MESSAGE=1` 仅用于隐藏更新提示，不能替代禁遥测。 |
| 崩溃报告 | [handlePanic.ts 19–65](https://github.com/prisma/prisma/blob/97ea359250335c1a174504c9b2b7e5fe030ab937/packages/internals/src/utils/handlePanic.ts#L19) 可交互时提示上传；[sendPanic.ts 46–76](https://github.com/prisma/prisma/blob/97ea359250335c1a174504c9b2b7e5fe030ab937/packages/internals/src/sendPanic.ts#L46) 包含命令、JS／Rust 栈和迁移请求，取得签名 URL 后提交错误报告。 | `CI=1`、非 TTY、stdin ignore；不确认上传。CHECKPOINT_DISABLE 不覆盖这一独立分支。断外网是额外边界。 |
| 命令状态 | [commandState.ts 11–43](https://github.com/prisma/prisma/blob/97ea359250335c1a174504c9b2b7e5fe030ab937/packages/cli/src/utils/commandState.ts#L11) 读取／创建用户配置目录中的 commands.json。 | HOME、XDG_CONFIG_HOME、XDG_CACHE_HOME 固定到专属 /tmp，预期仅产生临时状态文件，不使用宿主 home。 |
| 引擎补下载 | [engines/index.ts 15–33](https://github.com/prisma/prisma/blob/97ea359250335c1a174504c9b2b7e5fe030ab937/packages/engines/src/index.ts#L15) 确保 schema-engine 存在；generate 也经过此步骤，即使 runtime 为 client engine。 | 人工准备官方固定引擎并双重核验摘要，设置可信 `PRISMA_SCHEMA_ENGINE_BINARY`；首次 generate 断网。 |
| 引擎环境覆盖／缓存 | [fetch-engine/download.ts 94–129、226–315](https://github.com/prisma/prisma/blob/97ea359250335c1a174504c9b2b7e5fe030ab937/packages/fetch-engine/src/download.ts#L94) 支持覆盖路径、版本、缓存和子进程版本检查；[utils.ts 57–76](https://github.com/prisma/prisma/blob/97ea359250335c1a174504c9b2b7e5fe030ab937/packages/fetch-engine/src/utils.ts#L57) 支持下载镜像覆盖。 | 子进程使用环境白名单；不能继承任意 PRISMA_*、BINARY_DOWNLOAD_VERSION、代理配置。绝不设 PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING。存在的自定义 engine path 会跳过下载，所以外部预校验不能省略。 |
| 配置与生成器执行 | [loadConfig.ts 13–34](https://github.com/prisma/prisma/blob/97ea359250335c1a174504c9b2b7e5fe030ab937/packages/cli/src/utils/loadConfig.ts#L13) 将 prisma.config 作为 TS／JS 模块加载。schema 可配置第三方 generator。 | 配置、schema、migration 都是可信本地代码；固定绝对路径，仅允许项目内 prisma-client generator，不接受来源内容成为配置或生成器。 |

CLI wrapper 只允许 `generate`、`validate`、`migrate deploy`、`migrate status` 的固定参数组合。以固定 Node 绝对路径直接启动本地 `prisma/build/index.js`，`shell:false`；不调用 npx，不透传任意命令／参数。`studio`、`init`、`bootstrap`、`dev`、`platform`、`postgres`、`mcp`、`db seed`、`migrate reset` 不在本任务运行范围。

建议子进程固定环境包含 `PATH=/usr/local/bin:/usr/bin:/bin`、`HOME=/tmp/catalog-prisma`、对应 XDG 临时目录、`TMPDIR=/tmp`、`CI=1`、`NO_COLOR=1`、`CHECKPOINT_DISABLE=1`、`PRISMA_HIDE_UPDATE_MESSAGE=1`、唯一已校验 engine 路径及必要的本项目数据库配置。不得继承 DEBUG、NODE_OPTIONS、NODE_PG_FORCE_NATIVE、PG*、代理或任意 Prisma 覆盖变量。迁移使用专属内部网络，生成使用 network none；代码／依赖只读，只有生成目标和 /tmp 可写，数据库端只赋予本项目角色所需权限。

## 原生引擎来源

官方 npm 元数据 `@prisma/engines@7.10.1` 精确依赖 `@prisma/engines-version@8.1.0-1.d1b3f377ca835d73fd50954a5e22128b9ebdd6b8`。引擎提交为 `d1b3f377ca835d73fd50954a5e22128b9ebdd6b8`，不是 Prisma CLI 仓库提交。

- Linux Debian/OpenSSL 3：[schema-engine.gz](https://binaries.prisma.sh/all_commits/d1b3f377ca835d73fd50954a5e22128b9ebdd6b8/debian-openssl-3.0.x/schema-engine.gz)、[压缩摘要](https://binaries.prisma.sh/all_commits/d1b3f377ca835d73fd50954a5e22128b9ebdd6b8/debian-openssl-3.0.x/schema-engine.gz.sha256)、[解压摘要](https://binaries.prisma.sh/all_commits/d1b3f377ca835d73fd50954a5e22128b9ebdd6b8/debian-openssl-3.0.x/schema-engine.sha256)。
- Windows 候选目标：同一提交的 `/windows/schema-engine.exe.gz` 及对应 `.gz.sha256`、`.exe.sha256`。本阶段只做 Linux 容器验证，不因存在 Windows 目标就下载或执行。

核对下载及解压字节 SHA256 后，再以只读文件挂载；执行前重新校验本地摘要。来自同一官方 HTTPS 服务的摘要证明下载一致性，不等于独立代码审计或抵抗上游整体被攻陷。

root 已保存下载记录 `evidence/2026-11-09/prisma-engines/manifest.json`：压缩文件 8,711,939 字节、SHA256 `5827f56149193f0249b2f4b8a64e60c300c3129ed6514bad0a11c340e1cffad6`；解压 ELF 23,516,472 字节、SHA256 `7116e00278a793ee13db6f0a732c1aaec10f795a37bc02e3a7df3b06b2f1311f`。两份摘要均与官方对应文件匹配。root 已在断网、非 root、只读、固定镜像中验证 engine `--version`，无 connect/sendto；收据为 `evidence/2026-11-09/prisma-engine-validation/receipt.json`。这不代替迁移命令的实际验证。

## 运行时数据库边界

[pg connection-parameters.js 8–118](https://github.com/brianc/node-postgres/blob/0980cefebe0ae461da8883703be049fe13ca96cf/packages/pg/lib/connection-parameters.js#L8) 会补读 PG* 环境，支持关闭 TLS 校验的配置；连接串可覆盖显式配置。[pg SSL 官方说明](https://node-postgres.com/features/ssl)指出 sslcert、sslkey、sslrootcert、sslmode 参数会覆盖 ssl 对象。密码缺失时还可能查找 pgpass。

T05 应只接受明确的本项目连接配置，拒绝 ambient PG*、缺失密码、未允许的 endpoint／database／role 和用户 DSN query 参数，转换为逐项明确的 pg 配置。仅专属本地／内部网络测试允许无 TLS；不能把这一设置直接用于远程生产连接。

[adapter-pg 93–111](https://github.com/prisma/prisma/blob/97ea359250335c1a174504c9b2b7e5fe030ab937/packages/adapter-pg/src/pg.ts#L93) 将 SQL text 与 values 分开交给 pg；普通 Prisma 查询可利用参数绑定。原始 SQL、动态标识符、迁移脚本仍须独立审查，ORM 不能保证调用方拼接安全。adapter 的 DEBUG 日志含 SQL／参数，运行环境须关闭 DEBUG，不输出原始 Prisma／pg 错误对象、连接串或查询参数。

[PrismaClient 174–207](https://github.com/prisma/prisma/blob/97ea359250335c1a174504c9b2b7e5fe030ab937/packages/client/src/runtime/getPrismaClient.ts#L174) 区分 adapter 与 accelerateUrl。仅使用本地 PrismaPg adapter，不启用 Accelerate、远程 extensions、Studio 或遥测 exporter。生成的 client 不供前端导入。

## 候选实际包核对

候选闭包位于 `outputs/job-catalog-handoff-2026-11-08/evidence/2026-11-09/security-tools/review-inputs/t05-dependencies`。无脚本 npm ci 已完成，316 个包位置；相对 T04 独立候选锁新增 138 个位置，signal-exit 根位置由 3.0.7 变为 4.1.0，3.0.7 保留于 proper-lockfile 下。这是候选锁差异，不代表用户 workspace 的已有依赖发生同样变动。候选锁 SHA256 为 `2ecc3c12f81f3d78a00c5e87f85ec4a20896ae71b93c51f4e6256a67d74e0b0b`。

人工实际读取了以下执行面，并以固定上游源码解释编译代码分支；没有执行包或连接数据库：

- `prisma/scripts/preinstall-entry.js` 与 `preinstall/index.js`：入口载入本地编译脚本，实际作用是 Node 版本校验与终端输出格式，没有发现该入口的下载或源码读取路径。保持 ignore-scripts，不为运行额外执行它。
- `@prisma/engines/scripts/postinstall.js` 与 `dist/scripts/postinstall.js`：正常发布路径创建下载锁并调用 fetch-engine，开发版 0.0.0 才调用 pnpm 构建；已安装版本为 7.10.1。此 postinstall 不执行，替换为上述手动核验引擎准备流程。
- 实际 install 生命周期仅上述 preinstall、postinstall；另有 prepare、prepublish／prepublishOnly 脚本，包括发布、构建和 git push，均未执行。发布脚本存在本身不代表应用入口会运行它。
- 实际 `prisma/package.json` bin 是 `build/index.js`；该 110 字节入口对普通命令转到 `build/cli.js`。CLI bundle SHA256 为 `4ab8a95f0072dfa7c3db869a5ff8f775499f22c346a4556991c0ae28eb1220fd`，实际 bundle 中的 checkpoint 早退、panic 上传、下载覆盖与固定源码一致。它还包含 `init --prompt` 向 `prisma-generate-server.prisma.workers.dev` 发送描述的路径，以及云账号／Studio 功能；固定命令白名单不允许进入这些路径。
- `@prisma/config/dist/index.js` 627–649 行显式设置 `dotenv:false`、`rcFile:false`、`giget:false`、`extend:false`、`packageJson:false`；因此本版本固定 config 的加载不会自动读取旁边 .env、RC 或扩展远程配置。config 仍按 JS／TS 执行，只能由本项目维护。
- 实际 adapter-pg 的 `dist/index.mjs` 以 `text`、`values` 分离调用 pg；实际 pg/lib/index.js 支持 NODE_PG_FORCE_NATIVE，connection-parameters.js 读 PG*，pg-connection-string/index.js 可读证书文件，pgpass/lib/index.js 可读密码文件。当前 config/client 的严格参数与环境校验覆盖这些默认路径；只有明确的本地／内部数据库 socket 是本次允许外联。
- 实际 client runtime 有 `readFileSync` 源码诊断能力和 RemoteExecutor fetch 能力。`errorFormat:'minimal'` 禁用 CallSite 源码定位，仅传 PrismaPg adapter 则选 LocalExecutor。`TEST_CLIENT_ENGINE_REMOTE_EXECUTOR` 只改变已选择 Accelerate 路径的 HTTP 协议，不会把普通 adapter 自动改为远程。未发现当前本地 adapter 路径的独立 usage telemetry；不能因此声称整个包不具备外联／文件读取能力。

对 `@prisma/client`、adapter-pg、pg 的 dependencies／optionalDependencies 做图遍历得到 23 个位置（包含 @types 包）；审查了这些路径的文件、环境、进程和网络调用线索。普通数据解析代码中的正则 `.exec` 不是子进程执行。CLI 加载还会导入 dev 状态和 Studio 数据模块，不应将所有 CLI 依赖都描述成从不加载；本任务限制的是其调用功能、文件挂载和网络权限。

候选离线 OSV 报告 `security-tools/reports/t05-candidate-lock-20261109-122037-bbf2003c` 无已知漏洞发现。实际 workspace 闭包及自动源码扫描结果由 root 另附，不能用候选零发现替代实际锁复验。

## 大文件、WASM 与扫描覆盖

候选新增包包含 17 个 `.wasm` 文件，没有新增 `.node`／`.exe`／`.dll`／`.so`／`.dylib` 文件；手工下载的 schema-engine ELF 单列在引擎收据。WASM 包括 Prisma schema／query 编译器以及 Prisma dev 的 PGlite 组件。PGlite 本地服务和 Studio 功能不在本次命令范围。

Prisma Client 另有 20 个超过 2 MB 的 base64 包装文件（fast/small、五类数据库、JS/MJS）。对 PostgreSQL 两类 JS 包装静态解码，没有执行 WebAssembly：fast 3,437,252 字节、SHA256 `aa76e6f4e003d86b67de2ed49ea8ddaf98dfc8f30ce73c7bcd0d83ac821f3811`；small 1,734,597 字节、SHA256 `a2a248488958b76b2c57b1c28d79d7defe90957455d5cd34563c53dd4fec71e7`。二者均与 Prisma CLI 包内对应 WASM 字节一致。读取 PG fast JS glue 未发现网络／文件／子进程接口；这不是 WASM 内部逻辑审计。

默认扫描器单文件上限 2 MB，会遗漏 `prisma/build/cli.js`（2,748,673 字节）、上述 base64、Studio 约 15 MB UI bundle、query-plan-executor 约 5 MB 等大文件。必须保留跳过记录；CLI 入口已针对已识别危险调用人工追踪，但不能称完整静态分析覆盖。WASM／ELF 的来源、摘要、限制运行和系统调用证据不能代替二进制源代码审计。

## 部署门槛与剩余验证

实际候选 `@prisma/client/package.json` 声明可选 peer `prisma:*`。即使项目将 prisma 列在 devDependencies，候选锁中的 Prisma CLI／dev／Studio 多数位置仍没有 `dev:true`。因此 `npm ci --omit=dev` 不能作为生产镜像排除 CLI 的证据。T22 必须使用独立 runtime manifest／锁或检查实际构建产物清单，证明运行发布范围不包含不需要的 CLI 服务功能；本阶段只验证固定入口与最小挂载，未声明生产镜像已裁剪。

当前本地 config/client/prisma-cli 已符合上述环境／角色／固定入口／日志控制。没有发现必须阻断“指定受限验证”的问题。root 尚须完成实际 workspace 闭包核验、应用及增量依赖扫描、断网 generate/validate、专属内部网络 migrate/CRUD、失败路径和文件／网络／进程证据。strace 不记录环境值和数据库认证 payload，报告不包含测试数据库密码。任何新命令、外部 schema/generator、远程数据库或生产部署都需对应复核。

## 实际 workspace 扫描补充（2026-11-09）

以下补充以 `E/T05-workspace-catalog-closure.json` 的 319 个第三方包位置为准，包含 316 个不同 name/version/integrity identity；本项目 workspace 条目不作为第三方包。实际安装位于 `E/workspace-lock-review-t05`。180 个安装位置的 identity 与 T04 许可清单一致，139 个安装位置需要新增归档或补录。独立候选锁的版本／位置数量不能替代这一清单。

| 证据目录（均在 E/security-tools/reports） | 实际结果与边界 |
|---|---|
| `t05-actual-lock-20261109-123116-65828408` | 实际闭包离线 OSV 零已知漏洞发现；仅覆盖当时本地 npm 公告库。 |
| `t05-execution-sast-20261109-123116-4cacd92f` | 370 个输入文件，285 个被扫描，379 条能力线索；环境访问 268、文件读取 50、网络 29、进程能力 28、动态执行 2、关闭 TLS 验证 2。两处解析错误，整体状态保留 `scanner_error`。 |
| `t05-new-code-secrets-20261109-123123-dfc60aa2` | Gitleaks 检出 7 条 generic-api-key，逐项人工定位为下述误报。扫描原始状态仍为 `review_required`，不修改原始报告以制造零发现。 |
| `t05-large-cli-supplement` | 对字节相同的 2,748,673 字节 CLI 增加到 4 MB 单文件上限及 1 GB 内存，Semgrep JSON 仍报告 Out of memory。即使进程 exitCode 为 0，状态也是 `scanner_error`，不能计为扫描成功。 |

SAST 的 379 条线索按文件位置和命中上下文分类如下。能力存在与本次调用是否能到达是两个不同结论；本表不是整个依赖源码的逐行审计。

| 规则类别 | 人工分类及本次控制 |
|---|---|
| 环境访问 268 | 终端颜色／调试、平台与路径探测、子进程继承、引擎镜像／版本覆盖、代理、配置加载、PG 默认配置，以及测试工具的环境替换。部分规则只命中 `process.env` 对象，不能把数量理解为读取了 268 个秘密。CLI 使用固定环境白名单，实际客户端在导入前拒绝 PG*、DEBUG、NODE_OPTIONS、NODE_PG_FORCE_NATIVE。 |
| 文件读取 50 | Client 调用源码诊断；引擎摘要／缓存／文件复制与平台 `/etc/os-release`；配置、package.json／模块解析；可选 dotenv／RC；PG 证书／pgpass；checkpoint 缓存／signature。源码诊断以 minimal 关闭，配置／引擎路径固定，PG 使用显式密码和字段配置，不透传 DSN 查询参数；容器只挂本项目最小范围。 |
| 网络 29 | Client 的内部 request 调度及可选 RemoteExecutor；fetch-engine 下载／校验／重定向；giget 模板下载；checkpoint 工作脚本及其 HTTP 重定向。并非 29 个独立外部目标。固定 PrismaPg adapter、禁止远程配置与模板命令、预置已校验引擎及 CHECKPOINT_DISABLE 限制相关分支；网络隔离提供运行约束。 |
| 进程能力 28 | 命中均为 child_process import／require，规则对部分同一导入重复计数；涵盖引擎开发安装、下载／平台工具、giget／包管理器。不能解释为已经运行 28 次子进程。安装脚本未执行；允许的 CLI／引擎进程另以 wrapper 与 strace 约束。 |
| 动态执行 2 | 两版 get-platform 的 `dist/test-utils/vitestContext.js` 中以 `new Function` 加载测试快照；不是当前固定应用入口。配置 TS／JS 的可执行属性仍必须独立控制，不能因这两条是测试代码就宣称不存在其他动态模块加载。 |
| TLS 2 | pg 的 PGSSLMODE=no-verify 和连接串 ssl=no-verify 分支；当前配置拒绝 PG*／用户 DSN 查询选项，仅专属本地／内部测试使用 ssl=false。远程生产 TLS 仍须在部署步骤另验。 |

`prisma/build/child.js` 是 checkpoint 子进程工作脚本，不是生成器。实际包第 82839–82859 行组装 schema provider／preview feature／generator、command、project／CLI path hash、版本和系统信息，第 82871 行请求 checkpoint；第 889／1090 行可读缓存与 signature。CLI 的 CHECKPOINT_DISABLE 在启动这一工作流之前早退，不能直接执行 child.js 来绕过该入口控制，也不能用 CHECKPOINT_DEBUG_STDOUT 代替关闭遥测。

解析错误的具体范围：jiti 2.7.0 `dist/babel.cjs` 是大型单行 Babel 编译 bundle，Semgrep 报 Syntax error；不能据此断言 Node 语法错误或文件无危险代码。get-platform 7.2.0 `dist/test-utils/vitestContext.js` 第 5406–5437 行为 AssertionError 类的 static 初始化块、getter、constructor 与 toJSON，已读取对应片段，PartialParsing 仍保留。增加大 CLI 扫描资源未消除 OOM；WASM／ELF 和其他超大 bundle 的覆盖限制仍适用。

Gitleaks 的六条 effect 3.20.0 命中分别来自 interval／intervals 的 TS、CJS、ESM：赋值常量 IntervalSymbolKey／IntervalsSymbolKey 随后作为 Symbol.for 的类型标识使用，属于源码命名空间字符串，未见凭据用途。第七条位于 Prisma `build/cli.js` 第 203 行，是 JSON token parser 的状态与 key 初始化表达式；按 UTF-8 字节列核对后，命中范围不含字符串字面值。七条均归类误报，没有验证任何凭据有效性，也没有在报告中复制检测值。

在这些实际命中和前述已追踪分支内，没有新发现必须阻断指定隔离验证的未知上传路径或真实凭据。该结论不消除解析失败、文件跳过和二进制覆盖不足，不能表述为全部依赖通过完整静态审计。

## 首次 generate 的新增运行证据

已读取 `E/runtime-validation/t05-generate/receipt.json`：exitCode 0，network none，connect 0，sendto 0，执行记录仅为两次 `/usr/local/bin/node`。写入包括 `/dev/null`、专属 `/tmp/catalog-prisma` 的 commands.json、`/tmp/jiti` 的配置转译缓存和生成目标下的 10 个 Prisma 文件；没有把配置缓存写进其他项目。本收据只证明该次 generate 场景，不能替代 migrate、CRUD、失败路径或生产网络验证。后续数据库验证结果由 T05 总评审记录汇总。

## T05 许可证归档与明确缺口

`docs/t05-dependency-inventory.json` 逐位置保留 name、version、resolved、integrity、发布方 license 声明、随包／补录来源、归档行号和文本 SHA256。180 个既有安装位置引用 T04 的 `licenses/npm/THIRD_PARTY_LICENSES.txt`；139 个新增／不同安装位置的增量在 `licenses/npm/T05_THIRD_PARTY_LICENSES.txt`。增量有 275 个文本来源、151 个去重文本，其中 114 处是代码中原样保留的 license／copyright 注释；275 个归档行号／字节摘要引用已重新核验。原 T04 归档未改动。

补录包括 @visx/vendor 内嵌许可、streams-local 的 hash-wasm 许可／NOTICE、confbox 的 gzip 压缩第三方许可（仅解压，不修改内容）。elkjs 0.11.1 的 EPL-2.0 和 React 的 Meta Platforms 原版权措辞完整保留。pgpass 1.0.5、pg-types 2.2.0 从随包 README 的完整 MIT 段落补录。

其余可信补录源已核对官方 npm 版本元数据中的 gitHead 和 integrity：

- postgres 3.4.7：[固定发布提交 UNLICENSE](https://github.com/porsager/postgres/blob/9b92b65da6a5121545581a6dd5de859c2a70177f/UNLICENSE)。
- Radix react-use-layout-effect 1.1.1／react-compose-refs 1.1.2：[对应 npm gitHead 的 MIT](https://github.com/radix-ui/primitives/blob/fcef0668a5c827e5a4baac405474d75680f9a4eb/LICENSE)。
- remeda 2.33.4：[对应 npm gitHead 的 MIT](https://github.com/remeda/remeda/blob/f9e681a707fd8cac00c43c10591c44e17f577610/LICENSE)。

**唯一未解决的包级全文缺口是 @prisma/dev 0.24.17。** 实际 package.json 和[官方 npm 精确版本元数据](https://registry.npmjs.org/%40prisma%2Fdev/0.24.17)声明 ISC，但包内没有 LICENSE、NOTICE、README 或可识别的许可注释，元数据也没有 repository／gitHead。没有以 author 字段虚构版权行，没有套用别的 Prisma 包许可证。138 个新增位置已有许可文本，这一个位置明确标为 missing-full-license-text；不能称全部许可证已补齐。T22 对要分发的产物必须取得可核验授权文本，或证明不包含该包；在受限本地开发环境存在该包不等于已完成对外分发许可审查。

@prisma/studio-core 0.33.0 的随包 LICENSE 只有简短的 Apache／品牌说明，NOTICE 要求 Prisma 品牌保持可见且不移除；[其 npm gitHead 的 LICENSE](https://github.com/prisma/studio/blob/81354ff7d656f75504460add793bf8599d65b0c5/LICENSE)与包相同。两份原文都已保留，并补[Apache-2.0 标准全文](https://www.apache.org/licenses/LICENSE-2.0.txt)，不把补录当作取消品牌说明。T05 不启用 Studio UI；若以后分发或使用，需结合原 NOTICE 审查。elkjs 的 EPL 分发条件同样进入实际产物审查。

这份清单是 319 个安装位置的许可归档，不是所有 minified／WASM 内嵌组件的完整 SBOM 或法律保证。现有内嵌 NOTICE／注释已保留，但不能凭 package.json 还原上游遗漏的内部组件许可证。部署时必须按实际产物判断 CLI／dev／Studio 是否被包含，不能仅靠 devDependencies 或 --omit=dev 得出已排除的结论。
