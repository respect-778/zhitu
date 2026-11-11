# Knowvia 前端端口 5174

## Goal

将本地前端开发端口固定为 5174，并保持后端跨域和登录回跳地址一致。

## Scope

- In scope: repo path: vite.config.ts、README.md、../README.md
- In scope: repo path: ../backend/src/server.ts、../backend/src/controllers/oauthController.ts、../backend/.env.example、../backend/.env（仅两个前端 URL）
- In scope: repo path: .agent-workflow/memory/architecture.md
- Out of scope: 后端端口、业务逻辑、其他项目进程、真实数据和凭据。

## Deliverables

固定端口、关联地址同步、启动验证。

## Risks

5174 被占用时必须明确报错，不自动使用其他端口；保留现有 4100 代理和所有无关修改。
