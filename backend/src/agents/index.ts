/**
 * ========================================================================
 * [已废弃] 旧 Agent 注册表
 * ========================================================================
 *
 * 该模块已被 langchain/ 目录替代。
 * chatController.ts 现在直接调用 langchain/ 下的 invokeChatAgent / invokeSummaryAgent。
 *
 * 保留此文件的唯一导出：articleAbstractAgent（仍被 communityController 使用）。
 * chatAgent.ts、summaryAgent.ts、types.ts 可以安全删除。
 * ========================================================================
 */

export { generateArticleAbstract } from './articleAbstractAgent';
