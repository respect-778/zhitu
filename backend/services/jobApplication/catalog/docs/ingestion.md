# T07：离线清洗与逐条入库

采集与入库是两个进程。T06 `verify` 输出 JSON，保持 `persisted: false`；T07 `ingest` 从明确指定的单个文件读取该结果，验证后才加载数据库 driver，不导入 HTTP 或 Crawlee。输入里的 URL 仅作证据和字段校验，绝不触发请求。API、前端、发布、下架与定时任务仍不属于本阶段。

## 入口和执行环境

workspace 命令：

```text
npm run ingest --workspace=@knowvia/job-catalog -- --source tencent-native --input /input/capture.json
```

正式文件读取仅支持 Linux；Windows 命令会返回固定 `PLATFORM_UNSUPPORTED`，不会尝试读取输入或连接数据库。原因是当前 Node 文件接口无法确认 Windows 全部 reparse 类型；不以一般 symlink 检查冒充这一保证。正式数据库网络仍遵循 T05 的两个测试库、固定端点和三角色限制。

在已有的已审隔离环境中，PowerShell 可执行以下命令。`--env-file` 直接交 Docker，禁止打开、复制或打印凭据值。示例只挂一个已有采样文件；镜像、模块、生成 Prisma 客户端、专属数据库和 internal network 须由主任务预先准备，不自动安装或迁移：

```powershell
$catalogEvidence = 'D:/knownai/outputs/job-catalog-handoff-2026-11-08/evidence/2026-11-09'
docker run --rm --read-only --user 1000:1000 --cap-drop ALL --security-opt no-new-privileges `
  --memory 512m --cpus 1 --pids-limit 64 --network knowvia-catalog-test-20261109 `
  --env-file "$catalogEvidence/db-runtime/private/container-catalog_writer.env" `
  --mount 'type=bind,source=D:/knownai/ai-job-application/catalog,target=/work/catalog,readonly' `
  --mount "type=bind,source=$catalogEvidence/workspace-lock-review-t05/node_modules,target=/work/node_modules,readonly" `
  --mount "type=bind,source=$catalogEvidence/runtime-validation/t06-live/result.json,target=/input/capture.json,readonly" `
  --workdir /work/catalog `
  sha256:4ebdf3cd2cbd505cc9567610fe601723be732d99ad536300d02b9d9797d47158 `
  node src/worker/ingest-capture.ts --source tencent-native --input /input/capture.json
```

输入上限为 **8 MiB、1,000 条 jobs**；超过直接拒绝，不静默截断。未来大范围采集应生成多份有独立计数的批次，不手动截断 jobs 破坏报告。只接受绝对、规范、非隐藏/凭据/敏感目录下的 `.json` 路径，拒绝目录、symlink 及 symlink 祖先，最终文件使用 `O_NOFOLLOW` 打开并检查 regular file、长度、修改时间及 UTF-8。错误只输出固定码，不回显路径、输入内容、第三方错误或数据库诊断。

逐祖先检查无法抵抗恶意宿主并发替换父目录；**输入目录必须由可信操作员控制，运行时以单个文件只读挂载**。容器 internal network、只读挂载和最小权限是部署边界，不能由文件检查代替。`synthetic: false` 是采集器声明，不是数字签名或第三方真实性证明；只接受可信 T06 进程保存的 capture。`synthetic: true` 正式入口一律拒绝，测试通过显式注入 writer 与合成来源独立运行，不支持绕过参数。

capture 的 mode/persisted/source/report/pages 会先验证。来源必须与仓库可信 `loadTencentSource()` 配置完全一致，collector report 的 source/scope、accepted 与 jobs 数也必须一致；当前 enabled 仍为 false。每条可以通过同一 normalizer 入库的 Job，必须唯一匹配 pages.items 的 sourceId、sourceJobId、detailUrl。替换为未见岗位、重复有效身份、缺少列表证明或错误详情链接都会拒绝整个不可信 envelope；pages[] 没有列表证明时不能入库任何有效岗位。原始 collector report 不能仅凭相同数量为另一个岗位作证。

确定会被同一 normalizer 拒绝的损坏 Job 留在原索引，交给逐条 ingestion 计为 rejected，不因坏行结构不可读而丢失本批其他有列表证明的好项。可选空白字段经过规范后仍可入库，因此也必须通过列表关联，不能借“原 DTO 不符合 JobSchema”绕过这一关。表单/详情/API 证据 URL 受来源域名及腾讯已知详情路径、岗位 ID 关联约束；任意输入主机、端口或凭据 URL 不会成为可用来源。

`collectionReport.status: complete` 另外需要完整分页证据：页数必须等于 pagesRead 且非零，各页原始 total 与报告的非空 total 一致，唯一列表项数量、excluded 合计和逐条 exclusions 证据必须与报告对应，并精确覆盖 recordsSeen。非末页必须是正常 more_pages，腾讯 nextCursor 按 2、3……顺序连接；末页必须 complete/exhausted、hasMore=false 且无 cursor。仅修改 report 不能把 max_pages 采样改称完整。partial 不套用相同终态或总量不变规则，继续允许来源总量变化、后继请求失败、坏页无法生成 ListPage 等情况；但已有的有效岗位仍须有自身列表证明。

## 清洗与未知值

`normalizeJob` 先做 JSON/契约校验。标题、公司名和三段正文仅处理 CR/LF、行内重复空白和多余空行，不删职责、专业、资格、年限、到岗、材料或考试条目。正文始终为纯文本，识别到 HTML 标记时保留字面内容并标为 review，不靠删标签正则修复，也不能在未来 UI 作为 HTML 执行。乱码替换符、孤立代理项、控制字符、职责/要求或结构化地点缺失同样进入 review。纯空白可选文本视为缺失，必填身份和标题不能补造。

`locationRaw`、`educationRaw`、`salaryRaw` 和日期 `raw` 保持原文字面值。缺日期不填采集时间；合法但未解析日期保留 `value/precision: null`。非法日历日期属于结构拒绝。薪资只识别明确币种、简单数额/区间及小时/天/月/年单位，保留币种与周期；面议、K/万、13/16 薪、复合条件不推算，未知不等于零。薪资、日期和用工类型未知本身不阻止入库。

城市只用 `locationRaw` 的明确城市名称/名称列表。标题中的城市不会覆盖结构化地点，未支持的地名保留 raw，cityCodes 留空，不猜全国/远程。有限行政代码采用直辖市整体代码，北京 110000、上海 310000、天津 120000、重庆 500000；其余保留地级市代码，例如深圳 440300、杭州 330100、成都 510100。参考：[深圳政府行政区划代码说明](https://www.sz.gov.cn/ztfw/shbz/wyw_184041/ywzsk_184570/content/post_8533553.html)、[浙江民政地区接口](https://base.zjsmzw.gov.cn/Handler/jqShiHandler.ashx)、[华为 Map 行政代码表](https://developer.huawei.com/consumer/cn/doc/harmonyos-references/map-citycode/)。这是小型静态词表，不加载 SDK 或第三方地理数据。

学历只认明确最低/指定学历；“大专及以上”归 associate，“学历不限”归 none，均不能命中 bachelor。复杂、优先、可替代、冲突学历为 unknown 并进入 review。仅腾讯且 `educationRaw` 缺失时，检查完整 Requirement 的学历上下文，保存所有相关完整原文条目并添加 `$.Data.Requirement;entries=N` 证据定位；不改完整 requirements。不能先丢掉没有“学历/学位”字样的例外，例如下一行“大专且有三年经验亦可”“不限学历”“优秀者可放宽”都会阻止把上一行的本科要求归为唯一硬要求。多个相关条目或不能确认的替代/放宽条件保留为 unknown；没有任何学历提及不会仅凭工作年限例外推造 educationRaw。含专业列表的明确“硕士及以上学历”可识别；同条其他分句中的工作领域“或”不改变学历分句含义。已有 educationRaw 优先。招聘渠道来自明确来源字段，与 employmentType 分离；有实习经历优先不意味着实习用工。

## 存储事务与报告语义

`mergeUpsertJob` 和 T05 完整快照 `upsertJob` 共享同一事务所有者。source upsert 先取得来源行锁，再读当前 Job，按 `sourceId + sourceJobId` 合并并经 JobSchema 复验，最后写入。没有外层先读后写的窗口；同名但不同 ID、城市、渠道或来源不会按标题误合并。

缺失 null/unknown 不清空可靠旧字段。城市/学历/薪资原文与派生值为一组：新原文明确变化时，不能把旧 cityCodes/minimumDegree/salary 带到新原文；解析不了就清空旧派生值。申请方式、专属 URL 和说明按关联组合并；方式明确改变时，新组整体替换旧组，例如 offline 改为 web_form 且新说明为 null，必须清除旧现场指示。方式未变且本次说明缺失，或方式本身未知时，才保留相应可靠旧说明/入口；没有明确申请 URL 不伪造。除这类有明确字段变更依据的关联组替换外，未提供“单独删除某字段”的协议，null 代表本次缺失；未来若来源声明撤回需另行定义证据和协议。

合并后复核最终字段的 review 原因，并写入单条报告。旧的“本科优先”等模糊字段被保留时，不因本轮缺学历字段而把状态改成 hidden；明确新证据修正该字段后可以解除相应原因，不把曾经 review 永久锁死。发布仍属于后续阶段。

旧 observation 晚到不覆盖新内容，但贡献更早 firstSeen；lastSeen 不回退。同源并发同一时间的局部字段在锁内相互保留。已关闭岗位再次 closed 或变为 expired 不刷新原 closedAt；明确重新 open 才清空并开始下一次生命周期。

证据只支撑当前字段，不充当无限事件归档。**未保留任何旧业务字段的完整新快照**才以新证据替换旧证据；局部字段从旧记录保留时，原证据及其 observedAt 原样保留，内容变化才附加本次证据，并按完整证据 JSON 去重。相同内容的 partial 重试只更新时间，不累积新 locator。合并证据上限 128 条；超过返回 `EVIDENCE_LIMIT_EXCEEDED`，该条事务回滚、旧记录不动，需要后续核验，不能把它算 accepted 或截断后声称证据完整。本批其他项照常处理。未来历史版本/证据归档不由本模型假装实现。

当前没有内容版本列，`inserted / updated / duplicate` 按实际业务字段比较；firstSeen/lastSeen/lastVerified/evidence 变化不算内容变更。duplicate 仍刷新观测信息，数据库 updatedAt 因而可能变化，不能把它当内容版本。

每条有效岗位单独事务；一条结构/数据库失败不回滚本批其他成功项。结果同时携带未改写的 `collectionReport` 与独立 `ingestReport`：

- `recordsReceived`：capture.jobs 数，**不是**采集列表 recordsSeen。
- `accepted = inserted + updated + duplicates`：已成功写入/确认的条数；review 是 accepted 的子集。
- `rejected`：结构或写入失败，`accepted + rejected = recordsReceived`。
- `rows[index]`：从零开始的批内位置、固定拒绝原因，能安全取得时附官方详情 URL；不记录原始 error 或无效行正文。
- `status: complete` 只代表本次批处理全部接受，不能覆盖或改变来源的 partial/max_pages 状态；有拒绝以非零退出码结束。重复项不是失败。

合格记录为 hidden，需要核对的有效记录为 review。结构拒绝只存在本次 JSON 报告，**没有持久拒绝队列或运营后台**；调用方应保存报告。这里不发布、不关闭、不删除其他岗位，来源不完整也只处理已拿到的记录。

## 验证

`tests/ingest.test.ts` 验证清洗、raw 原文、正文完整、学历反例、城市/用工/渠道独立、缺字段和关联组合并、逐条失败与重复计数。`tests/ingest-capture.test.ts` 验证边界；Linux 文件测试在 Windows 明确 skip，不能从 Windows 结果宣称已验证 Linux 文件操作。

`tests/db-ingest.test.ts` 默认明确 skip。主任务在专属 internal network 注入 writer 凭据并设 `CATALOG_DB_TEST=1` 后执行，覆盖重复批次、真实数据库单条失败、事务回滚、并发局部合并、早晚 observation、派生值撤销。测试只创建随机 `t07-*` 来源，finally 按确切 IDs 清理自身记录，不清空整库。真实 T06 capture 的正式重复入库与源站字段抽样由主任务单独记录，合成测试不证明真实采集或入库完成。
