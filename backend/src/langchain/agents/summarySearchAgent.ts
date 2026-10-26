/**
 * ========================================================================
 * 文章总结 Agent (Summary Search Agent)
 * ========================================================================
 *
 * 【作用】
 * 文章总结场景的 LangChain Agent。
 * 固定使用系统级 DeepSeek 模型（不依赖用户配置），支持联网搜索补充信息。
 *
 * 【和 chatSearchAgent 的区别】
 * 1. 模型固定：始终用 DeepSeek（SUMMARY_DEEPSEEK_API_KEY），不依赖用户配置
 * 2. Prompt 不同：额外注入文章内容作为上下文
 * 3. 温度更低：总结需要更稳定、更忠实于原文的输出
 *
 * 【这条 Chain 的编排】
 *
 *   用户输入 + 文章内容 + 历史对话
 *        ↓
 *   ChatPromptTemplate（系统提示词 + 文章内容 + 历史消息 + 用户输入 + scratchpad）
 *        ↓
 *   createToolCallingAgent()
 *        ↓
 *   AgentExecutor（模型推理 → 可选搜索 → 生成总结）
 *        ↓
 *   streamEvents() → SSE
 * ========================================================================
 */

import type { Response } from 'express';
import type { BaseMessage } from '@langchain/core/messages';
import { createToolCallingAgent, AgentExecutor } from 'langchain/agents';
import { ChatOpenAI } from '@langchain/openai';
import { createSummaryPrompt } from '../prompts/summaryPrompts';
import { getToolsForScene } from '../tools';
import { setSseHeaders, streamAgentToSse } from '../utils/streamAdapter';
import type { StreamResult } from '../utils/streamAdapter';
import { resolveProviderConfig } from '../../utils/aiProvider';

/**
 * 文章内容最大字符数
 * 超出则截断，预留空间给 system prompt + 历史对话 + 搜索结果 + 输出
 */
const MAX_ARTICLE_CHARS = 35000;

/**
 * 调用文章总结 Agent 的参数
 */
export interface InvokeSummaryAgentParams {
  userMessage: string;            // 用户输入（如 "请帮我总结这篇文章"）
  articleTitle: string;           // 文章标题
  articleContent: string;         // 文章正文
  chatHistory: BaseMessage[];     // 历史对话
  res: Response;                  // Express Response
  onClientDisconnect?: (result: StreamResult) => void | Promise<void>; // 客户端暂停/刷新时保存已生成内容
}

/**
 * 构建文章上下文字符串
 * 将文章标题和正文组合成一段文本，注入到 Prompt 的 {article_context} 变量中
 */
const buildArticleContext = (title: string, content: string): string => {
  let articleText = content;
  let truncatedNote = '';

  if (articleText.length > MAX_ARTICLE_CHARS) {
    articleText = articleText.slice(0, MAX_ARTICLE_CHARS);
    truncatedNote = '\n\n> 注意：文章过长，以上仅展示前半部分内容，请基于已展示内容进行分析。';
  }

  return `## 用户正在阅读的文章\n\n**标题**：${title}\n\n**正文**：\n${articleText}${truncatedNote}`;
};

/**
 * 创建文章总结专用的 DeepSeek 模型实例
 *
 * 【为什么不用 modelFactory】
 * 文章总结固定用系统级 DeepSeek，不需要根据用户配置动态创建。
 * 直接用 ChatOpenAI + DeepSeek baseURL，更简洁。
 *
 * 【为什么用 ChatOpenAI 而不是某个 DeepSeek 专用类】
 * DeepSeek 的 API 完全兼容 OpenAI 格式，
 * 所以 LangChain 的 ChatOpenAI 通过 baseURL 指向 DeepSeek 就能直接用。
 * 这和你 aiProvider.ts 中 deepseek 的 apiStyle 是 'openai' 一致。
 */
const createSummaryModel = (): ChatOpenAI => {
  const provider = resolveProviderConfig('deepseek');
  if (!provider) {
    throw new Error('系统总结模型配置异常');
  }

  const apiKey = process.env.SUMMARY_DEEPSEEK_API_KEY || '';
  if (!apiKey) {
    throw new Error('系统总结模型密钥未配置');
  }

  // 从 provider.baseUrl 提取 baseURL（去掉 /chat/completions）
  const baseUrl = provider.baseUrl.replace(/\/chat\/completions\/?$/, '');

  return new ChatOpenAI({
    openAIApiKey: apiKey,
    modelName: provider.models.default,  // 使用默认模型（如 deepseek-chat）
    temperature: 0.3,                    // 低温度 = 更稳定的总结输出
    streaming: true,
    configuration: {
      baseURL: baseUrl,
    },
    // DeepSeek V4 思考模式与 Agent 工具调用不兼容，关闭思考
    // 否则 AgentExecutor 循环中 reasoning_content 丢失导致 400 错误
    modelKwargs: { thinking: { type: 'disabled' } },
  });
};

/**
 * 执行文章总结 Agent
 *
 * 【调用链路】
 * chatController.call() [sceneType === 'article_summary']
 *   → invokeSummaryAgent()           ← 你在这里
 *     → createSummaryModel()         ← 创建 DeepSeek 模型
 *     → createSummaryPrompt()        ← 创建带文章内容的 Prompt
 *     → createToolCallingAgent()     ← 组装 Agent（可搜索）
 *     → AgentExecutor                ← 执行
 *     → streamAgentToSse()           ← SSE 输出
 *
 * @returns fullContent - AI 的完整回复，用于保存到数据库
 */
export const invokeSummaryAgent = async ({
  userMessage,
  articleTitle,
  articleContent,
  chatHistory,
  res,
  onClientDisconnect,
}: InvokeSummaryAgentParams): Promise<{ fullContent: string; reasoningContent: string }> => {
  // 1. 创建模型
  const model = createSummaryModel();

  // 2. 获取工具（文章总结也可以搜索）
  const tools = getToolsForScene('article_summary');

  // 3. 创建 Prompt（包含文章内容占位符 {article_context}）
  const prompt = createSummaryPrompt();

  // 4. 组装 Agent
  const agent = await createToolCallingAgent({
    llm: model,
    tools,
    prompt,
  });

  // 5. 创建执行器
  // 文章总结场景搜索次数通常较少（1-2 次补充信息），3 次足够
  const executor = new AgentExecutor({
    agent,
    tools,
    maxIterations: 3,
    earlyStoppingMethod: 'generate',
  });

  // 6. 设置 SSE 头
  setSseHeaders(res);

  // 7. 构建文章上下文（始终注入完整文章，历史压缩后模型无法从对话记录中恢复文章内容）
  const articleContext = buildArticleContext(articleTitle, articleContent);

  // 8. 流式执行
  /**
   * 传给 Agent 的输入参数，对应 Prompt 模板中的变量：
   *   - input            → {input}             用户消息
   *   - article_context  → {article_context}    文章内容
   *   - chat_history     → MessagesPlaceholder  历史对话
   *   - agent_scratchpad 自动管理，不需要手动传
   */
  const { fullContent, reasoningContent } = await streamAgentToSse(
    executor,
    {
      input: userMessage,
      article_context: articleContext,
      chat_history: chatHistory,
    },
    res,
    { onClientDisconnect }
  );

  return { fullContent, reasoningContent };
};
