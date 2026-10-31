# 学习规划共享 Wiki 底座

## Goal

把现有学习规划逐步升级为学生与 Agent 共用、但由学生控制权限的学习 Wiki。本任务先完成不依赖 AI 助手的 P0/P1 体验与 P2 数据底座，再单独接入服务端强校验；任何阶段都不能让界面状态冒充真实授权边界。

## Scope

### In scope

- repo path: src/pages/Path/
- repo path: src/store/modules/pathStore.ts
- repo path: src/types/path.ts
- repo path: src/api/path.ts
- repo path: tests/
- repo path: .agent-workflow/tasks/learning-wiki-foundation/
- repo path: .agent-workflow/memory/

### Out of scope

- AI 助手、LangChain/LangGraph 工作流与模型整理
- 简历编辑器、知识广场发布流程
- 后台定时整理或保存触发模型
- 数据库重置、Neo4j、3D 图谱

## Deliverables

- 新用户幂等的四目录五文件初始化数据及兼容旧工作区的权限默认值
- 左侧 Agent 权限树、同栏文件夹确认、右键入口和 Markdown 说明面板
- 学习规划作用域内的 Markdown 四态主题与编辑回归
- 后续稳定链接、附件、真实关系图谱和自定义拖拽的分阶段实现与证据

## Risks

- 当前工作区 JSON 没有服务端资源级 ACL；前端状态不能当安全边界
- Vditor 3.11.2 的活动代码高亮扩展点需要隔离验证
- 旧工作区缺少创建来源和权限字段，必须兼容而不能整库改写
- 默认结构只对新工作区初始化，不能重新创建用户已删除的目录
