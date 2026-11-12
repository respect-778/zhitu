# Tencent 原生社招来源与网络边界（T06）

本地实现位于 `src/adapters/tencent.ts`、`src/worker/run-tencent.ts`、`src/http/`。T06 独立复审、固定样本回归、源码扫描和受限真实验证已完成，结果与覆盖限制见 [reviews/T06.md](reviews/T06.md)。没有新增运行依赖，没有调用数据库。

## 范围、字段和完整性

研究清单 `config/sources/initial.json` 由加载器显式把 id 映射到 sourceId；nativeSourceId/status 留在研究元数据层。来源、公司、语言、社招范围与精确官方主机一并检查。仅实现 careers.tencent.com 的 native SourceID=1；SourceID=4 必须同时具备合法身份、标题和有效标记才作为范围外排除，每条带实际列表页与 JSON 字段定位。未知 SourceID、失效、破损记录记 rejected，重复身份优先记 duplicateIds。

请求参数保留公开 pageIndex/pageSize、postId、zh-cn 语言；移除上游固定技术类别 40001，不发送凭据或工作区数据。官方 HTTPS 深链模板已在 T01 样本中核对；响应中的任意 PostURL 不作为抓取目标，也不自动变成 applyUrl。大陆校招与 Workday 不在本次覆盖范围。employmentType 没有足够字段证据，保持 unknown；不根据标题推断校招、毕业届次或截止时间。

列表逐页读取；先验证 Code=200、Data、Count、Posts，再对原始条目分别计数。保持第一页原始总量，后续总量变化立即阻止完整声明。每页应有的条数由页码、页大小和原始总量核对，跨页及页内重复均阻止完整声明。空范围仅在 Count=0 且 Posts=[] 时完整。每次记录的 accepted + rejected + duplicateIds + excluded 必须等于 recordsSeen，只有 accepted + excluded 等于原始 Count 且无失败才能 complete。

所有详情每轮重新读取，要求返回 PostId 与请求一致、SourceID=1、职责和要求非空；源站有 IsValid 时必须为 true。LastUpdateTime 只映射 sourceUpdatedAt，原文与日精度保留；不可解析日期保留原文，值和精度为 null。招聘事实 open 来自有效列表和详情，verificationStatus=verified 来自本轮成功读取，visibility 仍是 hidden。首次发布政策与持久化分别属于 T08/T07。列表页完整与整轮完整分开验证。

## 请求与执行边界

- 使用 Node 标准库 HTTPS GET；不调用 Crawlee sendRequest、got-scraping、浏览器、代理或上游服务。Crawlee 仅承担内存队列、单并发和最多一次重试；关闭持久化、清理、会话池与默认主机采样。保留 T04 对 ambient CRAWLEE_/APIFY_/cwd crawlee.json 的拒绝。
- URL 必须 HTTPS、精确允许主机、标准 443、无用户名／密码／fragment；没有任意请求 headers 接口。固定 Accept/Accept-Encoding/User-Agent，不发送 Cookie、Authorization、环境值；不保存 Set-Cookie。
- 首版只解析 A 记录并使用 IPv4。所有返回的 A 地址均须通过特殊用途地址检查，IPv6／IPv4-mapped 和其他语法拒绝。实际 TLS 连接直接指定已核验的 IPv4，不进行第二次 DNS 查找；不查询 AAAA、关闭 family 自动选择，因此没有未核验的 IPv6 回退路径。这不是 IPv6 安全支持。
- 拒绝表覆盖 [IANA IPv4 Special-Purpose Address Space](https://www.iana.org/assignments/iana-ipv4-special-registry/)（2025-10-09 更新，2026-11-09 核对）所有特殊用途条目，额外拒绝 224.0.0.0/4 组播。192.0.0.0/24 与三段特殊 anycast 整段保守拒绝。普通公网地址仍须满足官方主机 TLS 身份和独立部署出口规则；IP 判断不是来源真实性证明。
- 每跳创建独立 HTTPS Agent，`proxyEnv:{}`、keepAlive=false、无 TLS session cache；自定义 createConnection 在实际 TCP 地址和 TLS 身份都验证成功之前返回 undefined，验证后才通过 callback 交给 HTTP 客户端，防止 GET 先行。TLS 固定 `rejectUnauthorized:true`、最低 TLS1.2、内置 rootCertificates、默认 checkServerIdentity 与官方 SNI。
- 每跳再次核对 URL、DNS 和实际 peer，单次调用最多重定向 3 次（合计最多 4 个 GET）。整体 15 秒涵盖 DNS／全部跳转，独立 Resolver 超时并在整体取消时 cancel；TCP/TLS 连接 5 秒，头部／响应体空闲 5 秒。每次列表／详情读取及失败重试调用的起点至少间隔 1 秒；单次调用中的重定向逐跳安全校验，当前不单独限速。
- 头部最多 16 KiB，响应最多 2 MiB；不接受压缩（只请求 identity，gzip/br 等响应直接拒绝），避免解压炸弹。严格 HTTP 解析、JSON Content-Type、UTF-8 解码和 JSON 解析；读取体过程中逐块检查累计大小。此阶段不支持压缩或二进制附件。
- 网络与解析错误只转换固定代码，Crawlee 日志关闭；CLI 不打印原始错误、堆栈、Cookie 或环境值。业务输出包含公开岗位正文、官方 URL 和计数，适用于本地验证，不上传源代码。

入口在动态加载采集／TLS代码前拒绝 NODE_OPTIONS、TLS 信任／keylog、代理环境等。运行时保护发生在 Node 启动之后，无法撤销 NODE_OPTIONS 预加载或宿主启动配置造成的动作；真实执行必须由干净启动器／隔离容器提供最小环境、只读限域挂载和网络出口，不能把此检查当作 OS 沙箱。依赖 ow 的源码诊断读取能力以及其它既有依赖边界仍以 T04 审查为准。

## 回归与剩余验证

`tests/fixtures/tencent/list.json` 和 `detail.json` 是 T01 保留的真实公开响应，见相邻 README 的 hash；普通测试只读本地样本、不请求腾讯。模拟样本覆盖运营与技术、两次详情更新、混合／全部范围外、空范围、重复页／身份、失效／未知类型、总量变化／缺口／上限、错误详情身份与网络重试。

`tests/http-boundary.test.ts` 注入受控 DNS、TLS socket 和 transport，检查传入真实连接参数及交付 HTTP socket 的时机；不放开任何私网策略。覆盖特殊用途地址、编码 IP、未知主机、重定向重绑定、错误 peer／TLS、压缩、字节上限、坏 JSON 与各类超时。主任务另完成真实证书校验、OS 出口、文件访问与子进程观察，mock 不替代这些独立证据。真实坏证书、断流和长期 FD 压力测试尚未执行。

采样结果全部在内存中，verify 限制 10 页／每页 25 条／250 个详情；详情预算不足启动即拒绝。完整源运行器仍有明确上限（1,000 页、每页 100 条、100,000 个详情），来源默认关闭；T07 接入持久化时需继续评估流式处理与资源限额。测试 getter 只能作为代码级注入，无 CLI 注入选项，输出明确 synthetic=true。未来调度／关闭未见岗位不由本阶段处理。
