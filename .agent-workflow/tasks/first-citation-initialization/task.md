# 首次引用自动初始化工作区

## Goal
在当前 codex/workspace-citation-integrity 分支修复首次引用失败：用户无需先进入学习规划即可收藏，缺少引用目录时只补建目录并保留已有内容。

## Scope
- repo path: ../backend/src/services/growthWorkspaceService.ts
- repo path: ../backend/tests/workspace-integrity.test.cjs
- repo path: tests/first-citation-ui.py
- repo path: .agent-workflow/tasks/first-citation-initialization/
- repo path: .agent-workflow/memory/architecture.md

## Out of scope
简历服务器保存、电脑文件夹保存、Wiki、区块链、其他已有未提交修改。不切换分支、不提交或推送。

## Deliverables
事务内初始化和目录补建、接口回归测试、使用真实测试接口的浏览器验收及证据。

## Risks
后端位于相邻目录，不受前端 Git 管理；已在系统临时目录保存修改前源码和测试副本。并发首次引用必须依靠既有事务重试和 user_id 唯一约束，不能覆盖已有数据。测试只能写入临时隔离数据库。
