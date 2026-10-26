/**
 * ========================================================================
 * 模型工厂 (Model Factory)
 * ========================================================================
 *
 * 【作用】
 * 根据项目现有的 ProviderConfig（来自 utils/aiProvider.ts）+ 用户的 apiKey，
 * 创建对应的 LangChain ChatModel 实例。
 *
 * 【为什么需要这个文件】
 * 你的项目支持 7 个 AI 供应商（OpenAI/Anthropic/Google/Moonshot/Deepseek/Qwen/GLM），
 * 在旧代码中，chatController 通过 raw fetch 手动构建请求头和请求体来调用它们。
 * 现在用 LangChain，只需要创建一个 ChatModel 实例，LangChain 会帮你处理：
 *   - 请求格式（OpenAI 格式 vs Anthropic 格式）
 *   - 流式解析（不用再手写 SSE parser）
 *   - 工具调用（自动处理 function calling 协议）
 *   - 重试和错误处理
 *
 * 【和你学习资料的关系】
 * 你的学习资料第 4 节中，直接 `new ChatOpenAI()` 不传参数，
 * 因为教程默认用环境变量 OPENAI_API_KEY。
 * 这里需要动态传参，因为你的用户各自配置不同的 provider 和 apiKey。
 *
 * 【关键概念】
 * - ChatOpenAI：LangChain 对 OpenAI 兼容 API 的封装，
 *   所有兼容 OpenAI 格式的供应商（Deepseek/Moonshot/Qwen/GLM/Google）都用这个类，
 *   只需要改 baseURL 指向对应供应商的 API 地址。
 * - ChatAnthropic：LangChain 对 Anthropic API 的封装，
 *   Anthropic 有自己独特的 API 格式，所以需要单独的类。
 * - BaseChatModel：两者的公共父类，上层代码只依赖这个抽象类型，
 *   不关心底层是 OpenAI 还是 Anthropic。
 * ========================================================================
 */

import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ProviderConfig } from '../../utils/aiProvider';

/**
 * 创建 LangChain ChatModel 实例的参数
 */
export interface CreateModelParams {
  provider: ProviderConfig;  // 来自 utils/aiProvider.ts 的供应商配置
  apiKey: string;            // 用户的 API Key（已解密）
  modelName: string;         // 模型名称，如 'gpt-4.1-mini'、'deepseek-chat'
  temperature?: number;      // 温度参数，控制输出随机性，默认 0.7
  maxTokens?: number;        // 最大输出 token 数
  streaming?: boolean;       // 是否启用流式输出，默认 true
  modelKwargs?: Record<string, unknown>;  // 传递给模型 API 的额外参数（如 DeepSeek 的 thinking 控制）
}

/**
 * 从 provider 的完整 API URL 中提取 baseURL
 *
 * 【为什么需要这个函数】
 * 你的 aiProvider.ts 中，baseUrl 存的是完整的请求地址，例如：
 *   - Deepseek: 'https://api.deepseek.com/v1/chat/completions'
 *   - Qwen:     'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
 *
 * 但 LangChain 的 ChatOpenAI 需要的是不含 /chat/completions 的 baseURL：
 *   - Deepseek: 'https://api.deepseek.com/v1'
 *   - Qwen:     'https://dashscope.aliyuncs.com/compatible-mode/v1'
 *
 * 因为 ChatOpenAI 内部会自动拼接 /chat/completions 路径。
 */
const extractBaseUrl = (fullUrl: string): string => {
  // 移除末尾的 /chat/completions（如果有的话）
  return fullUrl.replace(/\/chat\/completions\/?$/, '');
};

/**
 * 创建 LangChain ChatModel 实例
 *
 * 【这是整条 Chain 的起点】
 * 在 LangChain 中，所有的 Chain 和 Agent 都需要一个 ChatModel 作为 "大脑"。
 * 这个函数就是创建这个 "大脑" 的工厂方法。
 *
 * 后续在 Agent 中的使用方式：
 *   const model = createChatModel({ provider, apiKey, modelName });
 *   const agent = createToolCallingAgent({ llm: model, tools, prompt });
 *
 * @returns BaseChatModel - LangChain 的模型抽象基类
 */
export const createChatModel = ({
  provider,
  apiKey,
  modelName,
  temperature = 0.7,
  maxTokens,
  streaming = true,
  modelKwargs,
}: CreateModelParams): BaseChatModel => {
  /**
   * 【分支逻辑】
   * 你的 7 个供应商中，只有 Anthropic 使用自己独特的 API 格式，
   * 其余 6 个（OpenAI/Google/Moonshot/Deepseek/Qwen/GLM）全部兼容 OpenAI 格式。
   * 所以只需要两个分支：
   *   - apiStyle === 'anthropic' → ChatAnthropic
   *   - apiStyle === 'openai'    → ChatOpenAI（通过 baseURL 区分不同供应商）
   */
  if (provider.apiStyle === 'anthropic') {
    // ==================== Anthropic 供应商 ====================
    // @ts-expect-error -- LangChain 的泛型嵌套层级过深，TS 编译器报 "类型实例化过深"，不影响运行
    return new ChatAnthropic({
      anthropicApiKey: apiKey,
      modelName,
      temperature,
      maxTokens: maxTokens ?? 4096,  // Anthropic 要求必须传 maxTokens
      streaming,
    });
  }

  // ==================== OpenAI 兼容供应商（6 个） ====================
  // 包括：OpenAI / Google / Moonshot / Deepseek / Qwen / GLM
  const baseUrl = extractBaseUrl(provider.baseUrl);

  // Kimi K2.6 只允许 top_p=0.95，需要强制覆盖
  const isMoonshot = provider.baseUrl.includes('moonshot');

  // @ts-expect-error -- LangChain 的泛型嵌套层级过深，TS 编译器报 "类型实例化过深"，不影响运行
  return new ChatOpenAI({
    openAIApiKey: apiKey,
    modelName,
    temperature,
    ...(isMoonshot && { topP: 0.95 }),
    ...(maxTokens !== undefined && { maxTokens }),
    streaming,
    configuration: {
      // 【关键】通过 baseURL 让 ChatOpenAI 请求不同供应商的 API
      // 例如传入 'https://api.deepseek.com/v1'，
      // ChatOpenAI 内部会请求 'https://api.deepseek.com/v1/chat/completions'
      baseURL: baseUrl,
    },
    // 额外的模型 API 参数（如 DeepSeek 的 thinking 控制）
    // 会被展开到 API 请求体中
    ...(modelKwargs && { modelKwargs }),
  });
};
