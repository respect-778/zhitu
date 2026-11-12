# 来源能力矩阵

核对日期为 2026-11-09。

| 来源 | 范围与入口 | 已核对能力 | 待验证项目 |
|---|---|---|---|
| 腾讯招聘 | careers.tencent.com，native SourceID=1，全部类别，校招入口单独接入 | T06 实际 2 页／4 条完整详情；官方 PostURL 与准确 ID 深链一致；T07 两次正式入库；T08 显式发布4条并通过实际只读API筛选／详情；固定回归覆盖 2001 条／21 页及异常完整性 | 全站完整采集、浏览器详情渲染、实习／校招识别、网页查询接入 |
| 人社部所属单位招聘公告 | mohrss.gov.cn，单篇 2026 年度所属单位招聘公告 | 官方页面搜索索引缓存包含标题、发布日期、共同条件、报名入口和两份 XLSX 附件名称，观察记录见 mohrss-index-observation.json | 本机返回验证页面，正文与附件实际内容待直接核对，历史公告到期处理 |
| 深圳人社备用公告 | hrss.sz.gov.cn，单篇事业单位招聘公告 | 官方搜索可定位公告 | 本机 TLS 握手失败，正文及附件尚待直接验证 |

腾讯 T01 样本入口为 https://careers.tencent.com/tencentcareer/api/post/Query?language=zh-cn&pageIndex=1&pageSize=2 ，样本岗位编号为 2093163274496552960 与 2006301643183902720。T06 于 2026-11-09 15:35（Asia/Shanghai）实际验证 `tencent-native-v1`：原始总量 2191，读取 4 条，明确 `partial/max_pages`；采样中包括算法、策划、DBA，不能以此宣称全站覆盖。T07 将这4条写入专属测试库并验证幂等；T08 已按明确UUID和共享门槛发布四条，实际reader API可查询，来源采集开关仍disabled。见 [T06 review](reviews/T06.md)、[T07 review](reviews/T07.md)、[T08 review](reviews/T08.md)。

人社部样本入口为 https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/rcrs_4225/sydwrsgl/202603/t20260305_567916.html 。此公告属于历史样本，展示状态由实际报名截止日期决定。

深圳备用入口为 https://hrss.sz.gov.cn/gzryzk/content/post_12516345.html 。
