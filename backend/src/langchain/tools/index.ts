/**
 * ========================================================================
 * 工具注册表 (Tool Registry)
 * ========================================================================
 *
 * 【作用】
 * 集中管理所有可用的 LangChain 工具，根据场景类型返回对应的工具集合。
 * Agent 能做什么，完全取决于你给它提供了哪些工具。
 *
 * 【和你学习资料的关系】
 * 你的学习资料第 20 节：`const tools = [new SerpAPI(), new Calculator()]`
 * 这里做的是同样的事情，只是通过函数按场景返回不同的工具组合。
 *
 * 【设计原则】（你学习资料第 21 节的总结）
 * "tools 并不是越多越好，而是根据需求去设计"
 * - 每个 scene 只给必要的工具，避免上下文浪费
 * - 工具的 name 和 description 会被注入到 prompt 中，占用 token
 * ========================================================================
 */

import { createWebSearchTool } from './webSearchTool';
import { createUrlReaderTool } from './urlReaderTool';

/**
 * 根据场景类型获取对应的工具集合
 *
 * 目前所有需要搜索的场景都只有一个搜索工具，
 * 后续可以按需添加更多工具（如计算器、代码执行、URL 阅读器等）
 */
export const getToolsForScene = (sceneType: string, mode: number = 0) => {
  switch (sceneType) {
    // 通用聊天：提供联网搜索 + 网页读取（当前时间已注入 Prompt，无需工具）
    case 'chat': {
      const isDeepMode = mode === 1;
      return [
        createWebSearchTool({
          maxCalls: isDeepMode ? 2 : 1,
          resultCount: 5,
        }),
        createUrlReaderTool({
          maxCalls: isDeepMode ? 2 : 1,
        }),
      ];
    }

    // 文章总结：提供联网搜索 + 网页读取
    case 'article_summary':
      return [
        createWebSearchTool({
          maxCalls: 1,
          resultCount: 5,
        }),
        createUrlReaderTool({
          maxCalls: 1,
        }),
      ];

    // 其他场景：不提供工具（纯对话模式）
    default:
      return [];
  }
};

// 导出工具创建函数，方便外部单独使用
export { createWebSearchTool } from './webSearchTool';
export { parseSearchSources } from './webSearchTool';
export { createUrlReaderTool } from './urlReaderTool';
