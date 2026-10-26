/**
 * ========================================================================
 * LangChain 模块统一入口
 * ========================================================================
 *
 * 【作用】
 * 统一导出 LangChain 模块的公共接口，
 * 外部代码（如 chatController）只需要 import 这一个文件。
 *
 * 【模块结构概览】
 *
 *   langchain/
 *   ├── models/
 *   │   └── modelFactory.ts       ← ProviderConfig → ChatModel 实例
 *   ├── tools/
 *   │   ├── webSearchTool.ts      ← 博查搜索工具（DynamicStructuredTool）
 *   │   └── index.ts              ← 按场景返回工具集合
 *   ├── prompts/
 *   │   ├── chatPrompts.ts        ← 聊天 Prompt（普通 + 深度思考）
 *   │   └── summaryPrompts.ts     ← 总结 Prompt（含文章内容注入）
 *   ├── agents/
 *   │   ├── chatSearchAgent.ts    ← 通用聊天 Agent（核心编排）
 *   │   └── summarySearchAgent.ts ← 文章总结 Agent
 *   ├── utils/
 *   │   ├── messageConverter.ts   ← DB 消息 ↔ LangChain BaseMessage 转换
 *   │   ├── streamAdapter.ts      ← LangChain 事件流 → SSE 格式
 *   │   └── historyCompressor.ts  ← 历史对话压缩（异步摘要生成）
 *   └── index.ts                  ← 你在这里
 * ========================================================================
 */

// Agent 执行函数
export { invokeChatAgent } from './agents/chatSearchAgent';
export type { InvokeChatAgentParams } from './agents/chatSearchAgent';

export { invokeSummaryAgent } from './agents/summarySearchAgent';
export type { InvokeSummaryAgentParams } from './agents/summarySearchAgent';

// 工具函数
export { convertDbMessagesToLangChain } from './utils/messageConverter';
export { setSseHeaders, writeSseError } from './utils/streamAdapter';

// 历史对话压缩
export { compressHistoryIfNeeded } from './utils/historyCompressor';

// 模型工厂（外部可能需要直接创建模型，如 articleAbstractAgent）
export { createChatModel } from './models/modelFactory';