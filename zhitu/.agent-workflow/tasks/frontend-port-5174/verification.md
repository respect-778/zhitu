# Verification

## Planned checks

- 实际加载 Vite 配置，验证绑定 5174，HTTP 返回 200，代理保持 4100。
- 验证端口被占用时严格失败。
- TypeScript、定向 diff 检查及关联 URL 一致性。

## Results — 2026-11-09

- PASS: 实际 Vite 配置为 port=5174、strictPort=true、API 代理仍为 4100；HTTP 首页返回 200。
- PASS: 第二个 Vite 实例在 5174 已占用时启动失败，不自动递增端口。
- PASS: 前端 `npx --no-install tsc -b`；后端 `npx --no-install tsc --noEmit`；定向 `git diff --check`。
- PASS: 后端跨域/登录回跳默认地址、环境示例及文档均为 5174；本地 .env 仅修改 CORS_ORIGIN 和 FRONTEND_URL，不记录任何凭据。
- `node --input-type=module -e` 启动实验出现 LESS worker 的 require 错误，因此追加真实 `npm run dev` 验证；真实命令正确报告 http://localhost:5174/。
- PASS: 真实 npm 启动后首页、`/src/index.less` 和 `/src/styles/theme.less` 均返回 200，样式转换正常。保留该前端开发服务供用户访问。
- 没有停止或修改占用 5173 的其他项目。

## Limits

未执行真实第三方登录；运行中的后端需要重新加载配置才能使用新的环境变量。CLI 任务工具不可用，证据手工记录。
