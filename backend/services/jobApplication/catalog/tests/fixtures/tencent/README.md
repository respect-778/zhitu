# 腾讯固定公开响应

采集日期 2026-11-09，原始证据位于 `outputs/job-catalog-handoff-2026-11-08/evidence/2026-11-09/`，来源与采集结果见其中 fetch-report.json。本目录仅保存两份 JSON 原始字节；测试修改副本生成的 SourceID=4、异常、分页等数据均为合成数据，不代表源站实测内容。

| 文件 | 官方请求 | SHA-256 |
|---|---|---|
| list.json | https://careers.tencent.com/tencentcareer/api/post/Query?language=zh-cn&pageIndex=1&pageSize=2 | 824e2e66beef2978f295115d103b1ada9245db630dcda22048f8b153b6842603 |
| detail.json | https://careers.tencent.com/tencentcareer/api/post/ByPostId?postId=2093163274496552960&language=zh-cn | 101cb53b89282861fc462e2972b720e7cac61d20d49392f0336a5408fc3d0925 |

list.json 原始 Count=2191，仅含 pageSize=2 的样本，不能据此宣称完整采集。第一条为微信支付平台运营岗位，第二条为客户端开发岗位。详情 PostURL 原始为 HTTP；T01 另有对应 HTTPS 官方详情壳页面证据，单独 HTML 壳不证明页面渲染已核验。
