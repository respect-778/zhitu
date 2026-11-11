# 学习规划搜索选项与历史

## Goal

在既有侧栏正文搜索上增加 `path:`、`file:` 和可复用、可清空的本地搜索历史。

## Scope

- In scope: repo path: src/pages/Path/components/Sidebar/panels/SearchPanel/
- In scope: repo path: src/pages/Path/utils/noteSearch.ts
- In scope: repo path: tests/path-search.test.cjs
- In scope: repo path: tests/path-search-ui.py
- In scope: repo path: tests/path-layout-ui.py（搜索框定位）
- Out of scope: 编辑器、表格样式、后端接口、真实笔记数据、其他搜索语法。

## Deliverables

路径/文件名过滤、提示菜单、键盘选择、按账号隔离的最近 20 条搜索历史、专项测试。

## Risks

同名文件的路径识别、空正文被过滤、大小写与引号解析、历史泄露到其他账号、中文输入法回车误提交。
