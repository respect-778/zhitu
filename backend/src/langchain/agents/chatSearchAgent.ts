/**
 * ========================================================================
 * 通用聊天 Agent (Chat Search Agent)
 * ========================================================================
 *
 * 【作用】
 * 通用聊天场景的 LangChain Agent，支持联网搜索和深度思考模式。
 * 模型会自动判断是否需要调用搜索工具。
 *
 * 【这条 Chain 的完整编排】
 * 整条 Chain 的数据流如下（从上到下）：
 *
 *   用户输入 + 历史对话
 *        ↓
 *   ChatPromptTemplate（注入系统提示词 + 历史消息 + 用户输入 + scratchpad）
 *        ↓
 *   createToolCallingAgent()  ← 创建 Agent（把模型和工具绑定在一起）
 *        ↓
 *   AgentExecutor             ← 执行循环（模型推理 → 调用工具 → 观察结果 → 再推理）
 *        ↓
 *   streamEvents()            ← 流式输出事件
 *        ↓
 *   streamAdapter             ← 转换为 SSE 格式发给前端
 *
 * 【和你学习资料第 21 节的对比】
 * 你的资料：
 *   const agent = await createOpenAIToolsAgent({ llm, tools, prompt })
 *   const executor = new AgentExecutor({ agent, tools })
 *   const result = await executor.invoke({ input: '...' })
 *
 * 这里的区别：
 *   1. createOpenAIToolsAgent → createToolCallingAgent（更通用，不限 OpenAI）
 *   2. invoke → streamEvents（支持流式 + 中间事件）
 *   3. prompt 自己定义，不从 Hub 拉取
 *   4. 传入 chat_history 实现多轮对话
 *
 * 【createToolCallingAgent 内部做了什么】
 * 它把 prompt、model、tools 组合成一个 Runnable：
 *   prompt.pipe(model.bindTools(tools)).pipe(outputParser)
 * 其中 model.bindTools(tools) 告诉模型有哪些工具可以调用，
 * 模型在生成回复时会自动决定是否需要调用工具。
 *
 * 【AgentExecutor 内部做了什么】
 * AgentExecutor 是一个循环执行器，流程：
 *   1. 调用 Agent（模型推理）
 *   2. 如果模型返回了工具调用请求 → 执行工具 → 将结果放入 scratchpad → 回到 1
 *   3. 如果模型返回了最终回答 → 结束循环，输出结果
 *   maxIterations 限制了循环次数，防止无限调用工具
 * ========================================================================
 */

import type { Response } from 'express';
import type { BaseMessage } from '@langchain/core/messages';
import { createToolCallingAgent, AgentExecutor } from 'langchain/agents';
import { createChatModel } from '../models/modelFactory';
import { createChatPrompt } from '../prompts/chatPrompts';
import { getToolsForScene } from '../tools';
import { setSseHeaders, streamAgentToSse } from '../utils/streamAdapter';
import type { StreamResult } from '../utils/streamAdapter';
import type { ProviderConfig } from '../../utils/aiProvider';

/**
 * 调用通用聊天 Agent 的参数
 */
export interface InvokeChatAgentParams {
  provider: ProviderConfig;     // 供应商配置（来自 aiProvider.ts）
  apiKey: string;               // 用户的 API Key
  modelName: string;            // 模型名称
  mode: number;                 // 0 = 普通模式，1 = 深度思考模式
  userMessage: string;          // 当前用户输入
  chatHistory: BaseMessage[];   // 历史对话（已转换为 LangChain 格式）
  res: Response;                // Express Response（用于 SSE 流式写入）
  onClientDisconnect?: (result: StreamResult) => void | Promise<void>; // 客户端暂停/刷新时保存已生成内容
}

/**
 * 执行通用聊天 Agent
 *
 * 【调用链路】
 * chatController.call()
 *   → invokeChatAgent()         ← 你在这里
 *     → createChatModel()       ← 创建模型实例
 *     → createChatPrompt()      ← 创建 Prompt 模板
 *     → createToolCallingAgent()← 组装 Agent
 *     → AgentExecutor           ← 创建执行器
 *     → streamAgentToSse()      ← 流式输出到前端
 *
 * @returns fullContent - AI 的完整回复文本，用于保存到数据库
 */
export const invokeChatAgent = async ({
  provider,
  apiKey,
  modelName,
  mode,
  userMessage,
  chatHistory,
  res,
  onClientDisconnect,
}: InvokeChatAgentParams): Promise<{ fullContent: string; reasoningContent: string }> => {
  // ==================== 第 1 步：创建模型实例 ====================
  // 根据用户配置的供应商和 API Key 创建 LangChain ChatModel
  // 相当于你学习资料第 4 节的 `new ChatOpenAI()`，但支持 7 个供应商
  //
  // 【DeepSeek V4 特殊处理】
  // DeepSeek V4 系列模型（v4-flash、v4-pro 等）默认开启了 "思考模式"，
  // 每次响应会返回 reasoning_content（推理过程）。
  // 但 LangChain 的 AgentExecutor 在工具调用循环中，不会把 reasoning_content
  // 正确保留在 agent_scratchpad 里，导致第二次调用模型时缺少 reasoning_content 而报 400。
  //
  // 解决方案：在使用工具调用的 Agent 中，通过 modelKwargs 关闭思考模式。
  // 这样模型不返回 reasoning_content，Agent 循环就不会出问题。
  const isDeepSeek = provider.baseUrl.includes('deepseek');
  const isMoonshot = provider.baseUrl.includes('moonshot');
  const needDisableThinking = isDeepSeek || isMoonshot;

  // Kimi K2.6 只允许 temperature=0.6，需要特殊处理
  const temperature = isMoonshot ? 0.6 : (mode === 1 ? 0.3 : 0.7);

  const model = createChatModel({
    provider,
    apiKey,
    modelName,
    temperature,
    streaming: true,
    // DeepSeek/Kimi 思考模式与 Agent 工具调用不兼容，关闭思考
    ...(needDisableThinking && {
      modelKwargs: { thinking: { type: 'disabled' } },
    }),
  });

  // ==================== 第 2 步：获取工具集合 ====================
  // 通用聊天场景提供 [webSearchTool]
  // 相当于你学习资料第 20 节的 `const tools = [new SerpAPI(), new Calculator()]`
  const tools = getToolsForScene('chat', mode);

  // ==================== 第 3 步：创建 Prompt 模板 ====================
  // 根据模式选择普通 Prompt 或深度思考 Prompt
  const prompt = createChatPrompt(mode);

  // ==================== 第 4 步：组装 Agent ====================
  /**
   * createToolCallingAgent 把三个核心组件组合在一起：
   *   - llm (模型)：负责推理和生成回答
   *   - tools (工具)：模型可以调用的外部能力
   *   - prompt (提示词模板)：定义消息结构和系统指令
   *
   * 内部实际上是：prompt.pipe(model.bindTools(tools)).pipe(parser)
   * 这就是你学习资料第 4 节学的 LCEL pipe 用法！
   *
   * model.bindTools(tools) 会把工具的 name、description、schema
   * 转换为模型能理解的 function/tool 定义，注入到 API 请求中。
   * 这就是你学习资料第 17 节 Function Calling 的原理。
   */
  const agent = await createToolCallingAgent({
    llm: model,
    tools,
    prompt,
  });

  // ==================== 第 5 步：创建执行器 ====================
  /**
   * AgentExecutor 是 Agent 的 "运行时"，负责循环执行：
   *   模型推理 → 判断是否调用工具 → 调用工具 → 把结果喂回模型 → 再推理
   *
   * maxIterations: 最多循环 5 次
   *   - 防止 Agent 陷入无限循环（比如反复搜索同一个问题）
   *   - 你学习资料第 21 节提到：
   *     "通过设置 maxIterations 来减少极端情况对 tokens 的无限制使用"
   *
   * 如果你想看到 Agent 的详细思考过程（调试用），可以加：
   *   verbose: true
   * 就像你学习资料里用的 verbose 模式
   */
  const executor = new AgentExecutor({
    agent,
    tools,
    maxIterations: mode === 1 ? 8 : 5,
    earlyStoppingMethod: 'generate',
    // verbose: true,  // 开启后会在终端打印 Agent 的完整思考过程
  });

  // ==================== 第 6 步：设置 SSE 响应头 ====================
  setSseHeaders(res);

  // ==================== 第 7 步：流式执行并输出 ====================
  /**
   * 把 Agent 的执行结果以 SSE 事件流的形式发给前端。
   *
   * input: 当前用户输入，对应 Prompt 中的 {input} 变量
   * chat_history: 历史对话，对应 Prompt 中的 MessagesPlaceholder('chat_history')
   *
   * agent_scratchpad 不需要手动传，AgentExecutor 会自动管理。
   * 它在每次循环中把工具调用记录追加到 scratchpad，
   * 让模型能 "看到" 之前的搜索结果，做出更好的判断。
   */
  const { fullContent, reasoningContent } = await streamAgentToSse(
    executor,
    {
      input: userMessage,
      chat_history: chatHistory,
    },
    res,
    { onClientDisconnect }
  );

  return { fullContent, reasoningContent };
};
