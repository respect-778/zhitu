# Context

## Why now

用户明确要求 Knowvia 前端改用 5174。

## Facts

- Vite 原来未指定端口；现有代理目标已是 4100，保留。
- 后端默认值、环境示例及本地配置的前端 URL 仍为 5173。
- 当前 5173 监听来自另一项目，不能停止该进程。
- agent-workflow CLI 无可执行入口，改为手工维护任务记录。

## Open questions

无。此次仅修改开发端口，不改生产地址或 preview 端口。
