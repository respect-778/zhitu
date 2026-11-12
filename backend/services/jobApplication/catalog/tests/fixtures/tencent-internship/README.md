# 腾讯官方实习样本

2026-11-09 通过仓库受控 JSON transport 取得的公开响应。原始正文、字符串岗位 ID 和项目映射保持完整。

- `project-mapping.json` 来自 `https://join.qq.com/api/v1/position/getProjectMapping`。
- `list.json` 来自 `https://join.qq.com/api/v1/position/searchPosition`，POST 查询项目映射 `[2,104,20]`，第一页两条记录。
- `ordinary-detail.json` 来自 `https://join.qq.com/api/v1/jobDetails/getJobDetailsByPostId?postId=1200791473415778304`。
- `qingyun-detail.json` 来自 `https://join.qq.com/api/v1/jobDetails/getJobDetailsByPostId?postId=1231829074687944824`。

测试对这些响应进行纯本地解析，合成分页测试明确标记为 synthetic。
