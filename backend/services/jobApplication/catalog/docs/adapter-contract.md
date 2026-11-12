# 岗位与采集边界契约（T03）

入口为 `contracts/index.ts`。`JobSchema`、`SourceConfigSchema`、`ListPageSchema`、`RunReportSchema` 的 `.parse(input: unknown)` 验证数据并返回新对象；不合法时抛出带字段路径的 `ContractError`。TypeScript 类型直接从同一 schema 推导，不另建可能漂移的 interface。岗位引用、日期、证据和枚举也导出 schema。

本契约独立于 BOSS 扩展模型。代码自写、零新增依赖、无 Node 私有模块、无网络、无文件读取与执行逻辑，可供前后端共享。它只验证结构和字段间一致性；可信来源、内容清洗、真实页面判断、持久化、发布流程及下架策略由后续任务实现。

## 不可信输入与缺失值

- 所有 HTTP JSON、存储记录和消息输入在进入业务逻辑前以 `unknown` 接收，再调用适用 schema。来源特有响应先由适配器验证所使用的原始字段，再映射到本契约并验证；腾讯的 `{ Code, Data }` 不能直接当作 `Job`。
- 不做数值转字符串、默认枚举、日期补全或自动补链接。未知字段、非普通对象和访问器被拒绝，避免原始响应或私有字段混入共享对象。返回值不含输入对象引用。
- 数组只接受普通、稠密、自有可枚举数据元素，不接受自定义 iterator、索引访问器、额外属性、符号属性或自定义原型；按属性描述符读取，不调用输入的迭代器或 getter，并检查实际输出长度。适配器应传入 JSON 数据，不将任意可执行对象／Proxy 当作外部响应；此校验器不承诺对任意 Proxy 的反射操作绝对无副作用。
- 必填且可缺失的来源字段使用显式 `null`，表示当前证据未提供可用值；不允许省略。空字符串不是缺失值。可选标准字段（城市、学历、薪资）未确定时省略，并保留原文。分类无法确定用各自的 `unknown`。
- `sourceId + sourceJobId` 是身份二元组；两者必须是原样字符串，不转换为数字。腾讯样本 `2093163274496552960` 超出安全整数范围。`scopeKey` 表示本次租户、频道、类别等覆盖范围，不参与岗位身份。

## 岗位、证据与链接

`Job` 必须含公司／招聘单位、名称、正文三项 `responsibilities` / `requirements` / `applicationInstructions`、来源地址、独立的类型／状态、时间与非空证据。正文各项可为 `null`，不能为简短展示截断报名条件或材料要求。城市／学历／薪资原文与可选标准字段分离；存在标准字段时必须保留对应原文。薪资范围必须非负且下界不大于上界。

| 字段 | 含义 |
| --- | --- |
| `employmentType` | `internship / full_time / part_time / unknown`，与招聘渠道独立 |
| `recruitmentChannel` | `campus / social / unknown`，允许“校招＋实习” |
| `recruitmentStatus` | `open / closed / expired / unknown`，招聘事实 |
| `verificationStatus` | `verified / pending / unreachable / parse_failed`，最近核验结果 |
| `visibility` | `published / review / hidden`，展示决策 |
| `sourceUrl` | 可核对的原始官方页面或来源接口 |
| `detailUrl` | 岗位详情；未知为 `null` |
| `applyUrl` | 经确认用途为报名表的 HTTP(S) 地址；未知为 `null`，不从详情自动复制 |
| `applicationMethod` | `web_form / email / offline / instructions / unknown` |

`web_form` 必须有申请链接；其他方式使用报名说明，邮件、线下和说明方式必须保存说明正文。同一页面确实兼具详情与报名表时两 URL 可相同，必须由适配器确认。HTTP(S) 链接不能携带用户名／密码，不接受 `javascript:` 或 `mailto:`；邮箱保留在报名说明内。链接语法校验不是网络抓取授权，后续请求层仍须校验目标主机、重定向、DNS／IP 与出口范围。

明确关闭／过期的岗位不能 `published`；已发布但临时 `unreachable` 的岗位可保留原招聘事实和真实的 `lastVerifiedAt`。`verified` 需要核验时间，恢复 `open` 后 `closedAt` 应清空。`published` 至少需要详情地址或报名说明。首次发布的可信来源门槛和失败后的保留期限不由结构校验代替。

`evidence` 每项包含 `sourceUrl`、实际 `observedAt`、`parserVersion`，可增加不含私有存储路径的 `artifactId` 和来源定位 `locator`（如 JSON 路径、PDF 页码／表格行描述）。附件持久化尚未建立，不能为满足字段虚构 artifact。完整原始响应不放入此契约。

## 时间语义

`publishedAt`、`sourceUpdatedAt`、`deadlineAt` 均为 `SourceDate | null`，互不替代。日期对象保存 `raw`、`value`、`precision` 和 `timezone`（来源时区原文或已确认标识；未知为 `null`）。`day` 仅允许真实的 `YYYY-MM-DD`，`second` 要求带时区偏移的 RFC3339 秒精度时间。无法解析但有日期原文时，保留对象并将 `value` 与 `precision` 同时置 `null`；不能用采集时间填补。

仅日期的截止时间不得转换成当日零点或提前判过期。来源时区可能未知，跨字段日期没有足够精度／时区信息时不自动排序或推断状态。来源更新时间不代表发布时间；腾讯 `LastUpdateTime` 只映射 `sourceUpdatedAt`。

系统的 `firstSeenAt`、`lastSeenAt`、`lastVerifiedAt`、`closedAt` 使用带偏移的真实 RFC3339 时间，首次发现不能晚于最后发现。采集和核验不刷新发布日期。未知发布时间、薪资和截止日期不会阻止合法岗位入库。

## 来源、分页与运行完整性

`SourceConfig` 指定 `sourceId`、`kind`（`enterprise / announcement`）、`adapter`、`entryUrl`、精确 `allowedHosts`、`scopeKey`、招聘渠道、可为 `null` 的公司和 `enabled`。入口必须属于允许主机。来源配置是运营输入，也必须运行时验证。T02 的 `config/sources/initial.json` 是研究清单：加载器需显式将 `id` 映射 `sourceId`、缺失公司映射 `null`，并单独处理 `status/nativeSourceId` 元数据，不能直接强转为本契约；本任务不改动该清单。

`ListPage` 包含 `sourceId`、`scopeKey`、岗位引用、`excluded/exclusions`、`reportedTotal`、`nextCursor`、`hasMore`、`completeness` 和 `stopReason`。`reportedTotal` 始终保存来源对该请求分页链报告的原始总量，即本地范围排除前的总数；未知为 `null`，不能改写为本地接受量。游标是不透明字符串。`complete` 表示该分页链的末页已确认耗尽，要求 `hasMore=false`、游标为 `null`、原因 `exhausted`；它不单独证明整次运行完整。中间页是 `partial + more_pages`，必须有后续游标；无法确认终点是 `partial + unknown_end`。遇到上限是 `partial + max_pages`。岗位引用不能混入其他来源或重复身份；合法范围外记录由独立排除字段传递给运行器。

`ListPage` 与 `RunReport` 都必须给出 `excluded` 和 `exclusions`；无排除时为 `0` 和 `[]`。每个排除组保存正整数 `count`、固定原因 `outside_scope`、当前采集规则的稳定版本标识 `ruleId`，以及 `evidence`。证据除原有 URL／观察时间／解析器版本外，必须有能定位判定字段的 `locator`；各组计数之和必须等于 `excluded`。只有原始字段已验证、能按当前范围规则证明不属于目标范围的记录才能排除，解析失败、未知类型、分页上限或访问失败不能归入此类。规则标识须对应适配器／配置中的实际规则，证据须来自实际响应；schema 验证结构，真实分类依据由适配器验证。

`RunReport` 按单一 `sourceId + scopeKey` 记录运行状态和实际统计。`recordsSeen` 是原始条目数；`accepted`、`rejected`、`duplicateIds`、`excluded` 是互斥计数（重复项先归重复，其余才归接受／拒绝／有据排除），结束时四者之和必须等于 `recordsSeen`；运行中可暂有尚待处理记录。`requestFailures` 是未恢复、影响本次覆盖的关键请求失败数，成功重试不累计在此处。完全失败且未读取页面允许零页面零记录。

只有 `status=complete` 才能 `coverageComplete=true`，并且必须实际读过页面、确认耗尽、无未恢复请求失败／拒绝／重复身份、`accepted + excluded` 与已知原始总量一致。腾讯 native 范围的原始列表若有 1 条 `SourceID=1` 和 1 条 `SourceID=4`，则 `recordsSeen=2, accepted=1, excluded=1, reportedTotal=2`；正常耗尽且排除依据齐全可完整成功。全部属于已知范围外时可以 `accepted=0`，但仍保留原始总量与全部排除依据。这不表示范围外岗位已经被采集或可以据此改变其状态。

`running` 不得有结束时间和停止原因；其余状态须有结束时间和明确原因。取消状态与 `cancelled` 原因对应。达到 `max_pages`、请求失败、解析失败、重复页、总量不符、实际分页范围与预期不符、未知终点均不能宣称完整；明确且有据的记录级范围外排除不等于分页范围错误。

运行器须比较每页的 `sourceId/scopeKey`、跟踪跨页重复和循环游标、累计缺口，结束时再验证报告；单个对象校验不能证明运行器的历史记录真实。部分采集不允许据此推断未读岗位关闭。首次正常读到零条可以形成完整“空范围”报告，但空列表本身不能证明岗位关闭。

## 本任务验证边界

使用合成数据覆盖合法与缺失字段、19 位身份、状态独立性、日期精度／非法日期、链接用途、薪资矛盾、分页与运行完整性，以及 native／Workday 混合、全部范围外、有据排除后仍有缺口和排除依据缺失。Node 24 可直接执行 `node --test catalog/tests/contracts.test.ts`。契约只依赖标准 JavaScript；实际来源访问、原始响应解析、来源策略与网络安全、数据库、API 和 UI 在后续任务验证。
