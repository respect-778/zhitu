/**
 * ========================================================================
 * 文章关键词提取 Agent (Article Keywords Agent)
 * ========================================================================
 *
 * 【作用】
 * 在用户发布文章时，自动从文章内容中提取 2~5 个关键词，
 * 展示在文章列表卡片底部，帮助读者快速了解文章主题。
 *
 * 【实现方式】
 * 和 articleAbstractAgent.ts 完全相同的模式：
 * 用 LangChain 的 ChatOpenAI.invoke() 调用 DeepSeek，
 * 只是 prompt 改为提取关键词，返回值改为 string[]。
 * ========================================================================
 */

import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { resolveProviderConfig } from '../utils/aiProvider';

type GenerateArticleKeywordsParams = {
  title?: string;
  content: string;
};

const MAX_INPUT_CHARS = 12000;
const MAX_KEYWORD_VISUAL_WIDTH = 16; // CJK字符算 2，ASCII 算 1，所以 8 个中文字 = 16，16 个英文字符 = 16
const MIN_KEYWORDS = 2;
const MAX_KEYWORDS = 5;

const SYSTEM_PROMPT = `
你是知途社区的文章关键词提取助手。
你的任务是根据用户正在发布的文章标题和正文，提取最能代表文章核心主题的关键词。

要求：
1. 提取 ${MIN_KEYWORDS} 到 ${MAX_KEYWORDS} 个关键词，不得少于 ${MIN_KEYWORDS} 个，不得多于 ${MAX_KEYWORDS} 个。
2. 关键词长度限制：纯中文关键词不超过 8 个字，纯英文关键词不超过 16 个字母，中英混合按比例折算。
3. 英文关键词必须保持单词完整，绝对不能在单词中间截断。如果完整词组太长，应去掉后缀单词而不是截断。
   ✓ 正确："LangChain"、"Redux"、"Claude Code"、"React Native"
   ✗ 错误："LangChai"、"Redux To"、"Claude C"、"React Nat"
4. 关键词应涵盖文章的技术领域、核心概念、解决的问题等维度。
5. 关键词必须忠于原文内容，不编造文章中没有涉及的概念。
6. 以 JSON 数组格式返回，如 ["关键词1","关键词2","关键词3"]。
7. 只返回 JSON 数组，不要返回任何解释、Markdown 或其他文本。
`.trim();

// 切分文本
const sliceText = (value: string, maxLength: number): string => {
  return Array.from(value).slice(0, maxLength).join('');
};

/**
 * 计算字符串的视觉宽度：CJK 字符算 2，ASCII 算 1
 * 这样 8 个中文字 = 16 宽度，16 个英文字符 = 16 宽度
 */
const visualWidth = (str: string): number => {
  let width = 0;
  for (const char of str) {
    const code = char.codePointAt(0)!;
    if (
      (code >= 0x4E00 && code <= 0x9FFF) ||
      (code >= 0x3400 && code <= 0x4DBF) ||
      (code >= 0xF900 && code <= 0xFAFF) ||
      (code >= 0xFF01 && code <= 0xFF60) ||
      (code >= 0x3000 && code <= 0x303F) ||
      (code >= 0x3040 && code <= 0x309F) ||
      (code >= 0x30A0 && code <= 0x30FF) ||
      (code >= 0xAC00 && code <= 0xD7AF)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
};

/**
 * 智能截断关键词，尊重英文单词边界
 * - 未超宽直接返回
 * - 超宽时在单词边界处截断（丢掉后缀单词）
 * - 纯 CJK 内容按字符级截断
 */
const truncateKeyword = (value: string, maxWidth: number): string => {
  const trimmed = value.trim();
  if (visualWidth(trimmed) <= maxWidth) return trimmed;

  const parts = trimmed.split(/\s+/);
  if (parts.length > 1) {
    let result = '';
    let currentWidth = 0;
    for (let i = 0; i < parts.length; i++) {
      const separator = i > 0 ? ' ' : '';
      const partWidth = visualWidth(separator + parts[i]);
      if (currentWidth + partWidth > maxWidth) break;
      result += separator + parts[i];
      currentWidth += partWidth;
    }
    if (result.trim()) return result.trim();
  }

  let result = '';
  let currentWidth = 0;
  for (const char of trimmed) {
    const cw = visualWidth(char);
    if (currentWidth + cw > maxWidth) break;
    result += char;
    currentWidth += cw;
  }
  return result.trim();
};

/**
 * 创建关键词提取专用的 DeepSeek 模型实例
 * 复用和摘要生成相同的 API Key 和配置
 */
const createKeywordsModel = (): ChatOpenAI => {
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
    throw new Error('文章关键词 DeepSeek API Key 未配置');
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
    maxTokens: 200,
    streaming: false,
    configuration: {
      baseURL: baseUrl,
    },
    modelKwargs: { thinking: { type: 'disabled' } },
  });
};

/**
 * 从 AI 返回的原始文本中解析出关键词数组
 */
const parseKeywordsResponse = (raw: string): string[] => {
  const cleaned = raw
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
      throw new Error('返回格式不是数组');
    }

    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map(kw => truncateKeyword(kw.trim(), MAX_KEYWORD_VISUAL_WIDTH))
      .filter(kw => kw.length > 0)
      .slice(0, MAX_KEYWORDS);
  } catch {
    // 如果 JSON 解析失败，尝试按逗号/顿号分割
    const fallback = cleaned
      .replace(/[\[\]"']/g, '')
      .split(/[,，、\n]+/)
      .map(kw => truncateKeyword(kw.trim(), MAX_KEYWORD_VISUAL_WIDTH))
      .filter(kw => kw.length > 0)
      .slice(0, MAX_KEYWORDS);

    return fallback;
  }
};

/**
 * 生成文章关键词
 *
 * @param title   - 文章标题
 * @param content - 文章正文
 * @returns 关键词数组（2~5 个）
 */
export const generateArticleKeywords = async ({
  title,
  content
}: GenerateArticleKeywordsParams): Promise<string[]> => {
  const model = createKeywordsModel();

  const trimmedTitle = title?.trim() || '无标题';
  const trimmedContent = content.trim();
  const contentLength = Array.from(trimmedContent).length;
  const articleContent =
    contentLength > MAX_INPUT_CHARS
      ? `${sliceText(trimmedContent, MAX_INPUT_CHARS)}\n\n[内容过长，后续已截断]`
      : trimmedContent;

  const result = await model.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(`标题：${trimmedTitle}\n\n正文：\n${articleContent}`),
  ]);

  let rawContent = typeof result.content === 'string'
    ? result.content
    : '';

  if (!rawContent && result.additional_kwargs?.reasoning_content) {
    rawContent = typeof result.additional_kwargs.reasoning_content === 'string'
      ? result.additional_kwargs.reasoning_content
      : '';
  }

  const keywords = parseKeywordsResponse(rawContent);

  if (keywords.length < MIN_KEYWORDS) {
    throw new Error(`DeepSeek 返回的关键词不足 ${MIN_KEYWORDS} 个`);
  }

  return keywords;
};
