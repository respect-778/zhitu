# 社区列表骨架屏

## Goal

阅读历史、收藏和相邻社区页面在每次进入时显示真实加载状态，避免先显示空状态。

## Scope

- repo path: src/components/ContentSkeleton/
- repo path: src/components/subArticleList/index.tsx
- repo path: src/components/subArticleList/index.module.less（手机宽度下避免文件夹栏挤压内容）
- repo path: src/components/ArticleList/index.tsx
- repo path: src/components/WeeklyDigest/index.tsx
- repo path: src/pages/Community/index.tsx
- repo path: src/pages/Community/components/HistoryContent/index.tsx
- repo path: src/pages/Community/components/MyCollection/index.tsx
- repo path: src/pages/Community/components/MyFollowing/index.tsx
- repo path: tests/community-loading-ui.py

## Deliverables / Risks

共享主题灰色骨架屏，初始加载标志，错误结束及重试，筛选请求防乱序；保留现有用户修改，不改 API 或数据。
