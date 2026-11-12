# 岗位批量操作接口

前端类型定义在 `consumer/src/jobActions.ts`。BOSS 的“一键打招呼”调用 `requestJobAction`，全部和企业官网的“一键投递”调用同一客户端。

当前客户端返回 `blocked` 和用户提示。模板与投递执行器接入后，由任务服务处理以下约定。

| 操作 | 约定 HTTP 接口 | action | selection.type |
| --- | --- | --- | --- |
| 批量打招呼 | POST /api/job-actions/v1/greetings | greet | platform_jobs |
| 批量投递 | POST /api/job-actions/v1/applications | apply | selected_jobs |

请求使用 `JobActionRequest`。`version` 为 1，`operationId` 是一次用户操作的 UUID，同时用作 `Idempotency-Key`。重试同一操作时复用它。模板接入 `greetingTemplateId`，简历版本接入 `resumeVersionId`。

首次点击批量操作按钮进入勾选模式。每一行对应一个企业岗位，勾选后再次点击按钮发起操作。已选数量为零时确认按钮禁用。全选只影响当前页，翻页保留已选项，取消选择、重新搜索、修改查询条件或切换来源会清空选择。

确认操作收到客户端返回后，自动清空已选项并退出勾选模式，操作结果提示继续保留。再次点击进入新的勾选流程时，清除上次提示。请求异常时保留选择供重试。

`platform_jobs` 的 jobs 数组保存已勾选的平台岗位快照，字段为 platform、jobId、title、company、jobUrl。BOSS 的 platform 值为 boss，智联为 zhaopin。jobId 为对应平台详情地址中的岗位标识。

`selected_jobs` 的 jobs 数组保存已勾选的官网、公告和平台岗位。数据库岗位使用 source 为 catalog、jobId 为数据库岗位 ID，同时携带 title、company 和可选的 jobUrl。平台岗位使用 source 为 platform，并携带 PlatformJobTarget 的字段。后续任务服务按 source 和岗位身份分配执行器，并逐项返回结果。同一家公司的不同岗位使用各自的岗位 ID。

当前界面采用显式岗位列表约定，空数组返回 INVALID_REQUEST。筛选和分页仅用于展示，最终操作范围由勾选的岗位 ID 决定。

任务服务接受操作后返回 HTTP 202，数据为 `{ operationId, status: "accepted", taskId }`。接受任务后展示进度，实际成功统计应根据执行器确认的逐岗位结果更新。

准备条件不足时返回 HTTP 409，数据采用 `JobActionResponse` 的 blocked 分支，包含 operationId、code 和 message。当前占位客户端使用 GREETING_TEMPLATE_REQUIRED 和 APPLICATION_ADAPTER_UNAVAILABLE。参数错误使用 HTTP 400 与 INVALID_REQUEST。

接入服务时应验证来源与岗位身份、模板或简历的归属，并对 operationId 实现幂等。需要由服务端重新查询官网岗位的有效申请地址。

## 浏览器缓存

各平台最新一次查询的岗位、已核实详情、筛选条件和读取页码保存在当前网站来源的 IndexedDB `knowvia-job-search` 中。BOSS 沿用 latest 键，智联使用 latest:zhaopin 键。打开页面时恢复查询，读取中的状态转为暂停，用户可继续查看或恢复读取。全部来源页面也会展示恢复的平台结果。

缓存保存失败时，岗位页会显示提示。用户清理网站数据会同时清除这些记录。岗位链接的有效性和招聘状态以来源页面为准。
