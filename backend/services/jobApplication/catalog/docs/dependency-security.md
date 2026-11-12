# T04 依赖与隔离审查记录

## 2026-11-11 T10增补

附件模块精确依赖为ExcelJS4.4.0、PDF.js6.5.438和saxes5.0.1。ExcelJS的uuid通过根override固定11.1.1，实际加载版本和package-lock一致，修复本次新增链的两项moderate审计告警。生命周期脚本在安装过程中禁用。

原npm11.6.2的工作区link override传播及隐藏锁元数据造成实际安装树与声明失真，经官方npm11.18.0固定包完整性和修复代码复核后，以临时工具读取真实安装树并按主锁校准。项目已声明npm>=11.18.0和packageManager固定版本。原有锁条目的版本变化数为0。

本轮新增执行路径的已知审计告警为0。主项目原有8条告警仍在，包含@babel/core低危及lodash-es、nanoid、postcss、react-router、rollup、source-map-js、vite高危，相关锁条目与本轮安装前一致。这些项记录在本轮root-audit-final.json，生产部署验收按主方案3.5及T22继续闭合。

独立源码review发现并修复workspace源码读取越界、ZIP Unicode Path及XML语义预检绕过、CDATA/命名空间原句丢失、child结果契约与损坏状态误分类。解析器按真实依赖逐包授权，拒绝workspace及optional native目录，禁用addon与字符串代码生成，环境变量采用白名单。Node24文件权限与容器网络、RSS和进程边界共同提供当前运行约束。

实际验收包含最终Linux16/16、UID1000、全部cap为0、NoNewPrivs=1、768MiB cgroup内存、1CPU、96PIDs、外网/元数据地址/DNS访问拒绝，正常CLI check的strace记录无INET socket或connect调用。批处理强杀及成功后子进程资源0。首次Windows绑定目录叠加strace的超时记录保留，常规回归使用已审依赖的Linux只读卷，独立strace覆盖正常CLI，生产超时上限沿用既定配置。

完整材料位于outputs/catalog-mainline-next-2026-11-11，包含原始锁基线、供应链审查、初审及修复、代码与规格review、运行profile、trace摘要、数据库及CLI回执。此处记录当前本地T10范围。

T06 补充：Tencent 适配器和受控 HTTP 使用 Node 标准库，没有新增依赖。正式网络路径不调用 got-scraping/sendRequest；使用独立 Agent、固定 TLS 校验、经 DNS 验证并绑定的 IPv4，以及连接实际地址核验。实现与回归边界见 [tencent-adapter.md](tencent-adapter.md)；T06 独立审查和实际隔离记录由主任务另行补充，本段不扩张下文 T04 的已验证范围。

日期：2026-11-09。状态：依赖研究及首次隔离验证已完成；T04 整体验收见 reviews/T04.md。

证据根目录为 `D:/knownai/outputs/job-catalog-handoff-2026-11-08/evidence/2026-11-09`，下文 E 指该目录。独立依赖审查者为 review_t04_dependencies。

## 精确范围与安装

运行依赖为 Fastify 5.12.8、@crawlee/basic 3.18.2；开发工具为 TypeScript 5.9.3、@types/node 24.10.4。根 npm workspace 锁为权威版本记录，不单独维护业务子目录锁。

独立候选锁含 178 个包，实际根 workspace 闭包含 180 个包位置，详见 dependency-inventory.json。实际闭包复用已有 tslib 2.8.1、sax 1.4.3，已验证其原镜像锁的 SHA512 与官方同版本发布一致，并补充源码阅读与扫描。重复安装位置分别保留。

首次解析与安装在仅含 manifest／锁文件的容器中执行，使用 `--ignore-scripts --no-audit --no-fund`。新依赖均来自官方 npm registry，核对 tarball integrity。没有 preinstall/install/postinstall；部分包包含 prepare、发布或覆盖率脚本，这些脚本未执行。工具下载与实际代码执行分开。

根锁原有 378 个远程包使用 registry.npmmirror.com。新增 catalog 导致 7 个共享浏览器兼容数据包的锁条目变化（其中 6 个版本更新，escalade 仅地址变化）：header-generator 要求 browserslist ^4.28.8，原 4.28.1 不满足；其余既有包版本保持。差异在 E/T04-workspace-lock-diff.json，原锁保存在 E/root-package-lock-before-T04.json。实际根构建通过，既有岗位／扩展回归在独立产物目录中 40/40 通过；首轮测试产物 ENOENT 的边界见 reviews/T04.md。

## 发现与处理

| 发现 | 处理与边界 |
|---|---|
| minimatch 9.0.9 存在 GHSA-g3hv-75wg-m249 | 根 overrides 仅将 @crawlee/core@3.18.2 的 minimatch 固定为 11.0.5。修复后候选锁和实际闭包的离线 OSV 均无发现；实际 Crawlee 匹配回归覆盖 include/exclude、大小写、brace/extglob。 |
| got-scraping 存在默认关闭 TLS 校验的 HTTPS、代理 CONNECT、ALPN 路径，并启用宽松 HTTP 解析 | T04 fixture 不调用网络 helper。T06 必须采用独立受控 HTTP 层并验证 TLS、DNS、连接地址和逐跳重定向；禁止把 Crawlee sendRequest/got-scraping 默认网络路径接入正式来源。 |
| Crawlee 自动读取 cwd/crawlee.json 和 CRAWLEE_* 环境，默认存储可读取／清理本地目录 | fixture 在动态导入前拒绝 ambient 配置，设置内存存储、随机未创建的临时目录、关闭 purge 和持久化；自定义 EventManager 与固定内存上限避免主机进程采样。 |
| ow 在失败诊断中可能读取调用源码以推断参数名 | 这是实际文件读取能力，未发现该诊断路径上传源码。仅允许受限挂载范围，不能声称依赖完全不读源码。 |
| @apify/ps-tree/package.json 的 codeclimate 开发脚本含上游令牌 | 保留位置和用途，不复制令牌到报告，不验证有效性。该脚本不是安装生命周期或应用入口，始终未执行。 |
| Fastify 路由/schema 编译、相关库的功能探测和模块加载包含动态代码路径 | 当前仅使用本地固定路由/schema，关闭 Pino logger/transport；不接受外部提供的可执行 schema 或 transport 模块。 |

[minimatch 官方公告](https://github.com/advisories/GHSA-g3hv-75wg-m249)说明修复下界为 11.0.1；当前精确修复版本为 11.0.5。

## 扫描覆盖及限制

- `security-tools/reports/t04-dependency-code-20261109-105831-a53200e1`：Semgrep 3,833 文件、1,229 线索；其中按路径归类 1,085 项来自上游测试／示例／构建工具。唯一解析错误为 Fastify `test/types/reply.tst.ts` 第 28–29 行的嵌套泛型类型断言，已人工阅读。该报告状态仍为 scanner_error，不能称全量扫描零错误。
- `security-tools/reports/t04-dependency-compiled-20261109-111102-2a9357f7`：补充 Semgrep 391 文件、27 线索、0 错误。为覆盖默认排除的 dist 目录，将字节不变的文件在独立审查副本中改目录名，保留原路径和 SHA256；也包含实际复用 tslib／sax。
- Gitleaks 原轮三处发现：Fastify 两处为 WebSocket 测试 nonce，另一个为上述上游开发脚本令牌。报告已脱敏，未扫描原业务 Git 历史。
- 实际闭包 OSV 报告为 `security-tools/reports/t04-workspace-closure-20261109-111101-33920e88`，使用本地 npm 漏洞库和 `--offline`，零已知漏洞发现。新漏洞或未收录恶意代码不在该结论范围。
- 应用初扫只有 runtime/config.ts 两处环境访问线索：一处读取明确的 CATALOG_API_PORT，另一处枚举配置名称以拒绝 CRAWLEE_/APIFY_；不记录其值，不向外传递。

全部扫描使用断网、非 root、只读代码挂载、cap-drop、no-new-privileges 及资源限额。扫描工具本身的初审、四项修复和性能修复均经过独立复审，证据在 E/security-tools。

## 首次隔离运行

Node 24.22.2 固定镜像加 Debian strace 6.1-0.1／libunwind8 1.6.2-3，仅用于验证。实际命令、容器限制、状态和系统调用在 E/runtime-validation。

首轮 24/24 测试和严格类型检查通过。strace 记录仅执行 Node 与三个 Node 测试进程；没有 connect、sendto 或 DNS 请求。网络行为仅为合成本地 API 的 127.0.0.1 监听和端口冲突／释放。唯一写入是测试在独立 /tmp 目录创建的合成 crawlee.json，随后清理；正常运行与重试／失败场景均自然退出。只挂载本模块、该闭包依赖和专属证据目录，没有生产凭据、其他项目源码或 Docker socket。

模块加载、运行时 /proc／/sys 信息及文件存在性探测属于实际读取。该验证不覆盖未来 HTTP、数据库、附件解析和生产部署。

## 许可证补录出处

随包许可证及 NOTICE 保留在 licenses/npm/THIRD_PARTY_LICENSES.txt；缺失随包文件的部分使用以下证据补录，不虚构原版权年份：

- @tokenizer/token：随包 README 的完整 MIT。
- @sapphire/async-queue：[对应 npm gitHead 的 MIT](https://github.com/sapphiredev/utilities/blob/36268acb83cc613e06836f6ebbdafeeba99c2365/LICENSE.md)。
- type-fest 2.19.0：[固定提交 MIT](https://github.com/sindresorhus/type-fest/blob/d07df21f8b79e35ad8411cb9ceb8b5cb8f40f9d4/license-mit)和 [CC0](https://github.com/sindresorhus/type-fest/blob/d07df21f8b79e35ad8411cb9ceb8b5cb8f40f9d4/license-cc0)。
- boolbase：[固定 ISC 文件](https://github.com/fb55/boolbase/blob/be0bcd8a4e917a0a5895e95b523fbbed05a64871/LICENSE)，该提交版本为 1.0.0，运行文件与包一致。
- got-scraping：[4.2.2 发布提交 manifest](https://github.com/apify/got-scraping/blob/031f04c9b8b1e8c4a18b70c890c31ba913ea59c4/package.json)声明 Apache-2.0；该提交没有完整 LICENSE，补 [Apache 标准全文](https://www.apache.org/licenses/LICENSE-2.0.txt)，未添加推测版权行。
- abstract-logging：[对应发布提交 README](https://github.com/jsumners/abstract-logging/blob/80dfaef91ee87008f4ed2b6e78921d383bccd406/Readme.md)指向其 MIT 许可页。补录当日返回的许可纯文本，页面动态年份不被当作原版本的版权年份。原始获取证据留在 E/license-supplements，运行目录只保留文本。
