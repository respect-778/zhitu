/**
 * ========================================================================
 * 历史对话压缩器 (History Compressor)
 * ========================================================================
 *
 * 【作用】
 * 当会话消息数超过阈值时，将较旧的对话历史压缩为一段摘要，
 * 减少注入 Prompt 的上下文长度，节省 token 消耗。
 *
 * 【压缩策略】
 * "近处保原文，远处存结构化摘要"——
 *   - 最近 KEEP_RECENT 条消息保留原文，保证近期上下文完整
 *   - 更早的消息由 LLM 压缩为结构化摘要（6 节：用户意图/关键结论/已解决问题/用户偏好/未完成话题/当前状态）
 *   - 摘要存入 ai_chat_session 表的 history_summary 字段
 *   - 支持增量压缩：旧摘要 + 新旧消息 → 合并为新结构化摘要
 *
 * 【为什么用结构化而非纯文本】
 *   借鉴 Claude Code 的 compact 设计：结构化摘要让模型能精准定位不同类型的上下文信息。
 *   特别是"用户偏好"节（保证 AI 不违背用户选择）和"当前状态"节（保证话题连贯）。
 *
 * 【触发时机】
 * AI 回复保存到数据库之后，异步触发（不阻塞主流程）。
 * 压缩失败只打日志，不影响正常功能（退化为原来的滑动窗口）。
 *
 * 【压缩模型】
 * 使用系统级 DeepSeek（便宜、快速），不消耗用户 API 配额。
 * ========================================================================
 */

import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { resolveProviderConfig } from '../../utils/aiProvider';
import { ChatSessionModel } from '../../models/ChatSession';
import { ChatMessageModel } from '../../models/ChatMessage';

// ==================== 配置常量 ====================
// 按场景区分压缩策略：
// - chat 场景：上下文预算充裕，可以晚一点压缩
// - summary 场景：文章内容已占 35000 字，历史要更早压缩
const SCENE_CONFIG = {
  chat: {
    compressThreshold: 20, // 超过 20 条消息（10 轮）触发压缩
    keepRecent: 8,         // 保留最近 8 条原文（4 轮）
  },
  article_summary: {
    compressThreshold: 10, // 超过 10 条消息（5 轮）触发压缩
    keepRecent: 4,         // 保留最近 4 条原文（2 轮），文章内容每次都会注入，可以少留
  },
} as const;

const DEFAULT_CONFIG = SCENE_CONFIG.chat;
const MAX_SUMMARY_LENGTH = 1000; // 摘要最大字数（结构化格式比纯文本略长）
const MAX_SINGLE_MSG_CHARS = 2000; // 单条消息超过此长度时截断（喂给压缩模型时）

// ==================== 压缩专用 Prompt ====================
const COMPRESS_SYSTEM_PROMPT = `你是一个对话历史压缩助手。
请将以下对话历史压缩为结构化摘要，严格按照下面的 6 个节输出。

## 输出格式（必须严格遵守）

## 用户意图
用户的核心需求、目标、想要解决的问题。按时间顺序列出所有明确的请求。

## 关键结论
AI 给出的核心结论、具体建议、推荐方案。保留技术细节、代码要点、数据、配置项。

## 已解决问题
已经完成的任务、解答的疑问、解决的错误。标明最终采用的方案。

## 用户偏好
用户表达的偏好和决策（如"用户选择了方案A"、"用户不想用某方法"、"用户喜欢简洁回答"）。

## 未完成话题
正在进行但未结束的讨论、待确认的方案、遗留问题。

## 当前状态
对话结束时正在讨论什么、最后的话题方向。这一节对恢复上下文至关重要。

## 写作要求
1. 每一节用 "## 节名" 作为标题开头，内容紧随其后
2. 如果某一节没有内容，写 "无" 即可，不要省略节标题
3. 保留重要的技术细节（文件名、函数名、配置值、错误信息等）
4. 可以丢弃：寒暄客套、重复确认、过渡语句
5. 总字数控制在 ${MAX_SUMMARY_LENGTH} 字以内
6. 使用第三方视角（"用户询问了..."、"AI 建议..."）
7. 只输出结构化摘要，不要额外解释`;

const ARTICLE_SUMMARY_COMPRESS_EXTRA = `
## 特殊说明：这是一段「文章分析」对话
用户正在和 AI 讨论一篇文章。"关键结论"节中请重点保留：
- AI 对文章提炼的核心观点、知识框架、概念定义
- 文章中出现的关键术语、对比表、流程步骤
- AI 对文章内容的分析和拆解结论
这些信息对后续追问至关重要，压缩时优先保留。`;

const getCompressPrompt = (sceneType: string): string => {
  if (sceneType === 'article_summary') {
    return COMPRESS_SYSTEM_PROMPT + ARTICLE_SUMMARY_COMPRESS_EXTRA;
  }
  return COMPRESS_SYSTEM_PROMPT;
};

/**
 * 创建压缩专用的 DeepSeek 模型实例
 * 复用系统级 API Key，不消耗用户配额
 */
const createCompressModel = (): ChatOpenAI => {
  const provider = resolveProviderConfig('deepseek');
  if (!provider) throw new Error('压缩模型配置异常');

  const apiKey = process.env.SUMMARY_DEEPSEEK_API_KEY || '';
  if (!apiKey) throw new Error('压缩模型密钥未配置');

  const baseUrl = provider.baseUrl.replace(/\/chat\/completions\/?$/, '');

  return new ChatOpenAI({
    openAIApiKey: apiKey,
    modelName: provider.models.default,
    temperature: 0.2,
    maxTokens: 1500,
    streaming: false,
    configuration: { baseURL: baseUrl },
    modelKwargs: { thinking: { type: 'disabled' } },
  });
};

/**
 * 将消息数组格式化为可读文本，作为压缩模型的输入
 */
const formatMessagesForCompression = (
  messages: Array<{ role: string; content: string }>
): string => {
  return messages.map(m => {
    const role = m.role === 'ai' ? 'AI' : '用户';
    // 单条消息过长时截断，避免压缩输入过大
    const content = m.content.length > MAX_SINGLE_MSG_CHARS
      ? m.content.slice(0, MAX_SINGLE_MSG_CHARS) + '...[截断]'
      : m.content;
    return `${role}：${content}`;
  }).join('\n\n');
};

/**
 * 异步压缩历史对话（核心函数）
 *
 * 【调用时机】
 * chatController.call() 保存 AI 回复到 DB 之后，以 fire-and-forget 方式调用。
 * 不 await、不阻塞主流程。
 *
 * 【压缩流程】
 * 1. 查消息总数 → 不够长则跳过
 * 2. 加载全部消息，划分为"旧消息"和"近期消息"
 * 3. 检查旧消息是否已被上次摘要覆盖 → 已覆盖则跳过
 * 4. 构建压缩输入（已有摘要 + 未覆盖的旧消息）
 * 5. 调用 LLM 生成新摘要
 * 6. 写回 DB（history_summary + summary_up_to_id）
 *
 * @param sessionId - 会话 ID
 * @param sceneType - 场景类型（'chat' | 'article_summary'），不同场景压缩策略不同
 */
export const compressHistoryIfNeeded = async (
  sessionId: number,
  sceneType: string = 'chat'
): Promise<void> => {
  try {
    // 根据场景类型获取压缩配置
    const config = sceneType === 'article_summary'
      ? SCENE_CONFIG.article_summary
      : DEFAULT_CONFIG;

    // 1. 查消息总数，不够长不压缩
    const totalCount = await ChatMessageModel.countBySessionId(sessionId);
    if (totalCount <= config.compressThreshold) return;

    // 2. 获取当前 session 的摘要状态
    const session = await ChatSessionModel.findById(sessionId);
    if (!session) return;

    // 3. 加载所有消息
    const allMessages = await ChatMessageModel.getBySessionId(sessionId);
    if (allMessages.length <= config.compressThreshold) return;

    // 4. 划分：需要压缩的旧消息 vs 保留原文的近期消息
    const cutIndex = allMessages.length - config.keepRecent;
    const oldMessages = allMessages.slice(0, cutIndex);
    const lastOldMessage = oldMessages[oldMessages.length - 1];

    // 如果旧消息已经被上次摘要覆盖过，不重复压缩
    if (session.summary_up_to_id && lastOldMessage.id <= session.summary_up_to_id) {
      return;
    }

    // 5. 构建压缩输入：已有摘要 + 未被覆盖的新旧消息
    let textToCompress = '';

    if (session.history_summary && session.summary_up_to_id) {
      // 增量压缩：旧摘要 + 新增的旧消息 → 合并为新摘要
      textToCompress += `【之前的结构化摘要】\n${session.history_summary}\n\n【新增的对话（请合并到上面的结构化摘要中，更新各节内容）】\n`;

      // 只取尚未被摘要覆盖的旧消息
      const uncompressedOld = oldMessages.filter(m => m.id > session.summary_up_to_id!);
      if (uncompressedOld.length === 0) return; // 没有新的旧消息需要压缩
      textToCompress += formatMessagesForCompression(uncompressedOld);
    } else {
      // 首次压缩：直接压缩全部旧消息
      textToCompress = formatMessagesForCompression(oldMessages);
    }

    // 6. 调用 LLM 压缩
    const model = createCompressModel();
    const result = await model.invoke([
      new SystemMessage(getCompressPrompt(sceneType)),
      new HumanMessage(textToCompress),
    ]);

    const summary = typeof result.content === 'string' ? result.content.trim() : '';
    if (!summary) {
      console.warn(`会话 ${sessionId} 历史压缩返回空摘要，跳过`);
      return;
    }

    // 7. 写回 DB
    await ChatSessionModel.updateHistorySummary(sessionId, summary, lastOldMessage.id);
    console.log(
      `会话 ${sessionId} 历史压缩完成，摘要 ${summary.length} 字，覆盖到消息 ID ${lastOldMessage.id}`
    );
  } catch (error) {
    // 压缩失败不影响主功能，只打日志
    console.error(`会话 ${sessionId} 历史压缩失败:`, error);
  }
};
