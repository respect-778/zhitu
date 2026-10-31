/**
 * ========================================================================
 * 联网搜索工具 (Web Search Tool)
 * ========================================================================
 *
 * 【作用】
 * 封装博查 (Bocha) 搜索 API，让 LangChain Agent 能够调用联网搜索。
 * 当 Agent（模型）判断用户的问题需要最新信息时，会自动调用这个工具。
 *
 * 【和你学习资料的关系】
 * 你的学习资料第 20 节用的是 `new SerpAPI()`，第 21 节讲了自定义 Tool。
 * 博查没有 LangChain 官方集成，所以我们用 DynamicStructuredTool 自定义。
 * 这就是第 21 节 "自定义 Tool" 的实战应用。
 *
 * 【DynamicStructuredTool vs DynamicTool】
 * - DynamicTool：只支持单一字符串输入（你资料第 21 节的 string-reverser 例子）
 * - DynamicStructuredTool：支持 zod schema 定义复杂输入结构
 *   我们用后者，因为搜索工具需要一个 query 参数，用 zod 校验更严谨。
 *
 * 【可插拔设计】
 * 如果以后想换成 Tavily 或其他搜索 API，只需要改这一个文件的 fetch 调用，
 * 工具的名称、描述、输入输出格式都保持不变，Agent 层代码零改动。
 *
 * 【博查 API 文档参考】
 * https://open.bochaai.com/
 * ========================================================================
 */

import { DynamicStructuredTool, type ToolSchemaBase } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * 博查搜索 API 返回的数据结构（简化版，只取我们需要的字段）
 */
interface BochaSearchResult {
  title: string;
  url: string;
  summary: string;
}

interface BochaApiResponse {
  code?: number;
  msg?: string;
  data?: {
    webPages?: {
      value?: Array<{
        name?: string;
        url?: string;
        snippet?: string;
      }>;
    };
  };
}

/**
 * 调用博查搜索 API 的底层函数
 *
 * 【为什么单独抽出来】
 * 1. 方便单元测试（可以 mock 这个函数）
 * 2. 方便以后换搜索源（只改这个函数的实现）
 * 3. Tool 的 func 只负责格式化输出，不关心 HTTP 细节
 */
const MAX_SUMMARY_CHARS = 160;
const MAX_TOTAL_OUTPUT_CHARS = 2000;

const webSearchInputSchema = z.object({
  query: z.string().describe('搜索查询词，应该是简洁明确的搜索关键词或问题'),
});

export interface WebSearchToolOptions {
  maxCalls?: number;
  resultCount?: number;
}

const fetchBochaSearch = async (query: string, count: number = 3): Promise<BochaSearchResult[]> => {
  const apiKey = process.env.BOCHA_API_KEY || '';
  if (!apiKey) {
    return [{ title: '搜索配置错误', url: '', summary: '未配置 BOCHA_API_KEY 环境变量' }];
  }

  try {
    const resp = await fetch('https://api.bochaai.com/v1/web-search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        count,
        summary: true,  // 让博查返回摘要，减少 token 消耗
      }),
    });

    if (!resp.ok) {
      const errorText = await resp.text().catch(() => '');
      console.error(`博查搜索失败 [${resp.status}]:`, errorText);
      return [{ title: '搜索失败', url: '', summary: `搜索服务返回错误: ${resp.status}` }];
    }

    const data = (await resp.json()) as BochaApiResponse;

    // 解析博查的返回格式
    const webPages = data?.data?.webPages?.value || [];
    if (webPages.length === 0) {
      return [{ title: '无结果', url: '', summary: `未找到与 "${query}" 相关的搜索结果` }];
    }

    return webPages.map((item) => {
      const summary = item.snippet || '';
      return {
        title: item.name || '无标题',
        url: item.url || '',
        summary: summary.length > MAX_SUMMARY_CHARS
          ? summary.slice(0, MAX_SUMMARY_CHARS) + '...'
          : summary,
      };
    });
  } catch (error) {
    console.error('博查搜索异常:', error);
    return [{ title: '搜索异常', url: '', summary: '搜索服务暂时不可用，请稍后重试' }];
  }
};

/**
 * 创建联网搜索工具实例
 *
 * 【Tool 的三要素】（你学习资料第 21 节的核心内容）
 * 1. name：工具名称，Agent 在决定调用哪个工具时用这个名字
 * 2. description：工具描述，Agent（模型）根据这段描述判断什么时候该调用这个工具
 *    - 描述越准确，Agent 调用的时机就越合理
 *    - 这是 prompt engineering 的一部分
 * 3. func：工具的实际执行函数，接收 Agent 传入的参数，返回字符串结果给 Agent
 *
 * 【schema 的作用】
 * 用 zod 定义输入参数的格式，Agent 调用工具时会按这个格式生成参数。
 * 如果参数格式错误，zod 会返回校验错误信息给 Agent，Agent 会自动修正。
 *
 * 【返回值必须是字符串】
 * LangChain 的 Tool 返回值必须是字符串，Agent 会把这个字符串作为 "观察结果"
 * 放入上下文中，帮助模型做下一步推理（和你资料第 20 节的 Observation 一样）。
 */
export const createWebSearchTool = ({
  maxCalls = 2,
  resultCount = 3,
}: WebSearchToolOptions = {}) => {
  let callCount = 0;
  const safeMaxCalls = Math.max(0, maxCalls);
  const safeResultCount = Math.min(Math.max(1, resultCount), 8);

  return new DynamicStructuredTool<ToolSchemaBase, unknown, unknown, string>({
    name: 'web_search',
    description:
      '联网搜索工具。当用户的问题涉及最新信息、实时数据、你不确定的事实、' +
      '或需要验证的知识时，使用此工具搜索互联网获取最新信息。' +
      '输入应该是一个清晰的搜索查询词。',
    schema: webSearchInputSchema as unknown as ToolSchemaBase,
    /**
     * 工具执行函数
     *
     * 【执行流程】
     * 1. Agent 决定调用 web_search 工具，传入 { query: "..." }
     * 2. 这个函数执行搜索，返回格式化的结果字符串
     * 3. Agent 将结果作为 Observation 放入上下文
     * 4. Agent 根据搜索结果生成最终回答
     *
     * 【为什么返回 JSON 字符串】
     * 返回结构化的 JSON 字符串而非纯文本，
     * 是为了让 Agent 能清晰地区分标题、URL、摘要，
     * 方便在最终回答中引用来源。
     */
    func: async (input: unknown): Promise<string> => {
      const { query } = webSearchInputSchema.parse(input);
      if (callCount >= safeMaxCalls) {
        return '搜索次数预算已用完。请基于已有搜索结果和上下文直接回答，不要继续搜索。';
      }

      callCount += 1;
      const results = await fetchBochaSearch(query, safeResultCount);

      // 格式化为 Agent 友好的字符串
      // Agent 会基于这些信息生成回答，并在末尾附上来源 URL
      const formatted = results.map((r, i) => (
        `[${i + 1}] ${r.title}\n链接: ${r.url}\n摘要: ${r.summary}`
      )).join('\n\n');

      // 截断总输出，防止多次搜索累积导致 scratchpad 上下文溢出
      if (formatted.length > MAX_TOTAL_OUTPUT_CHARS) {
        return formatted.slice(0, MAX_TOTAL_OUTPUT_CHARS) + '\n\n[搜索结果过长，已截断]';
      }
      return formatted;
    },
  });
};

/**
 * 从搜索工具的原始结果中提取来源信息
 * 用于在流式输出结束后，将搜索来源 URL 发送给前端展示
 */
export const parseSearchSources = (toolOutput: string): Array<{ title: string; url: string }> => {
  const sources: Array<{ title: string; url: string }> = [];
  // 匹配格式：[n] 标题\n链接: URL
  const regex = /\[(\d+)\]\s*(.+)\n链接:\s*(\S+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(toolOutput)) !== null) {
    const title = match[2]?.trim() || '';
    const url = match[3]?.trim() || '';
    if (url && url !== '' && !url.includes('搜索')) {
      sources.push({ title, url });
    }
  }

  return sources;
};
