/**
 * ========================================================================
 * 消息格式转换器 (Message Converter)
 * ========================================================================
 *
 * 【作用】
 * 将数据库中存储的消息格式转换为 LangChain 的 BaseMessage 格式。
 *
 * 【为什么需要转换】
 * 你的数据库 chat_messages 表存的是：
 *   { role: 'user' | 'ai', content: string }
 *
 * LangChain 需要的是类型化的 Message 对象：
 *   HumanMessage('你好')      ← role === 'user'
 *   AIMessage('你好！')       ← role === 'ai' / 'assistant'
 *   SystemMessage('你是...')   ← role === 'system'
 *
 * 这些类型化的 Message 会被传入 Prompt 模板的 MessagesPlaceholder 中。
 *
 * 【和你学习资料的关系】
 * 你的学习资料第 4 节用的是 model.invoke('字符串')，
 * 但在 Agent 中需要用 Message 对象数组，因为：
 *   1. 需要区分 role（user/assistant/system/tool）
 *   2. Agent 的 scratchpad 包含工具调用消息（ToolMessage）
 *   3. MessagesPlaceholder 只接受 BaseMessage[]
 * ========================================================================
 */

import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  type BaseMessage,
} from '@langchain/core/messages';

/**
 * 数据库消息的通用接口
 * 对应 ChatMessageModel.getBySessionId() 返回的格式
 */
interface DbMessage {
  role: string;
  content: string;
  reasoning_content?: string | null;  // 模型原生推理过程（DeepSeek 等）
}

/**
 * 将数据库消息数组转换为 LangChain BaseMessage 数组
 *
 * 【转换规则】
 * - role === 'user'                → HumanMessage
 * - role === 'ai' / 'assistant'    → AIMessage
 * - role === 'system'              → SystemMessage
 *
 * 【历史压缩支持】
 * 当传入 historySummary 时，会在消息数组最前面插入一条 SystemMessage 摘要。
 * 此时 dbMessages 应该只包含未被摘要覆盖的近期消息（由 controller 查询时过滤）。
 *
 * @param dbMessages     - 数据库中的消息数组
 * @param maxRounds      - 最多保留的对话轮数（1 轮 = 1 条 user + 1 条 ai）
 * @param historySummary  - 可选，压缩后的历史摘要（来自 ai_chat_session.history_summary）
 * @returns BaseMessage[] - LangChain 格式的消息数组
 */
export const convertDbMessagesToLangChain = (
  dbMessages: DbMessage[],
  maxRounds: number = 20,
  historySummary?: string | null,
): BaseMessage[] => {
  // 滑动窗口：只保留最近 N 轮对话，防止 context 超长
  const maxMessages = maxRounds * 2;
  const recentMessages = dbMessages.length > maxMessages
    ? dbMessages.slice(-maxMessages)
    : dbMessages;

  const langChainMessages: BaseMessage[] = [];

  // 如果有压缩摘要，以 SystemMessage 注入到历史消息最前面
  if (historySummary) {
    langChainMessages.push(
      new SystemMessage(
        `以下是之前对话的结构化摘要，请据此恢复上下文。特别注意"用户偏好"节（遵守用户的选择和习惯）和"当前状态"节（延续最近的话题方向）：\n\n${historySummary}`
      )
    );
  }

  recentMessages.forEach((msg) => {
    switch (msg.role) {
      case 'user':
        langChainMessages.push(new HumanMessage(msg.content));
        break;
      case 'ai':
      case 'assistant':
        // 始终通过 additional_kwargs 传 reasoning_content 给 API
        // - 有值：传原始推理内容（DeepSeek 等思考模型需要）
        // - 无值：传空字符串（告诉 API "这条消息没有推理过程"）
        //
        // 【为什么不能省略】
        // DeepSeek V4 等模型默认开启思考模式，要求所有 assistant 消息
        // 都必须携带 reasoning_content 字段，哪怕是空字符串。
        // 省略此字段会导致 400 错误。
        // 对于不需要此字段的模型（OpenAI 等），额外的字段会被安全忽略。
        langChainMessages.push(new AIMessage({
          content: msg.content,
          additional_kwargs: {
            reasoning_content: msg.reasoning_content || '',
          },
        }));
        break;
      case 'system':
        langChainMessages.push(new SystemMessage(msg.content));
        break;
      default:
        // 未知角色默认当作用户消息处理
        langChainMessages.push(new HumanMessage(msg.content));
    }
  });

  return langChainMessages;
};
