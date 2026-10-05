# Community theme fixes

## Goal
全屏加载覆盖视口且无页面滚动条，发布页与文章详情跟随网站亮暗主题。保留正常阅读滚动和简历白纸。

## Scope
- repo path: src/components/Loading/
- repo path: src/index.less
- repo path: src/styles/markdown.less
- repo path: src/pages/Community/components/PublishContent/
- repo path: src/pages/Community/components/DetailContent/
- repo path: src/pages/Chat/index.module.less
- repo path: src/pages/Chat/components/ChatId/index.module.less
- repo path: .agent-workflow/tasks/community-theme/

Out of scope: 数据库、API 行为、发布与草稿业务逻辑、简历模板、Git 提交及推送。

## Deliverables
本地修改及验证记录，向用户说明修改文件。

追加范围：学习助手新对话及历史会话的深度思考按钮亮暗样式；仅替换硬编码颜色，不改聊天或模型调用逻辑。

## Risks
加载层卸载时必须恢复滚动，多实例不能提前解锁。Markdown 覆盖须局限社区两处入口。
