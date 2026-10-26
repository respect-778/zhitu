/**
 * ========================================================================
 * 网页正文读取工具 (URL Reader Tool)
 * ========================================================================
 *
 * 【作用】
 * 访问指定 URL，提取网页正文内容，返回给 Agent 用于生成回答。
 * 配合 web_search 使用：先搜索拿到 URL 列表，再用此工具读取最相关的页面。
 *
 * 【为什么需要这个工具】
 * web_search 只返回标题 + 200 字摘要，信息密度低。
 * 很多问题需要读取网页全文才能得到准确答案（比如技术文档、新闻详情）。
 * 这个工具填补了"搜索到 URL"和"获取完整内容"之间的空白。
 *
 * 【实现原理】
 * 1. fetch 下载 HTML
 * 2. cheerio 解析 DOM
 * 3. 移除无用标签（script/style/nav 等）
 * 4. 提取正文文本（优先 article/main 标签）
 * 5. 截断到安全长度，防止上下文溢出
 * ========================================================================
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import * as cheerio from 'cheerio';

/**
 * 正文最大字符数
 * 3000 字符 ≈ 1100 tokens，留足空间给模型生成回答
 */
const MAX_CONTENT_CHARS = 3000;

/**
 * 请求超时时间（毫秒）
 * 避免某些慢站点阻塞 Agent 流程
 */
const REQUEST_TIMEOUT_MS = 10000;

export interface UrlReaderToolOptions {
  maxCalls?: number;
}

/**
 * 从 URL 获取并提取正文内容
 */
const fetchAndExtractContent = async (url: string): Promise<string> => {
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'follow',
    });

    if (!resp.ok) {
      return `无法访问该网页（HTTP ${resp.status}）。请尝试其他链接。`;
    }

    // 检查内容类型，只处理 HTML
    const contentType = resp.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return `该链接不是网页（类型: ${contentType}），无法提取文本内容。`;
    }

    const html = await resp.text();
    const $ = cheerio.load(html);

    // 移除干扰元素
    $('script, style, nav, header, footer, aside, iframe, noscript, svg, form, [role="navigation"], [role="banner"], [role="contentinfo"]').remove();
    // 移除广告和评论区域（常见类名）
    $('.ad, .ads, .advertisement, .comment, .comments, .sidebar, .related').remove();

    // 提取正文：优先使用语义化标签
    let text = '';
    const articleEl = $('article');
    const mainEl = $('main');
    const contentEl = $('.content, .post-content, .article-content, .entry-content, #content');

    if (articleEl.length > 0) {
      text = articleEl.text();
    } else if (mainEl.length > 0) {
      text = mainEl.text();
    } else if (contentEl.length > 0) {
      text = contentEl.first().text();
    } else {
      text = $('body').text();
    }

    // 清理多余空白
    text = text
      .replace(/[\t ]+/g, ' ')       // 多个空格/tab 合并
      .replace(/\n{3,}/g, '\n\n')    // 多个换行合并
      .replace(/^\s+$/gm, '')        // 清除纯空白行
      .trim();

    if (!text || text.length < 50) {
      return '该网页无法提取到有效文本内容（可能是纯图片/视频页面或需要登录）。请尝试其他链接。';
    }

    // 截断到安全长度
    if (text.length > MAX_CONTENT_CHARS) {
      return text.slice(0, MAX_CONTENT_CHARS) + '\n\n[内容过长，已截取前部分]';
    }

    return text;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
        return '读取网页超时（超过10秒），该网站响应太慢。请尝试其他链接。';
      }
      return `读取网页失败: ${error.message}`;
    }
    return '读取网页时发生未知错误。请尝试其他链接。';
  }
};

/**
 * 创建 URL 正文读取工具实例
 *
 * 【使用场景】
 * Agent 先调用 web_search 获取搜索结果（标题+摘要+URL），
 * 如果摘要不足以回答问题，再调用此工具读取最相关 URL 的完整内容。
 */
export const createUrlReaderTool = ({
  maxCalls = 2,
}: UrlReaderToolOptions = {}) => {
  let callCount = 0;
  const safeMaxCalls = Math.max(0, maxCalls);

  return new DynamicStructuredTool({
    name: 'read_url',
    description:
      '读取指定网页的正文内容。当搜索结果的摘要不足以回答用户问题时，' +
      '使用此工具读取最相关的网页获取详细信息。输入一个从搜索结果中获得的完整URL。' +
      '注意：每次对话最多读取2个网页，请只选择最相关的链接。',
    schema: z.object({
      url: z.string().url().describe('要读取的网页完整URL，必须以 http:// 或 https:// 开头'),
    }) as any,  // eslint-disable-line @typescript-eslint/no-explicit-any
    func: async ({ url }: { url: string }): Promise<string> => {
      if (callCount >= safeMaxCalls) {
        return '网页读取次数预算已用完。请基于已有搜索结果和上下文直接回答，不要继续读取网页。';
      }

      callCount += 1;
      return await fetchAndExtractContent(url);
    },
  });
};
