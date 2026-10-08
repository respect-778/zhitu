# 服务器正式版本与个人资料目录副本

状态：2026-10-07 已完成实现、构建和自动化验收；原生 Windows 目录选择待手工验收。证据见 verification.md；当前分支未提交。

## Goal
完成之前暂缓的简历服务器保存及学习规划、简历共用电脑目录自动保存。保留当前分支和已有工作；首次引用初始化已经完成，不重复改动。

## Scope
- repo path: src/store/modules/resumeStore.ts
- repo path: src/store/index.ts
- repo path: src/api/resume.ts
- repo path: src/utils/personalDirectory.ts
- repo path: src/utils/personalDirectoryPlan.ts
- repo path: src/utils/directoryHandleStore.ts
- repo path: src/utils/resumePersistence.ts
- repo path: src/components/PersonalStorage/
- repo path: src/pages/Resume/
- repo path: src/pages/Path/components/ActivityBar/
- repo path: tests/
- repo path: ../backend/src/models/ResumeWorkspace.ts
- repo path: ../backend/src/controllers/resumeController.ts
- repo path: ../backend/src/routes/resumeRoutes.ts
- repo path: ../backend/src/routes/index.ts
- repo path: ../backend/src/server.ts
- repo path: ../backend/database/init.sql
- repo path: ../backend/tests/resume-storage.test.cjs
- repo path: .agent-workflow/tasks/personal-storage/
- repo path: .agent-workflow/memory/architecture.md
- repo path: ../project-memory/

## Out of scope
区块链、Wiki、Agent 编排；自动读取电脑文件反向覆盖服务器；自动生成 PDF；提交、推送、部署；已有主题和滚动相关修改。

## Deliverables
带版本和账号隔离的简历保存、旧简历迁移、统一目录配置与自动副本、状态与异常反馈、测试与验收证据。

## Risks
旧缓存不能覆盖已有云端数据；后台不得弹权限框；切换账号时不能写入原账号目录；现有未提交源码修改需保留。后端不在前端 Git 仓库内。
