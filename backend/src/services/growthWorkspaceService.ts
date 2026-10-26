import { createHash, randomUUID } from 'crypto';
import MarkdownIt from 'markdown-it';
import { load } from 'cheerio';
import { PostModel } from '../models/Post';
import { ChatSessionModel } from '../models/ChatSession';
import { ChatMessageModel } from '../models/ChatMessage';

export class GrowthRequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const markdown = new MarkdownIt({ html: true, linkify: true });
const normalizeText = (text: string) => text.normalize('NFC').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();

export function validateWorkspace(data: unknown): asserts data is Record<string, any> {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray((data as any).files)) {
    throw new GrowthRequestError(400, '无效的工作区数据');
  }
  const ids = new Set<string>();
  for (const file of (data as any).files) {
    if (!file || typeof file !== 'object' || typeof file.id !== 'string' || !file.id || ids.has(file.id) ||
        !['file', 'folder'].includes(file.type) || (file.content !== undefined && typeof file.content !== 'string')) {
      throw new GrowthRequestError(400, '工作区包含无效或重复的文件');
    }
    ids.add(file.id);
  }
}

export function preserveCitationSources(incoming: Record<string, any>, previous: Record<string, any> | null) {
  const oldFiles = new Map<string, any>((previous?.files || []).map((file: any) => [file.id, file]));
  const files = incoming.files.map((file: any) => {
    const oldFile = oldFiles.get(file.id);
    const metadata = { ...file.metadata };
    const protectedFields = ['sourceId', 'sourceType', 'citations'];
    for (const field of protectedFields) {
      if (metadata[field] !== undefined && JSON.stringify(metadata[field]) !== JSON.stringify(oldFile?.metadata?.[field])) {
        throw new GrowthRequestError(400, '引用来源只能通过引用接口建立，不能在笔记保存时改写');
      }
      if (oldFile?.metadata?.[field] !== undefined) metadata[field] = oldFile.metadata[field];
      else delete metadata[field];
    }
    return { ...file, ...(file.metadata || oldFile?.metadata ? { metadata } : {}) };
  });
  return { ...incoming, files };
}

interface VerifiedCitation {
  sourceId: string;
  sourceType: 'community' | 'chat';
  sourceTitle: string;
  sourcePath: string;
  text: string;
  question?: string;
  messageId?: number;
  sourceUpdatedAt?: string;
}

export async function resolveCitation(userId: number, input: Record<string, unknown>): Promise<VerifiedCitation> {
  const sourceType = input.sourceType ?? 'community';
  if (!['community', 'chat'].includes(String(sourceType))) throw new GrowthRequestError(400, '无效的引用来源类型');
  if (typeof input.sourceId !== 'string' && typeof input.sourceId !== 'number') throw new GrowthRequestError(400, '无效的来源编号');
  const sourceId = String(input.sourceId);
  if (sourceType === 'chat') {
    const session = /^\d+$/.test(sourceId)
      ? await ChatSessionModel.findByIdAndUserId(Number(sourceId), userId)
      : await ChatSessionModel.findByUuidAndUserId(sourceId, userId);
    if (!session) throw new GrowthRequestError(404, '对话不存在或无权引用');
    if (!Number.isSafeInteger(input.messageId) || Number(input.messageId) <= 0) {
      throw new GrowthRequestError(400, '请提供已保存的 AI 消息编号');
    }
    const messages = await ChatMessageModel.getBySessionId(session.id);
    const messageIndex = messages.findIndex(message => message.id === input.messageId && message.role === 'ai');
    if (messageIndex < 0) throw new GrowthRequestError(404, '消息不存在或不属于该对话');
    const message = messages[messageIndex];
    if (typeof input.text !== 'string' || input.text.replace(/\r\n/g, '\n').trim() !== message.content.replace(/\r\n/g, '\n').trim()) {
      throw new GrowthRequestError(400, '引用内容与已保存的 AI 消息不一致');
    }
    const question = messages.slice(0, messageIndex).reverse().find(previous => previous.role === 'user');
    return {
      sourceType: 'chat', sourceId: session.uuid, sourceTitle: session.session_title,
      sourcePath: `/chat/${encodeURIComponent(session.uuid)}`, text: message.content,
      question: question?.content, messageId: message.id,
    };
  }
  const articleId = Number(sourceId);
  if (!/^\d+$/.test(sourceId) || !Number.isSafeInteger(articleId) || articleId <= 0) {
    throw new GrowthRequestError(400, '无效的文章编号');
  }
  const article = await PostModel.findById(articleId);
  if (!article) throw new GrowthRequestError(404, '文章不存在或无权引用');
  if (typeof input.text !== 'string' || !normalizeText(input.text)) throw new GrowthRequestError(400, '引用选段不能为空');
  const document = load(markdown.render(article.content));
  document('script, style').remove();
  document('br').replaceWith('\n');
  document('p, div, li, h1, h2, h3, h4, h5, h6, tr, pre, blockquote').append('\n');
  if (!normalizeText(document.root().text()).includes(normalizeText(input.text))) {
    throw new GrowthRequestError(400, '引用选段与文章原文不一致，请重新选择');
  }
  return {
    sourceType: 'community', sourceId: String(article.id), sourceTitle: article.title,
    sourcePath: `/community/${article.id}`, text: input.text,
    sourceUpdatedAt: article.updated_at ? new Date(article.updated_at).toISOString() : undefined,
  };
}

function createDefaultWorkspace(): Record<string, any> {
  return {
    files: [
      { id: 'folder-plan', name: '我的规划', type: 'folder', parentId: null, order: 0 },
      { id: 'folder-notes', name: '学习笔记', type: 'folder', parentId: null, order: 1 },
      { id: 'folder-cite', name: '引用收藏', type: 'folder', parentId: null, order: 2 },
      { id: 'folder-summary', name: '周总结', type: 'folder', parentId: null, order: 3 },
      { id: 'folder-archive', name: '成长档案', type: 'folder', parentId: null, order: 4 },
    ],
    openTabs: [], activeTabId: null, expandedFolderIds: ['folder-plan', 'folder-notes'],
    activePlan: null, mentorId: null,
  };
}

export function appendCitation(workspace: Record<string, any> | null, citation: VerifiedCitation, result: { fileId: string; duplicate: boolean }) {
  // Called inside mutate's transaction: initialization and the first reference commit together.
  workspace = workspace === null ? createDefaultWorkspace() : workspace;
  validateWorkspace(workspace);
  const citationFolder = workspace.files.find((file: any) => file.id === 'folder-cite');
  if (citationFolder && citationFolder.type !== 'folder') {
    throw new GrowthRequestError(400, '引用收藏目录编号已被文件占用，请先处理该文件');
  }
  if (!citationFolder) {
    const lastRootOrder = workspace.files.reduce((last: number, file: any) =>
      file.parentId === null && Number.isFinite(file.order) ? Math.max(last, file.order) : last, -1);
    workspace.files.push({ id: 'folder-cite', name: '引用收藏', type: 'folder', parentId: null, order: lastRootOrder + 1 });
  }
  const timestamp = new Date().toISOString();
  const citationKey = createHash('sha256').update(JSON.stringify([
    citation.sourceType, citation.sourceId, citation.messageId ?? null, normalizeText(citation.text),
  ])).digest('hex');
  let file = workspace.files.find((candidate: any) => candidate.parentId === 'folder-cite' && candidate.fileType === 'article_cite' &&
    candidate.metadata?.sourceId === citation.sourceId && (candidate.metadata?.sourceType || 'community') === citation.sourceType);
  if (file?.metadata?.citations?.some((entry: any) => entry.citationKey === citationKey)) {
    result.fileId = file.id;
    result.duplicate = true;
    return workspace;
  }
  const quote = (text: string) => text.split('\n').map(line => `> ${line}`).join('\n');
  const shortTime = timestamp.slice(0, 16).replace('T', ' ');
  const body = citation.question
    ? `**我的问题：**\n\n${quote(citation.question)}\n\n**AI 回复：**\n\n${quote(citation.text)}`
    : quote(citation.text);
  if (!file) {
    const title = citation.sourceTitle.replace(/[\\[\]]/g, '\\$&');
    file = {
      id: randomUUID(), name: citation.sourceTitle.slice(0, 30), type: 'file', parentId: 'folder-cite', fileType: 'article_cite',
      content: `> 来源: [${title}](${citation.sourcePath})  \n> 首次收藏: ${shortTime}`,
      metadata: { sourceId: citation.sourceId, sourceType: citation.sourceType, tags: [], createdAt: timestamp, updatedAt: timestamp, citations: [] },
      order: workspace.files.filter((candidate: any) => candidate.parentId === 'folder-cite').length,
    };
    workspace.files.push(file);
  }
  file.content = (file.content || '') + `\n\n---\n\n${body}\n\n— ${shortTime}`;
  file.metadata.updatedAt = timestamp;
  file.metadata.citations = [...(file.metadata.citations || []), {
    ...citation, citationKey, createdAt: timestamp,
    contentHash: createHash('sha256').update(citation.text).digest('hex'),
  }];
  result.fileId = file.id;
  return workspace;
}
