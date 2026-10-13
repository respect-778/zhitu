# Context

用户已认可服务器 + 文件夹、两模块共用个人资料目录，此前要求先只修复第四项；第四项完成后，本轮明确授权下一个问题实施和验收。

当前为 codex/workspace-citation-integrity。学习规划采用 MySQL JSON + revision + WorkspaceSaveQueue；简历采用每用户 localStorage 数组，还没有服务器接口。使用现有队列，避免重复实现并发保存机制。

目录句柄可序列化到 IndexedDB；句柄不等于持续授权。权限请求必须来自用户点击，后台只 queryPermission。不支持选择目录的浏览器仍可使用云端保存。

原始官方说明：https://developer.chrome.com/docs/capabilities/web-apis/file-system-access （本轮直接读取 HTTP 200，核实 IndexedDB 与权限 API）。
