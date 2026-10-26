/**
 * ========================================================================
 * 通用聊天 Agent 的 Prompt 模板
 * ========================================================================
 *
 * 【作用】
 * 定义通用聊天场景下 Agent 的系统提示词和 Prompt 模板结构。
 * 包含普通模式和深度思考模式两套 Prompt。
 *
 * 【和你学习资料的关系】
 * 你的学习资料第 6 节学了 ChatPromptTemplate，第 21 节看到了 openai-tools-agent 的 prompt：
 *   [system, chat_history, human, agent_scratchpad]
 * 这里用的是同样的结构，但我们自己定义内容，不从 LangChain Hub 拉取（更可控）。
 *
 * 【Prompt 模板的四个部分】
 * 1. system：系统提示词，定义 Agent 的角色和行为规则
 * 2. chat_history（MessagesPlaceholder）：历史对话消息，实现多轮记忆
 * 3. human：当前用户输入，{input} 是占位变量
 * 4. agent_scratchpad（MessagesPlaceholder）：Agent 的 "草稿纸"
 *    - 这是 Agent 记录思考过程的地方
 *    - 包含：之前的工具调用请求 + 工具返回的结果（Observation）
 *    - 类似你资料第 20 节 ReAct 中的 Thought/Action/Observation 记录
 *    - 但在 Tool Calling Agent 中，这些是结构化的 message 而非纯文本
 *
 * 【为什么用 MessagesPlaceholder 而不是普通变量】
 * 普通变量（如 {input}）只能注入一个字符串。
 * MessagesPlaceholder 可以注入一个 BaseMessage 数组（多条消息），
 * 这样历史对话中的每条消息都保留了 role（user/assistant）信息。
 * ========================================================================
 */

import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';

// ==================== 普通模式系统提示词 ====================
const CHAT_SYSTEM_PROMPT = `你是Knowvia平台的 AI 助手，一个知识渊博且善于思考的对话伙伴。

## 能力
- 回答各类知识问题，提供准确、有深度的分析
- 可以使用联网搜索工具获取最新信息（当你不确定答案或问题涉及实时信息时）
- 支持多轮对话，记住上下文

## 工具使用策略
- 当问题是常识性知识或你有充足把握时，直接回答，不必搜索
- 当问题涉及最新信息、实时数据、你不确定的事实时，按以下流程操作：
  1. 用 web_search 搜索，关键词中加上当前年份/月份以确保获取最新结果
  2. 如果搜索摘要已足够回答，直接综合回答
  3. 如果需要更详细信息，用 read_url 读取最相关的 1-2 个链接
  4. 基于完整内容综合回答
- web_search 最多调用 2 次，read_url 最多调用 2 次
- 不要同时并行调用多个工具，按顺序逐步执行
- 搜索/读取后，基于结果综合回答，不要简单复述内容
- 如果使用了搜索，在回答末尾标注信息来源

## 搜索关键词优化
- 当用户问“最新”“现在”“目前”等时效性问题时，搜索关键词必须包含当前年份或月份
- 示例：用户问“kimi最新模型”，搜索词应为“kimi 最新模型 2026年”而不是“kimi 最新模型”
- 优先搜索官方渠道：加上“官网”“官方”“发布”等限定词提高结果质量

## 回答风格
- 使用 Markdown 格式
- 结构清晰，善用标题、列表、表格
- 准确且有信息密度，避免空洞套话`;

// ==================== 深度思考模式系统提示词 ====================
const DEEP_THINKING_SYSTEM_PROMPT = `你是Knowvia平台的深度分析助手，擅长多角度、多层次地拆解和分析问题。

## 能力
- 将复杂问题拆解为子问题，逐个击破
- 使用联网搜索工具获取多来源信息，进行交叉验证
- 综合多个信息源，给出全面、深入的分析
- 识别信息中的不确定性和矛盾点

## 深度分析流程
1. **问题拆解**：识别用户问题中的关键变量和子问题
2. **信息收集**：对关键子问题进行针对性搜索，获取多源信息
3. **交叉验证**：对比不同来源的信息，识别一致性和矛盾点
4. **综合分析**：整合所有信息，构建完整的分析框架
5. **结论输出**：给出结构化的分析结论，标注不确定性

## 工具使用策略
- 按以下流程进行信息收集：
  1. 用 web_search 搜索关键子问题（最多 2 次，关键词加上当前年份/月份）
  2. 从搜索结果中选择最相关的链接，用 read_url 读取全文（最多 2 个）
  3. 基于完整内容进行交叉验证和综合分析
- 不要同时并行调用多个工具，按顺序逐步执行
- 搜索/读取后对结果进行批判性分析，而不是简单接受

## 搜索关键词优化
- 当用户问“最新”“现在”“目前”等时效性问题时，搜索关键词必须包含当前年份或月份
- 示例：用户问“kimi最新模型”，搜索词应为“kimi 最新模型 2026年”而不是“kimi 最新模型”
- 优先搜索官方渠道：加上“官网”“官方”“发布”等限定词提高结果质量

## 输出格式
- 使用 Markdown 格式
- 必须包含分析过程（不只给结论）
- 善用表格对比不同观点/方案
- 末尾标注所有信息来源`;

/**
 * 创建通用聊天 Agent 的 Prompt 模板
 *
 * 【ChatPromptTemplate.fromMessages() 的工作原理】
 * 接收一个消息模板数组，每个元素可以是：
 *   - ['system', '内容']          → SystemMessage
 *   - ['human', '{input}']        → HumanMessage（{input} 是占位符）
 *   - new MessagesPlaceholder('x') → 运行时注入一组消息
 *
 * 【最终生成的消息序列示例】
 * 假设用户问 "今天天气怎么样"，历史有 2 条消息，Agent 调用了搜索工具：
 *
 *   SystemMessage:    "你是知途平台的 AI 助手..."
 *   HumanMessage:     "你好"                              ← chat_history
 *   AIMessage:        "你好！有什么可以帮你的吗？"           ← chat_history
 *   HumanMessage:     "今天天气怎么样"                      ← {input}
 *   AIMessage:        { tool_calls: [web_search(...)] }    ← agent_scratchpad
 *   ToolMessage:      "搜索结果: 今天北京晴..."             ← agent_scratchpad
 *
 * Agent 看到完整的消息序列后，生成最终回答。
 */
export const createChatPrompt = (mode: number): ChatPromptTemplate => {
  // mode === 1 时使用深度思考 Prompt，否则使用普通 Prompt
  const basePrompt = mode === 1 ? DEEP_THINKING_SYSTEM_PROMPT : CHAT_SYSTEM_PROMPT;

  // 动态注入当前日期，让 Agent 直接知道时间，无需额外调用工具
  const now = new Date();
  const timeStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
  const systemPrompt = `当前日期：${timeStr}\n\n${basePrompt}`;

  return ChatPromptTemplate.fromMessages([
    // 1. 系统提示词：定义 Agent 的角色和规则（已含当前日期）
    ['system', systemPrompt],

    // 2. 历史对话：MessagesPlaceholder 会被替换为 BaseMessage[]
    //    变量名 'chat_history' 对应调用时传入的 { chat_history: [...] }
    new MessagesPlaceholder('chat_history'),

    // 3. 当前用户输入：{input} 会被替换为用户的消息文本
    ['human', '{input}'],

    // 4. Agent 草稿纸：记录工具调用过程
    //    createToolCallingAgent 会自动往这里填入工具调用记录
    //    你不需要手动管理它，AgentExecutor 会自动处理
    new MessagesPlaceholder('agent_scratchpad'),
  ]);
};
