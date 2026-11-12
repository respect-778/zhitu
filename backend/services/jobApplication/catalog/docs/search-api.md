# T08 只读岗位查询与显式发布

API 只访问独立 catalog 数据库。正式启动由固定 `loadTencentSource()` 配置建立可信来源策略，当前仅支持腾讯原生社招采样；没有人社查询适配、完整全站覆盖或自动采集承诺。来源 `enabled` 是采集开关，不决定现有岗位是否可信，也不会被查询或发布改为 true。数据库中的任意 source 行不能自行成为可信来源。

## HTTP 契约

| 路由 | 成功响应 | 无数据 |
| --- | --- | --- |
| `GET /api/catalog/v1/jobs` | `{items,total,page,pageSize}` | 200，`items: []`，`total: 0`；超出尾页时保留实际 total |
| `GET /api/catalog/v1/jobs/:id` | `{item}` | 合法 UUID 但未发布、不可信、已关闭或不存在均为 404 `JOB_NOT_FOUND` |
| `GET /api/catalog/v1/sources` | `{items}`，仅可信配置与存储身份一致的来源摘要 | 200，空 items；不以此声明来源覆盖完整 |

列表支持下列 query；详情和 sources 不接受 query。每个参数最多一次，未知参数、非法百分号或 UTF-8、空值、首尾空格和控制字符均为 400 `INVALID_REQUEST`。原始 query 上限 4,096 字符。

| 参数 | 规则 |
| --- | --- |
| `q` | 1–120 个 Unicode 字符，匹配标题、企业、职责或要求；大小写不敏感，`%`、`_`、反斜线均按字面文本 |
| `city` | 六位城市编码，精确匹配已归一化 cityCodes |
| `degree` | `none/secondary/associate/bachelor/master/doctorate/unknown`；具体学历只匹配该明确值，unknown 仅匹配 null |
| `employmentType` | `internship/full_time/part_time/unknown` |
| `recruitmentChannel` | `campus/social/unknown`，独立于用工类型 |
| `sourceKind` | `enterprise/announcement`；当前可信配置没有 announcement，结果为空 |
| `sourceId` | 1–64 个小写 ASCII 字母、数字、下划线或连字符，首字符须为字母或数字 |
| `page` | 1–10,000，默认 1，无前导零 |
| `pageSize` | 1–50，默认 20，无前导零 |

所有条件通过 Prisma 参数化查询组合，没有请求输入构造的 SQL。count 和 items 使用同一 where，在 PostgreSQL `REPEATABLE READ`、`READ ONLY` 事务内读取。排序为 firstSeenAt 倒序、UUID 升序；这是稳定的观察顺序，不冒充源站发布日期。跨请求期间数据发生变动不承诺页码快照冻结。

响应 DTO 定义在纯浏览器安全的 `contracts/search.ts`。列表只含摘要，详情保留完整职责、要求和报名说明，不返回 evidence、locator、parser、原始上游响应、内部路径或来源后台配置。未知学历、工资、日期为 null，未知类型保持 unknown。没有 web_form 时 applyUrl 仍为 null，真实详情链接不冒充申请表单，也不回退官网首页。

未配置数据库或查询失败返回 503 `CATALOG_UNAVAILABLE`，不会伪装成零岗位。列表中待返回的 published 数据损坏或不满足发布规则时，整次请求失败，不静默跳过再返回错误 total。HTTP 错误只含固定 code/message；普通错误、未知路由、框架路由解析失败均不回显请求 URL 或数据库诊断。

## 发布门槛

`src/storage/publication-policy.ts` 是唯一发布资格规则，发布函数与读响应共同使用它。要求可信且身份匹配的来源、稳定 sourceJobId、企业与标题、完整职责及要求、原始地点、可核对详情或报名说明、verified 和实际核验时间、非 closed/expired、无 closedAt、无 T07 reviewReasons。腾讯还严格匹配岗位 ID 对应的详情和证据 URL，拒绝首页、他岗链接和未经证实的申请链接。review 记录必须先修复并重新入库，不允许此入口直接越过 review。

发布日期、薪资、学历缺失及就业类型 unknown 不阻止满足其他规则的岗位发布；它们不会命中具体值筛选。来源身份比较忽略 enabled，其他配置字段均须匹配固定策略。hidden 可以显式发布，published 重复发布为幂等无写入。

发布和读响应使用相同大小门槛：标题最多 200 个 Unicode 字符、企业最多 120 个；完整 Job JSON 按最终 `visibility: published` 形态计量，最多 128 KiB，公共摘要 JSON 最多 8 KiB（均按 UTF-8 字节计量）。摘要投影由大小校验与列表输出共用，最多 50 条一页。超限记录拒绝发布，已发布超限记录查询失败为 503；库中原文保持不变，不静默截断岗位条件。详情仍返回已获准记录的完整内容。

仅在已审 Linux 隔离环境，使用 **writer** 凭据与明确的一个来源、1–100 个不重复内部 UUID 运行：

```text
node src/storage/publish-cli.ts --source tencent-native --ids <uuid-1>,<uuid-2>
```

workspace 提供 `npm run publish -- --source tencent-native --ids ...`。没有任意主机、路径、SQL 或批量“全部发布”参数。一次请求在同源行锁与单事务内验证全部指定记录，任一不合格或不存在则全部回滚。成功仅修改指定 hidden 岗位的 visibility；不生成发布日期、不启用来源、不采集。只有固定汇总和错误码写入 stdout/stderr。API 没有公开管理或写路由，GET 永不发布。

T07 后续采集入库仍会保守地将记录设回 hidden/review，需要再次显式审核发布。当前没有自动运营审核、生命周期调度或发布队列。

## 启动与验证边界

`api/main.ts` 只构造 `createCatalogClient('read')`，writer/migrator 凭据不能启动查询客户端；进程只应获得 reader 凭据。未设置数据库 URL 时 API 仍能提供 liveness，但查询返回 503。`/health` 总是 `ready: false`，database 仅表明 configured/not-configured，query 为 implemented、collection 为 separate-worker；不替代数据库连通性测试。`/ready` 仍未实现。关闭时断开 reader。

默认监听 `127.0.0.1:5198`。唯一容器绑定选项是 `CATALOG_API_BIND=container`，同时要求 Linux 与 `CATALOG_DATABASE_ENDPOINT=container`，固定监听 `0.0.0.0`；不接受任意 host。隔离容器发布端口必须由运行环境仅绑定宿主 `127.0.0.1`，本选项本身不建立防火墙或容器安全边界。

`search-api.test.ts` 与 `search-storage.test.ts` 为离线 inject/策略/查询结构测试。`db-search.test.ts` 默认明确跳过；`CATALOG_DB_TEST=1` 与专属测试 writer 环境才执行真实查询、固定样本组合、发布原子性/幂等、分页及损坏数据回归。每次创建随机 `t08-<uuid>` 来源，finally 精确删除自己的 fixtures；不修改腾讯原始四条或 T05 备份样本。真实 reader 权限、隔离启动和真实样本发布由主任务单独验证，离线通过不能替代这些证据。
