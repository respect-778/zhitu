/**
 * ========================================================================
 * 文章摘要生成 Agent (Article Abstract Agent)
 * ========================================================================
 *
 * 【作用】
 * 在用户发布文章时，自动生成一段简短的中文摘要，
 * 展示在文章列表和文章详情页。
 *
 * 【LangChain 改造说明】
 * 原来用 raw fetch 调用 DeepSeek API（152 行），
 * 现在用 LangChain 的 ChatOpenAI.invoke()（~50 行）。
 * 接口签名 generateArticleAbstract({ title, content }) 完全不变，
 * communityController.ts 和前端零改动。
 *
 * 【这不是 Agent，只是简单的 LLM 调用】
 * 摘要生成不需要工具调用（不搜索、不计算），
 * 所以直接用 model.invoke([messages])，不需要 Agent/Executor。
 * 这是 LangChain 最基础的用法，对应你学习资料第 4 节的内容。
 * ========================================================================
 */

import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { resolveProviderConfig } from '../utils/aiProvider';

type GenerateArticleAbstractParams = {
  title?: string;
  content: string;
};

const MAX_INPUT_CHARS = 12000;
const MAX_ABSTRACT_CHARS = 255;

const SYSTEM_PROMPT = `
你是知途社区的文章摘要助手。
你的任务是根据用户正在发布的文章内容，生成一段适合展示在文章列表和文章详情页的中文摘要。

要求：
1. 摘要必须忠于原文，不编造文章中没有的信息。
2. 摘要控制在 80 到 150 字之间，绝对不得超过 200 字。这是硬性限制，超出会被截断。
3. 不要使用 Markdown，不要使用列表，不要换行。
4. 不要输出“本文主要讲了”“这篇文章介绍了”等模板化开头。
5. 如果文章包含技术内容，请概括它解决的问题、核心思路和适用场景。
6. 只返回摘要正文，不要返回解释。
`.trim();

const sliceText = (value: string, maxLength: number): string => {
  return Array.from(value).slice(0, maxLength).join('');
};

const normalizeAbstract = (value: string): string => {
  return sliceText(
    value
      .replace(/\r?\n/g, ' ')
      .replace(/^["'""]+|["'""]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
    MAX_ABSTRACT_CHARS
  );
};

/**
 * 创建摘要生成专用的 DeepSeek 模型实例
 *
 * 【和旧代码 getDeepseekConfig() 的区别】
 * 旧代码返回 { apiKey, url, model }，然后手动 fetch。
 * 现在直接返回一个 ChatOpenAI 实例，调用 .invoke() 就能拿到结果。
 * LangChain 内部帮你处理了 HTTP 请求、错误重试、响应解析。
 */
const createAbstractModel = (): ChatOpenAI => {
  const provider = resolveProviderConfig('deepseek');
  if (!provider) {
    throw new Error('DeepSeek 模型配置不存在');
  }

  const apiKey =
    process.env.ARTICLE_ABSTRACT_DEEPSEEK_API_KEY ||
    process.env.ARTICLE_ABSTRACT_API_KEY ||
    process.env.ARTICLE_SUMMARY_API_KEY ||
    process.env.SUMMARY_DEEPSEEK_API_KEY ||
    '';

  if (!apiKey) {
    throw new Error('文章摘要 DeepSeek API Key 未配置');
  }

  const modelName =
    process.env.ARTICLE_ABSTRACT_DEEPSEEK_MODEL ||
    process.env.ARTICLE_ABSTRACT_MODEL ||
    process.env.ARTICLE_SUMMARY_MODEL ||
    provider.models.default;

  const baseUrl = (
    process.env.ARTICLE_ABSTRACT_DEEPSEEK_BASE_URL ||
    process.env.ARTICLE_ABSTRACT_BASE_URL ||
    process.env.ARTICLE_SUMMARY_BASE_URL ||
    provider.baseUrl
  ).replace(/\/chat\/completions\/?$/, '');

  return new ChatOpenAI({
    openAIApiKey: apiKey,
    modelName,
    temperature: 0.3,
    maxTokens: 500,    // 预留充足空间，实际输出由 prompt 控制在 200 字内
    streaming: false,  // 摘要生成不需要流式，等完整结果即可
    configuration: {
      baseURL: baseUrl,
    },
    // DeepSeek V4 默认开启思考模式，会浪费 token 在 reasoning_content 上
    // 摘要生成是简单任务，关闭思考可提高成功率和速度
    modelKwargs: { thinking: { type: 'disabled' } },
  });
};

/**
 * 生成文章摘要
 *
 * 【LangChain 调用方式】
 * model.invoke([messages]) 是最基础的 LangChain 调用：
 *   - 传入 BaseMessage 数组
 *   - 返回 AIMessage 对象
 *   - AIMessage.content 就是模型的回复文本
 *
 * 对应你学习资料第 4 节：
 *   const result = await model.invoke('你好')
 * 只是这里传的是结构化的 Message 数组而非纯字符串。
 *
 * @param title   - 文章标题
 * @param content - 文章正文
 * @returns 生成的摘要文本
 */
export const generateArticleAbstract = async ({
  title,
  content
}: GenerateArticleAbstractParams): Promise<string> => {
  const model = createAbstractModel();

  const trimmedTitle = title?.trim() || '无标题';
  const trimmedContent = content.trim();
  const contentLength = Array.from(trimmedContent).length;
  const articleContent =
    contentLength > MAX_INPUT_CHARS
      ? `${sliceText(trimmedContent, MAX_INPUT_CHARS)}\n\n[内容过长，后续已截断]`
      : trimmedContent;

  /**
   * model.invoke() - LangChain 最基础的同步调用
   * 传入 Message 数组，返回 AIMessage
   *
   * 对比旧代码：
   *   旧：手动 fetch → 解析 JSON → 提取 choices[0].message.content
   *   新：model.invoke([...]) → result.content
   * LangChain 帮你处理了所有 HTTP 和解析细节
   */
  const result = await model.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(`标题：${trimmedTitle}\n\n正文：\n${articleContent}`),
  ]);

  // result.content 可能是 string 或 MessageContent 数组
  // 如果思考模式未被成功关闭，content 可能为空，尝试从 reasoning_content 回退
  let rawContent = typeof result.content === 'string'
    ? result.content
    : '';

  if (!rawContent && result.additional_kwargs?.reasoning_content) {
    rawContent = typeof result.additional_kwargs.reasoning_content === 'string'
      ? result.additional_kwargs.reasoning_content
      : '';
  }

  const abstract = normalizeAbstract(rawContent);
  if (!abstract) {
    throw new Error('DeepSeek 未返回有效摘要');
  }

  return abstract;
};
