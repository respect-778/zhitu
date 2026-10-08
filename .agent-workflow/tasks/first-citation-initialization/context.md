# Context

## Why now
用户已授权只实施第四个问题，并要求测试和验收。简历、电脑目录保存留待后续。

## Facts
- 当前分支 codex/workspace-citation-integrity，前三项修复及其他 UI 修改均未提交，必须保留。
- POST /growth/cite 先验证来源，再在 GrowthWorkspaceModel.mutate 事务里追加引用。
- 修复前 appendCitation 对空工作区和缺少 folder-cite 直接返回 400；本次改为事务内初始化或补建目录。
- 学习规划默认包含我的规划、学习笔记、引用收藏、周总结、成长档案五个目录。
- npx --no-install agent-workflow task:list 无法找到可执行入口，本任务用同样的本地 Markdown 结构记录，不安装工具。

## Open questions
无需要用户补充的实施问题。线上部署状态不在本次验收范围。
