# 开源模块迁移账本

## Tencent 适配模块

T06 已完成 TypeScript 迁移、独立规格／质量审查、扫描及受限真实核对。审查日期为 2026-11-09；完整记录见 [reviews/T06.md](reviews/T06.md)。来源默认关闭，尚未入库或发布。

- 上游为 freehire，固定提交 4ac57f6902788f6e5982ddc4f91ab9855d946b5a。
- 文件为 internal/ingest/sources/tencent.go，本地目标为 src/adapters/tencent.ts。
- 原始文件 SHA-256 为 e0ace6f206a9f8e480506f309d54c40fc1d0e437d7389442017fe7e6aa398939。
- LICENSE 的 SHA-256 为 867d48cfa3b4f92b1aeb331ad62a8919c732ebc273a16b9414fbcd1926a42328。许可证为 MIT，版权声明归 freehire contributors。
- 输入为公开岗位列表与详情 JSON。输出映射到本地岗位契约，PostId 保持字符串。
- 复用范围为请求参数、响应形状、SourceID=1 的来源身份、详情 ID 一致性和深链构造。

永久来源为 https://github.com/strelov1/freehire/blob/4ac57f6902788f6e5982ddc4f91ab9855d946b5a/internal/ingest/sources/tencent.go 。许可证来源为同一提交下的 LICENSE。

## 依赖与安全审查

已逐行阅读 8043 字节的源文件。直接标准库依赖为 context、fmt、log、net/url、regexp、strconv、strings、time。项目内依赖为 location.NormalizeCountry、JSONGetter、fetchDetails、firstNonEmpty、plainTextToHTML、sanitizeHTML、distinctJoin、parseLayout 及业务结构。

迁移已自行实现本地网络接口与字段映射，上述项目内运行代码均排除于复制范围，因此本模块引入的上游运行时依赖闭包仅为经审查的参数、验证及映射逻辑。Crawlee 等实际依赖沿用 T04/T05 的固定锁文件与审查记录，T06 没有新增 npm 依赖。

此文件的外联常量只有 careers.tencent.com 上的 Query、ByPostId 与岗位详情地址。列表请求发送时间戳、类别、分页和语言，用于获取公开岗位列表。详情请求发送时间戳、公开岗位 ID 和语言，用于补充岗位条件。岗位详情 URL 仅作为输出。请求通过上游注入的 JSONGetter 发出，其具体实现待本地受控网络层替代。该文件没有读取源码目录、环境变量或凭据的调用，没有进程启动、动态代码加载、后台定时、遥测或自动更新逻辑。这个结论仅覆盖指定文件及限定迁移范围。

迁移前 T02 操作仅下载和读取固定文本；至 T06 仍未执行原 Go 模块、安装脚本或上游服务。迁移后的本地代码另经 T06 静态审查、离线扫描及隔离运行；不能将最初的单文件审查扩大为对整个上游项目的结论。

## 有意差异及回归义务

| 上游行为 | 本地要求 | 回归样本 |
|---|---|---|
| 技术类别固定 40001 | 类别范围可配置，首个来源覆盖全部类别 | 产品运营与技术岗位同时保留 |
| 单页最多 2000 条 | 逐页读取并核对总量、重复页和停止原因 | 超过 2000、重复页、部分失败 |
| 已见岗位仅更新时间 | 详情按更新策略重新核验 | 职责或条件改变后刷新 |
| LastUpdateTime 写入 PostedAt | 映射 source_updated_at，published_at 保留未知 | 来源仅有更新时间 |
| 丢弃 SourceID=4 | 明确 native 来源范围，另记范围外计数 | 混合 native／Workday 样本 |
| 只有英文时间与位置 | 使用中文响应并保存原文与时间精度 | 2026年11月09日、未知日期 |

| 后续模块 | 明确修正动作 | 必备回归样本 | 状态 |
|---|---|---|---|
| 飞书 | 去除固定研发限定，按租户发现招聘分类 | 同租户产品／运营及研发岗位 | 待开发 |
| Moka | 按来源区分社招和校招路径，构造经核对的岗位深链 | 一条社招、一条校招及错误频道链接 | 待开发 |
| 北森 | 招聘类型改为可验证配置，补准确岗位详情或申请链接 | 社招默认边界、校招参数、列表页误用 | 待开发 |
| 腾讯校招 | 单独核对大陆校招入口与身份映射 | 校招岗位及普通官网转录的 Workday 岗位 | 待开发 |

## 证据与发布条件

根目录 evidence/2026-11-09 下保存固定源码、许可证、腾讯列表／详情样本及 fetch-report.json，完整相对前缀为 outputs/job-catalog-handoff-2026-11-08/。

本地适配器为 src/adapters/tencent.ts，请求安全层为 src/http/，单轮采集为 src/worker/run-tencent.ts。没有复制原 Go 服务或引入新的 npm 依赖；保留固定提交 MIT 来源。已移除技术类别限定、单页 2000 限制和“已见只更新时间”捷径，SourceID=4 使用逐条字段证据计数。列表与详情公开字段之外无外发内容；本地没有凭据读取、进程启动或遥测调用。纯解析、分页与安全边界回归在 tests/adapter-first.test.ts、tests/http-boundary.test.ts；详细实现边界见 tencent-adapter.md。

T06 本地代码及样本哈希为上述证据目录中的 `T06-source-manifest.json`。当时断网测试 58 通过、1 项数据库测试明确跳过；类型检查通过。2026-11-09 15:35 的受控真实采样读到 2 页、4 条详情，原始总量 2191，报告明确 `partial/max_pages`；T06 采集进程不入库。`runtime-validation/t06-live/` 保存正式 CLI 结果、限制参数、容器配置和系统调用；`t06-deeplink/` 的官方 PostURL 与迁移后的精确岗位 ID 链接一致。详情页 CDN 脚本返回 403，未宣称浏览器渲染核验通过。每次升级重新核对来源及依赖变化。

T07 新增本地清洗和锁内事务合并，没有复制新上游模块或新增依赖。独立规格／质量审查及最终 16 项数据库回归通过；上述真实 capture 首次入库 4 条、重跑新增 0 条、UUID 和原字段回读一致，当时岗位保持 hidden。输入来源与分页证据关联、保守学历提取、证据保留和异常文本资源边界见 [T07 review](reviews/T07.md)，代码 SHA256 见 `T07-source-manifest.json`。

T08 新增本地只读 API 与独立显式发布命令，没有引入新的上游模块、依赖或结构迁移。真实四条已通过统一门槛在测试库发布，reader实际31项HTTP检查通过，保留partial采样范围；审查关闭发布状态变化的3字节限额边界，证据见 [T08 review](reviews/T08.md)、`T08-source-manifest.json`。网页与生产部署仍未完成。

T09 当前网页已接入这四条真实样本，60项浏览器回归及根构建通过；没有复制新的上游模块或增加依赖。清洗、数据库UUID、API和网页精确官方岗位href对应，截图与哈希见 `T09-live-browser.json`、`T09-source-manifest.json`。阶段功能可测试，最终安全修复的独立复审因工具安全策略中断而仍未通过；工作树未提交，完整验收及生产部署仍未完成，见 [T09 review](reviews/T09.md)。
