/**
 * ========================================================================
 * 流式适配器 (Stream Adapter)
 * ========================================================================
 *
 * 【作用】
 * 将 LangChain AgentExecutor 的 streamEvents 输出转换为 SSE 格式，
 * 通过 Express Response 发送给前端。
 *
 * 【为什么需要这个文件】
 * 旧代码中 chatController.ts 有约 150 行手写的 SSE 解析代码，
 * 分别处理 OpenAI 和 Anthropic 两种不同的流式格式。
 * 现在用 LangChain，所有供应商的流式输出被统一为 streamEvents 事件流，
 * 这个适配器把 LangChain 事件流 → 前端 SSE 格式，一套代码搞定所有供应商。
 *
 * 【streamEvents 是什么】（你学习资料里没有，这是较新的 API）
 * 你的学习资料第 4 节学了 model.stream()，它返回文本 token 流。
 * 但在 Agent 场景中，除了文本 token，还有工具调用、工具返回等事件。
 * streamEvents 是 LangChain v0.2+ 引入的统一事件流 API，能捕获：
 *   - on_chat_model_stream：模型输出的每个 token（用于前端流式展示）
 *   - on_tool_start：Agent 开始调用工具（用于前端展示 "搜索中..."）
 *   - on_tool_end：工具调用完成（用于收集搜索来源）
 *   - on_chain_start/end 等其他事件
 *
 * 【SSE 事件格式】（发送给前端的格式）
 * 1. 推理过程：  data: {"reasoning":"xxx"}\n\n         ← 模型原生思考过程
 * 2. 搜索状态：  data: {"status":"searching","query":"xxx"}\n\n
 * 3. 文本内容：  data: {"content":"xxx"}\n\n
 * 4. 搜索来源：  data: {"sources":[{"title":"...","url":"..."}]}\n\n
 * 5. 结束标记：  data: [DONE]\n\n
 * ========================================================================
 */

import type { Response } from 'express';
import type { AgentExecutor } from 'langchain/agents';
import { parseSearchSources } from '../tools/webSearchTool';

/**
 * 流式执行的结果
 */
export interface StreamResult {
  fullContent: string;  // 完整的 AI 回复文本（用于保存到数据库）
  reasoningContent: string;  // 模型原生推理过程（DeepSeek reasoning_content 等）
  sources: Array<{ title: string; url: string }>;  // 搜索来源列表
}

export interface StreamAgentToSseOptions {
  onClientDisconnect?: (result: StreamResult) => void | Promise<void>;
}

/**
 * 设置 SSE 响应头
 * 告诉浏览器这是一个 Server-Sent Events 流
 */
export const setSseHeaders = (res: Response): void => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
};

/**
 * 向前端发送 SSE 错误并结束连接
 */
export const writeSseError = (res: Response, message: string): void => {
  res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
};

/**
 * 执行 Agent 并将结果以 SSE 格式流式发送给前端
 *
 * 【这是整个 LangChain 层最核心的函数】
 * 它负责 "消费" AgentExecutor 产生的事件流，转换为前端能理解的 SSE 格式。
 *
 * 【完整的事件流程示例】
 * 假设用户问 "今天比特币价格多少"：
 *
 *   1. AgentExecutor 启动
 *   2. 模型判断需要搜索 → 触发 on_tool_start { tool: 'web_search', input: '比特币价格' }
 *      → 我们发送 SSE: {"status":"searching","query":"比特币价格"}
 *   3. 博查搜索完成 → 触发 on_tool_end { output: '[1] 比特币...' }
 *      → 我们收集搜索来源 URL
 *   4. 模型开始生成回答 → 多次触发 on_chat_model_stream { chunk: 'xxx' }
 *      → 我们逐个发送 SSE: {"content":"xxx"}
 *   5. 模型完成 → 我们发送搜索来源 + [DONE]
 *
 * 【为什么用 streamEvents 而不是 stream】
 * executor.stream() 只返回最终输出，看不到中间的工具调用过程。
 * executor.streamEvents() 返回所有中间事件，让我们能：
 *   - 在搜索时通知前端展示 "搜索中..."
 *   - 收集搜索来源 URL
 *   - 实时流式输出模型的每个 token
 *
 * @param executor - LangChain AgentExecutor 实例
 * @param input    - 传给 Agent 的输入参数
 * @param res      - Express Response 对象
 * @returns StreamResult - 包含完整回复和搜索来源
 */
export const streamAgentToSse = async (
  executor: AgentExecutor,
  input: Record<string, unknown>,
  res: Response,
  options: StreamAgentToSseOptions = {}
): Promise<StreamResult> => {
  let fullContent = '';
  let reasoningContent = '';  // 累积模型的推理过程
  const allSources: Array<{ title: string; url: string }> = [];
  let searchingEventSent = false;  // 防止重复发送 searching 状态

  // 客户端断连检测：用户关闭页面或点击暂停时，前端 abort → TCP 断开 → 触发 close
  let clientDisconnected = false;
  let clientDisconnectHandled = false;
  const streamAbortController = new AbortController();

  res.on('close', () => {
    if (res.writableEnded || clientDisconnectHandled) return;

    clientDisconnected = true;
    clientDisconnectHandled = true;
    streamAbortController.abort();

    if (fullContent.trim() && options.onClientDisconnect) {
      void Promise.resolve(
        options.onClientDisconnect({ fullContent, reasoningContent, sources: allSources })
      ).catch(error => {
        console.error('保存客户端断开前的 AI 内容失败:', error);
      });
    }
  });

  try {
    /**
     * 【streamEvents 调用】
     * version: 'v2' 是当前推荐的事件格式版本
     * 返回一个 AsyncIterableIterator，用 for await 遍历每个事件
     *
     * 每个 event 的结构：
     * {
     *   event: 'on_chat_model_stream' | 'on_tool_start' | 'on_tool_end' | ...,
     *   name: 工具名或模型名,
     *   data: { chunk?: AIMessageChunk, input?: {...}, output?: string },
     * }
     */
    const eventStream = executor.streamEvents(input, {
      version: 'v2',
      signal: streamAbortController.signal
    });

    for await (const event of eventStream) {
      // 客户端已断开，停止处理后续事件，节省 token 消耗
      if (clientDisconnected) break;

      // ==================== 事件 1：模型输出 token ====================
      // 这是最常见的事件，每个 token 触发一次
      // 对应你旧代码中 processOpenAiEvent / processAnthropicEvent 的功能
      if (event.event === 'on_chat_model_stream') {
        const chunk = event.data?.chunk;

        // ========== 推理过程（reasoning_content） ==========
        // LangChain 会把各厂商的特殊字段放进 additional_kwargs：
        //   - DeepSeek: additional_kwargs.reasoning_content
        //   - Anthropic: 通过 thinking content block（未来扩展）
        // 有就发给前端，没有就跳过 —— 对前端透明
        const reasoning = chunk?.additional_kwargs?.reasoning_content
          || chunk?.additional_kwargs?.thinking
          || '';
        if (typeof reasoning === 'string' && reasoning) {
          reasoningContent += reasoning;
          res.write(`data: ${JSON.stringify({ reasoning })}\n\n`);
        }

        // ========== 正式回答内容 ==========
        if (chunk && typeof chunk.content === 'string' && chunk.content) {
          fullContent += chunk.content;
          res.write(`data: ${JSON.stringify({ content: chunk.content })}\n\n`);
        }
      }

      // ==================== 事件 2：Agent 开始调用工具 ====================
      // 当 Agent 决定调用搜索工具时触发
      // 前端收到这个事件后，可以把 "思考中..." 切换为 "搜索中..."
      // 只发送一次 searching 事件，防止 Agent 多次调用工具时重复推送
      else if (event.event === 'on_tool_start') {
        const toolName = event.name || '';
        const toolInput = event.data?.input;

        if (toolName === 'web_search' && !searchingEventSent) {
          // 从 toolInput 中提取搜索关键词
          // toolInput 可能是: string | { query: string } | { input: string } | 其他
          let query = '';
          if (typeof toolInput === 'string') {
            try { query = JSON.parse(toolInput).query || toolInput; }
            catch { query = toolInput; }
          } else if (toolInput && typeof toolInput === 'object') {
            const obj = toolInput as Record<string, unknown>;
            query = String(obj.query || obj.input || '');
          }

          searchingEventSent = true;
          res.write(`data: ${JSON.stringify({
            status: 'searching',
            query,
          })}\n\n`);
        }
        // 通知前端正在读取网页内容
        else if (toolName === 'read_url') {
          let url = '';
          if (typeof toolInput === 'string') {
            try { url = JSON.parse(toolInput).url || toolInput; }
            catch { url = toolInput; }
          } else if (toolInput && typeof toolInput === 'object') {
            const obj = toolInput as Record<string, unknown>;
            url = String(obj.url || '');
          }

          res.write(`data: ${JSON.stringify({
            status: 'reading',
            url,
          })}\n\n`);
        }
      }

      // ==================== 事件 3：工具调用完成 ====================
      // 搜索工具返回结果后触发
      // 我们从结果中提取来源 URL，在流结束时发给前端
      else if (event.event === 'on_tool_end') {
        const toolOutput = event.data?.output;
        if (typeof toolOutput === 'string') {
          const sources = parseSearchSources(toolOutput);
          allSources.push(...sources);
        }
      }
    }

    // ==================== 流结束后：发送搜索来源 ====================
    // 仅在客户端仍连接时发送收尾数据
    if (!clientDisconnected) {
      if (allSources.length > 0) {
        // 去重（同一个 URL 可能出现多次）
        const uniqueSources = allSources.filter(
          (source, index, self) =>
            index === self.findIndex((s) => s.url === source.url)
        );
        res.write(`data: ${JSON.stringify({ sources: uniqueSources })}\n\n`);
      }

      // 发送结束标记
      res.write('data: [DONE]\n\n');
      res.end();
    }

    return { fullContent, reasoningContent, sources: allSources };
  } catch (error) {
    // 客户端主动断开（用户暂停/关闭页面）导致的 AbortError，属于正常行为
    if (clientDisconnected) {
      console.log('客户端已断开，流式输出终止，已累积内容长度:', fullContent.length);
      return { fullContent, reasoningContent, sources: allSources };
    }

    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('流式输出错误:', errMsg);
    console.error('错误详情:', error);
    writeSseError(res, `生成回答时发生错误: ${errMsg}`);
    return { fullContent, reasoningContent, sources: allSources };
  }
};
