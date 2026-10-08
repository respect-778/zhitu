# 工作区保存与引用完整性

## Goal
修复旧页面覆盖新引用、并发引用丢失和引用来源伪造。当前开发基线 5c340da 已推送，新分支 codex/workspace-citation-integrity。

## Scope
- repo path: src/api/path.ts
- repo path: src/api/highlight.ts
- repo path: src/store/
- repo path: src/utils/workspaceSaveQueue.ts
- repo path: src/pages/Path/
- repo path: src/pages/Chat/components/ChatId/index.tsx
- repo path: tests/workspace-save-queue.test.cjs
- repo path: tests/workspace-ui.py
- repo path: .agent-workflow/memory/architecture.md
- repo path: .agent-workflow/tasks/workspace-citation-integrity/

后端在相邻 backend 目录，不在本 Git 仓库；修改前源码已独立归档。后端范围为工作区模型、引用服务、控制器、启动迁移及对应数据库集成测试。

## Deliverables
版本冲突保护、串行保存队列、事务追加、来源校验、局部修改恢复与验证记录。

## Risks
旧前端缺少版本号不能直接保存；前后端需配套更新。首次收藏初始化、文件夹存储、Wiki 和区块链均留待后续。
