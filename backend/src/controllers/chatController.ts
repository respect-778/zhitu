import type { Response } from 'express';
import type { AuthRequest } from '../middleware/authMiddleware';
import { ChatSessionModel } from '../models/ChatSession';
import { ChatMessageModel } from '../models/ChatMessage';
import { AiUserModelConfigModel } from '../models/AiUserModelConfig';
import { ResponseUtil } from '../utils/response';
import { decryptModelApiKey, encryptModelApiKey } from '../utils/modelSecret';
import {
  extractModelIdsFromResponse,
  getModelByMode,
  getModelDisplayLabel,
  getProviderModelsEndpoint,
  pickBestModelFromList,
  resolveProviderConfig,
  type ProviderConfig
} from '../utils/aiProvider';
import { PostModel } from '../models/Post';
import {
  invokeChatAgent,
  invokeSummaryAgent,
  convertDbMessagesToLangChain,
  createChatModel,
} from '../langchain';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { compressHistoryIfNeeded } from '../langchain/utils/historyCompressor';

const DEFAULT_SESSION_TITLE = '新对话';
const MAX_SESSION_TITLE_LENGTH = 100;
const MAX_API_KEY_LENGTH = 500;
const DEFAULT_SCENE_TYPE = 'chat';
const ARTICLE_SUMMARY_SCENE_TYPE = 'article_summary';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SessionLookup =
  | { kind: 'id'; value: number }
  | { kind: 'uuid'; value: string };

const normalizeSessionTitle = (value: unknown): string => {
  const rawTitle = typeof value === 'string' ? value.trim() : '';
  const title = rawTitle || DEFAULT_SESSION_TITLE;
  return Array.from(title).slice(0, MAX_SESSION_TITLE_LENGTH).join('');
};

const getAuthedUserId = (req: AuthRequest, res: Response): number | null => {
  if (!req.userId) {
    res.status(401).json(ResponseUtil.error('未授权'));
    return null;
  }
  return req.userId;
};

const hasSessionLookupValue = (value: unknown): boolean =>
  value !== undefined && value !== null && value !== '';

const parseSessionLookup = (value: unknown): SessionLookup | null => {
  if (!hasSessionLookupValue(value)) return null;

  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return null;
    if (UUID_PATTERN.test(raw)) return { kind: 'uuid', value: raw };
  }

  const sessionId = typeof value === 'string' ? Number(value) : Number(value);
  if (Number.isInteger(sessionId) && sessionId > 0) {
    return { kind: 'id', value: sessionId };
  }

  return null;
};

const getSessionLookupValue = (payload: {
  session_id?: unknown;
  sessionId?: unknown;
  session_uuid?: unknown;
  sessionUuid?: unknown;
}): unknown => payload.session_uuid ?? payload.sessionUuid ?? payload.session_id ?? payload.sessionId;

const findSessionByLookup = (lookup: SessionLookup, userId: number) =>
  lookup.kind === 'uuid'
    ? ChatSessionModel.findByUuidAndUserId(lookup.value, userId)
    : ChatSessionModel.findByIdAndUserId(lookup.value, userId);

const parseSourceId = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const sourceId = typeof value === 'string' ? Number(value) : Number(value);
  if (!Number.isFinite(sourceId)) {
    return NaN;
  }

  return sourceId;
};

const normalizeSceneType = (value: unknown): string => {
  const rawSceneType = typeof value === 'string' ? value.trim() : '';
  return rawSceneType || DEFAULT_SCENE_TYPE;
};

const writeSseError = (res: Response, message: string): void => {
  res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
};

const parseProviderErrorMessage = async (resp: globalThis.Response): Promise<string> => {
  try {
    const data = (await resp.json()) as {
      message?: string;
      error?: string | { message?: string };
    };

    if (typeof data.message === 'string' && data.message.trim()) {
      return data.message.trim();
    }

    if (typeof data.error === 'string' && data.error.trim()) {
      return data.error.trim();
    }

    if (typeof data.error === 'object' && typeof data.error?.message === 'string') {
      const msg = data.error.message.trim();
      if (msg) return msg;
    }
  } catch {
    // ignore parse error
  }

  return resp.statusText || 'unknown provider error';
};

type ProviderModelDetectResult = {
  status: 'detected' | 'unsupported' | 'invalid' | 'error';
  modelIds: string[];
  reason?: string;
};

const detectProviderModels = async (
  provider: ProviderConfig,
  apiKey: string
): Promise<ProviderModelDetectResult> => {
  const endpoint = getProviderModelsEndpoint(provider);
  if (!endpoint) {
    return { status: 'unsupported', modelIds: [] };
  }

  try {
    const resp = await fetch(endpoint, {
      method: 'GET',
      headers:
        provider.apiStyle === 'anthropic'
          ? {
            'x-api-key': apiKey,
            'anthropic-version': process.env.ANTHROPIC_API_VERSION || '2023-06-01',
            'content-type': 'application/json'
          }
          : {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
    });

    if (!resp.ok) {
      const reason = await parseProviderErrorMessage(resp);
      if (resp.status === 404 || resp.status === 405) {
        return { status: 'unsupported', modelIds: [], reason };
      }
      if (resp.status === 401 || resp.status === 403) {
        return { status: 'invalid', modelIds: [], reason };
      }
      return { status: 'error', modelIds: [], reason };
    }

    const payload = (await resp.json()) as unknown;
    const modelIds = extractModelIdsFromResponse(payload);
    if (modelIds.length === 0) {
      return { status: 'unsupported', modelIds: [] };
    }

    return { status: 'detected', modelIds };
  } catch (error) {
    console.error('detectProviderModels error:', error);
    return { status: 'error', modelIds: [], reason: 'provider unreachable' };
  }
};

const verifyProviderApiKey = async (
  provider: ProviderConfig,
  apiKey: string,
  verifyModelName?: string
): Promise<{ valid: boolean; reason?: string }> => {
  const verifyModel = verifyModelName || getModelByMode(provider, 0);

  try {
    const resp = await fetch(provider.baseUrl, {
      method: 'POST',
      headers:
        provider.apiStyle === 'anthropic'
          ? {
            'x-api-key': apiKey,
            'anthropic-version': process.env.ANTHROPIC_API_VERSION || '2023-06-01',
            'content-type': 'application/json'
          }
          : {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
      body:
        provider.apiStyle === 'anthropic'
          ? JSON.stringify({
            model: verifyModel,
            max_tokens: 1,
            stream: false,
            messages: [{ role: 'user', content: 'ping' }]
          })
          : JSON.stringify({
            model: verifyModel,
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 1,
            stream: false
          })
    });

    if (resp.ok) {
      return { valid: true };
    }

    const reason = await parseProviderErrorMessage(resp);
    return { valid: false, reason };
  } catch (error) {
    console.error('verifyProviderApiKey error:', error);
    return { valid: false, reason: 'provider unreachable' };
  }
};

export class ChatController {
  static async uploadAiModel(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = getAuthedUserId(req, res);
      if (!userId) return;

      const body = (req.body ?? {}) as { name?: unknown; apikey?: unknown };
      const providerName = typeof body.name === 'string' ? body.name.trim() : '';
      const rawApiKey = typeof body.apikey === 'string' ? body.apikey.trim() : '';

      if (!providerName) {
        res.status(400).json(ResponseUtil.error('name 参数不能为空'));
        return;
      }

      if (!rawApiKey) {
        res.status(400).json(ResponseUtil.error('apikey 参数不能为空'));
        return;
      }

      if (rawApiKey.length > MAX_API_KEY_LENGTH) {
        res.status(400).json(ResponseUtil.error(`apikey 长度不能超过 ${MAX_API_KEY_LENGTH}`));
        return;
      }

      const provider = resolveProviderConfig(providerName);
      if (!provider) {
        res.status(400).json(ResponseUtil.error('不支持的模型提供商'));
        return;
      }

      const fallbackDefaultModel = getModelByMode(provider, 0);
      const fallbackReasoningModel = getModelByMode(provider, 1);
      let selectedDefaultModel = fallbackDefaultModel;
      let selectedReasoningModel = fallbackReasoningModel;
      let modelSource: 'detected' | 'fallback' = 'fallback';

      const detectResult = await detectProviderModels(provider, rawApiKey);
      if (detectResult.status === 'detected') {
        selectedDefaultModel = pickBestModelFromList(provider, 0, detectResult.modelIds);
        selectedReasoningModel = pickBestModelFromList(provider, 1, detectResult.modelIds);
        modelSource = 'detected';
      } else if (detectResult.status === 'unsupported') {
        const verifyResult = await verifyProviderApiKey(provider, rawApiKey, fallbackDefaultModel);
        if (!verifyResult.valid) {
          res
            .status(400)
            .json(ResponseUtil.error(`apikey 无效或不可用：${verifyResult.reason || '验证失败'}`));
          return;
        }
      } else {
        res
          .status(400)
          .json(ResponseUtil.error(`apikey 无效或不可用：${detectResult.reason || '验证失败'}`));
        return;
      }

      const encryptedApiKey = encryptModelApiKey(rawApiKey);
      const configId = await AiUserModelConfigModel.upsertActiveConfig({
        user_id: userId,
        provider_name: provider.canonicalName,
        base_url: provider.baseUrl,
        api_key_encrypted: encryptedApiKey
      });

      const defaultModelDisplayLabel = getModelDisplayLabel(provider, selectedDefaultModel);
      const reasoningModelDisplayLabel = getModelDisplayLabel(provider, selectedReasoningModel);

      res.json(
        ResponseUtil.success('AI provider config success', {
          id: configId,
          provider_name: provider.canonicalName,
          base_url: provider.baseUrl,
          is_active: true,
          model_name: selectedDefaultModel,
          reasoning_model_name: selectedReasoningModel,
          model_version: defaultModelDisplayLabel,
          reasoning_model_version: reasoningModelDisplayLabel,
          model_source: modelSource
        })
      );
    } catch (error) {
      console.error('uploadAiModel error:', error);
      res.status(500).json(ResponseUtil.error('AI provider config failed'));
    }
  }

  static async getAiModel(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = getAuthedUserId(req, res);
      if (!userId) return;

      const activeProviderConfig = await AiUserModelConfigModel.getActiveByUserId(userId);
      if (!activeProviderConfig) {
        res.json(ResponseUtil.success('Get ai model success', { ai_name: '', model_version: '' }));
        return;
      }

      const provider = resolveProviderConfig(activeProviderConfig.provider_name);
      const aiName =
        provider?.canonicalName ||
        (typeof activeProviderConfig.provider_name === 'string'
          ? activeProviderConfig.provider_name
          : '');
      const modelVersion = provider
        ? getModelDisplayLabel(provider, getModelByMode(provider, 0))
        : '';

      res.json(
        ResponseUtil.success('Get ai model success', {
          ai_name: aiName,
          model_version: modelVersion
        })
      );
    } catch (error) {
      console.error('getAiModel error:', error);
      res.status(500).json(ResponseUtil.error('Get ai model failed'));
    }
  }

  /**
   * ========================================================================
   * 核心接口：AI 对话调用（LangChain 版）
   * ========================================================================
   *
   * 【改造前 vs 改造后】
   * 改造前：手动 fetch → 区分 OpenAI/Anthropic 格式 → 手写 SSE 解析（~200 行）
   * 改造后：LangChain Agent → streamEvents → 统一 SSE 输出（~60 行）
   *
   * 【新增能力】
   * 1. 联网搜索：模型自动判断是否需要搜索，前端展示 "搜索中..." 状态
   * 2. 深度思考：mode === 1 时使用深度分析 Prompt，更积极使用搜索
   * 3. 搜索来源：流结束时附带搜索来源 URL
   *
   * 【前端 SSE 数据格式变化】
   * 保留：  data: {"content":"xxx"}\n\n      ← 文本流（不变）
   * 保留：  data: [DONE]\n\n                ← 结束标记（不变）
   * 保留：  data: {"error":"xxx"}\n\n        ← 错误信息（不变）
   * 新增：  data: {"status":"searching","query":"xxx"}\n\n  ← 搜索状态
   * 新增：  data: {"sources":[...]}\n\n      ← 搜索来源
   * ========================================================================
   */
  static async call(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = getAuthedUserId(req, res);
      if (!userId) return;

      const body = (req.body ?? {}) as {
        mode?: unknown;
        userMessage?: unknown;
        session_id?: unknown;
        sessionId?: unknown;
        session_uuid?: unknown;
        sessionUuid?: unknown;
      };
      const mode = Number(body.mode);
      const userMessage = typeof body.userMessage === 'string' ? body.userMessage.trim() : '';
      const rawSessionLookup = getSessionLookupValue(body);
      const sessionLookup = parseSessionLookup(rawSessionLookup);

      if (!Number.isFinite(mode)) {
        res.status(400).json(ResponseUtil.error('mode 参数无效'));
        return;
      }

      if (!userMessage) {
        res.status(400).json(ResponseUtil.error('userMessage 不能为空'));
        return;
      }

      if (hasSessionLookupValue(rawSessionLookup) && !sessionLookup) {
        res.status(400).json(ResponseUtil.error('Invalid session_id'));
        return;
      }

      // ========== 查会话，判断场景类型 ==========
      let sceneType = DEFAULT_SCENE_TYPE;
      let session: Awaited<ReturnType<typeof findSessionByLookup>> = null;

      if (sessionLookup) {
        session = await findSessionByLookup(sessionLookup, userId);
        if (!session) {
          res.status(404).json(ResponseUtil.error('Session not found or forbidden'));
          return;
        }
        sceneType = session.scene_type || DEFAULT_SCENE_TYPE;
      }

      // ========== 加载历史对话并转换为 LangChain 格式（支持历史压缩） ==========
      let dbHistory: Awaited<ReturnType<typeof ChatMessageModel.getBySessionId>> = [];
      let historySummary: string | null = null;

      if (session) {
        if (session?.summary_up_to_id && session?.history_summary) {
          // 有压缩摘要：只加载摘要覆盖之后的近期消息，节省上下文
          historySummary = session.history_summary;
          dbHistory = await ChatMessageModel.getAfterMessageId(session.id, session.summary_up_to_id);
        } else {
          // 无摘要：加载全部消息（走原来的滑动窗口）
          dbHistory = await ChatMessageModel.getBySessionId(session.id);
        }
      }

      // 通用聊天保留 20 轮，文章总结保留 10 轮
      const maxRounds = sceneType === ARTICLE_SUMMARY_SCENE_TYPE ? 10 : 20;
      const chatHistory = convertDbMessagesToLangChain(dbHistory, maxRounds, historySummary);

      let fullContent = '';
      let reasoningContent = '';  // 模型原生推理过程
      let aiReplySaved = false;
      let savingAiReply: Promise<void> | null = null;

      const saveAiReply = async (content: string, reasoning: string): Promise<void> => {
        if (!session || !content.trim() || aiReplySaved) return;

        if (savingAiReply) {
          await savingAiReply;
          return;
        }

        savingAiReply = (async () => {
          try {
            await ChatMessageModel.create({
              session_id: session!.id,
              role: 'ai',
              content,
              reasoning_content: reasoning || null,  // 有推理过程就存，没有就 null
              thinking_mode: mode,
              token_usage: 0
            });

            aiReplySaved = true;

            // 异步触发历史压缩（不阻塞响应，fire-and-forget）
            compressHistoryIfNeeded(session!.id, sceneType).catch(err => {
              console.error('异步历史压缩出错:', err);
            });
          } catch (dbError) {
            console.error('保存 AI 消息失败:', dbError);
          } finally {
            savingAiReply = null;
          }
        })();

        await savingAiReply;
      };

      // ========== 根据场景类型调用对应的 LangChain Agent ==========
      if (sceneType === ARTICLE_SUMMARY_SCENE_TYPE) {
        // ---------- 文章总结场景 ----------
        // 固定使用系统级 DeepSeek，不依赖用户配置
        // 需要从数据库加载文章内容注入到 Prompt 中
        let articleTitle = '无标题';
        let articleContent = '';

        if (session?.source_id) {
          const article = await PostModel.findById(session.source_id);
          if (article) {
            articleTitle = article.title || '无标题';
            articleContent = article.content || '';
          }
        }

        const result = await invokeSummaryAgent({
          userMessage,
          articleTitle,
          articleContent,
          chatHistory,
          res,
          onClientDisconnect: ({ fullContent, reasoningContent }) =>
            saveAiReply(fullContent, reasoningContent),
        });
        fullContent = result.fullContent;
        reasoningContent = result.reasoningContent;
      } else {
        // ---------- 通用聊天场景 ----------
        // 使用用户配置的模型供应商
        const config = await AiUserModelConfigModel.getActiveByUserId(userId);
        if (!config) {
          res.status(400).json(ResponseUtil.error('请先在 APIKEY 配置中绑定模型提供商'));
          return;
        }

        const provider = resolveProviderConfig(config.provider_name);
        if (!provider) {
          res.status(400).json(ResponseUtil.error('当前激活的模型提供商暂不支持'));
          return;
        }

        const apiKey = decryptModelApiKey(config.api_key_encrypted);
        const modelName = getModelByMode(provider, mode);

        const result = await invokeChatAgent({
          provider,
          apiKey,
          modelName,
          mode,
          userMessage,
          chatHistory,
          res,
          onClientDisconnect: ({ fullContent, reasoningContent }) =>
            saveAiReply(fullContent, reasoningContent),
        });
        fullContent = result.fullContent;
        reasoningContent = result.reasoningContent;
      }

      // ========== 保存 AI 回复到数据库 ==========
      await saveAiReply(fullContent, reasoningContent);
    } catch (error) {
      console.error('流式调用错误:', error);
      // 如果响应头还没发送（说明在 Agent 调用前就出错了），返回 JSON 错误
      if (!res.headersSent) {
        res.status(500).json(ResponseUtil.error('调用失败'));
      } else {
        // 如果已经在流式输出中出错，用 SSE 格式通知前端
        writeSseError(res, '调用失败');
      }
    }
  }

  static async createSession(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = getAuthedUserId(req, res);
      if (!userId) return;
      const body = (req.body ?? {}) as {
        session_title?: unknown;
        scene_type?: unknown;
        sceneType?: unknown;
        source_id?: unknown;
        sourceId?: unknown;
      };

      const sessionTitle = normalizeSessionTitle(body.session_title);
      const sceneType = normalizeSceneType(body.scene_type ?? body.sceneType);
      const sourceId = parseSourceId(body.source_id ?? body.sourceId);

      if (sourceId !== null && (!Number.isInteger(sourceId) || sourceId <= 0)) {
        res.status(400).json(ResponseUtil.error('Invalid source_id'));
        return;
      }

      if (sceneType === ARTICLE_SUMMARY_SCENE_TYPE && sourceId === null) {
        res.status(400).json(ResponseUtil.error('source_id is required for article summary session'));
        return;
      }

      const session = await ChatSessionModel.create({
        user_id: userId,
        session_title: sessionTitle,
        scene_type: sceneType,
        source_id: sourceId
      });

      res.json(
        ResponseUtil.success('Create session success', {
          session_id: session.id,
          session_uuid: session.uuid,
          uuid: session.uuid,
          scene_type: sceneType,
          source_id: sourceId
        })
      );
    } catch (error) {
      console.error('createSession error:', error);
      res.status(500).json(ResponseUtil.error('Create session failed'));
    }
  }

  static async renameTitle(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = getAuthedUserId(req, res);
      if (!userId) return;

      const body = (req.body ?? {}) as {
        session_id?: unknown;
        sessionId?: unknown;
        session_uuid?: unknown;
        sessionUuid?: unknown;
        session_title?: unknown;
        title?: unknown;
      };

      const rawSessionLookup = getSessionLookupValue(body);
      const sessionLookup = parseSessionLookup(rawSessionLookup);
      if (!sessionLookup) {
        res.status(400).json(ResponseUtil.error('Invalid session_id'));
        return;
      }

      const session = await findSessionByLookup(sessionLookup, userId);
      if (!session) {
        res.status(404).json(ResponseUtil.error('Session not found or forbidden'));
        return;
      }

      const nextTitle = normalizeSessionTitle(body.session_title ?? body.title);
      const success = await ChatSessionModel.updateTitle(session.id, nextTitle);
      if (!success) {
        res.status(500).json(ResponseUtil.error('Rename session title failed'));
        return;
      }

      res.json(
        ResponseUtil.success('Rename session title success', {
          session_id: session.id,
          session_uuid: session.uuid,
          uuid: session.uuid,
          session_title: nextTitle
        })
      );
    } catch (error) {
      console.error('renameTitle error:', error);
      res.status(500).json(ResponseUtil.error('Rename session title failed'));
    }
  }

  static async getHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = getAuthedUserId(req, res);
      if (!userId) return;

      const sceneType = normalizeSceneType(req.query.scene_type ?? req.query.sceneType);
      const sessions = await ChatSessionModel.getAllHistory(userId, sceneType);
      res.json(ResponseUtil.success('Get history success', sessions));
    } catch (error) {
      console.error('getHistory error:', error);
      res.status(500).json(ResponseUtil.error('Get history failed'));
    }
  }

  static async addMessage(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = getAuthedUserId(req, res);
      if (!userId) return;
      const body = (req.body ?? {}) as {
        session_id?: unknown;
        sessionId?: unknown;
        session_uuid?: unknown;
        sessionUuid?: unknown;
        role?: unknown;
        content?: unknown;
        thinking_mode?: unknown;
        token_usage?: unknown;
      };
      const { role, content, thinking_mode, token_usage } = body;
      const messageRole = typeof role === 'string' ? role : '';
      const messageContent = typeof content === 'string' ? content : '';
      const rawSessionLookup = getSessionLookupValue(body);
      const sessionLookup = parseSessionLookup(rawSessionLookup);

      if (!sessionLookup) {
        res.status(400).json(ResponseUtil.error('Invalid session_id'));
        return;
      }

      if (!messageRole || !['user', 'ai'].includes(messageRole)) {
        res.status(400).json(ResponseUtil.error('Invalid role'));
        return;
      }

      if (!messageContent) {
        res.status(400).json(ResponseUtil.error('content is required'));
        return;
      }

      const session = await findSessionByLookup(sessionLookup, userId);
      if (!session) {
        res.status(404).json(ResponseUtil.error('Session not found or forbidden'));
        return;
      }

      const messageId = await ChatMessageModel.create({
        session_id: session.id,
        role: messageRole as 'user' | 'ai',
        content: messageContent,
        thinking_mode: Number(thinking_mode) || 0,
        token_usage: Number(token_usage) || 0
      });

      res.json(ResponseUtil.success('Create message success', {
        message_id: messageId,
        session_id: session.id,
        session_uuid: session.uuid,
        uuid: session.uuid
      }));
    } catch (error) {
      console.error('addMessage error:', error);
      res.status(500).json(ResponseUtil.error('Create message failed'));
    }
  }

  static async deleteMessage(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = getAuthedUserId(req, res);
      if (!userId) return;

      const messageId = Number(req.params.message_id ?? req.params.messageId);
      if (!Number.isInteger(messageId) || messageId <= 0) {
        res.status(400).json(ResponseUtil.error('Invalid message_id'));
        return;
      }

      const deleted = await ChatMessageModel.deleteAiMessageByIdForUser(messageId, userId);
      if (!deleted) {
        res.status(404).json(ResponseUtil.error('Message not found or forbidden'));
        return;
      }

      res.json(ResponseUtil.success('Delete message success'));
    } catch (error) {
      console.error('deleteMessage error:', error);
      res.status(500).json(ResponseUtil.error('Delete message failed'));
    }
  }

  static async getMessage(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = getAuthedUserId(req, res);
      if (!userId) return;
      const rawSessionLookup = getSessionLookupValue(req.query);
      const sessionLookup = parseSessionLookup(rawSessionLookup);

      if (!sessionLookup) {
        res.status(400).json(ResponseUtil.error('Invalid session_id'));
        return;
      }

      const session = await findSessionByLookup(sessionLookup, userId);
      if (!session) {
        res.status(404).json(ResponseUtil.error('Session not found or forbidden'));
        return;
      }

      const messages = await ChatMessageModel.getBySessionId(session.id);
      res.json(ResponseUtil.success('Get message success', messages));
    } catch (error) {
      console.error('getMessage error:', error);
      res.status(500).json(ResponseUtil.error('Get message failed'));
    }
  }

  static async getSummaryMessage(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = getAuthedUserId(req, res);
      if (!userId) return;

      const articleId = parseSourceId(req.query.article_id ?? req.query.articleId);
      if (articleId === null || !Number.isInteger(articleId) || articleId <= 0) {
        res.status(400).json(ResponseUtil.error('Invalid article_id'));
        return;
      }

      const session = await ChatSessionModel.findBySceneAndSource(
        userId,
        ARTICLE_SUMMARY_SCENE_TYPE,
        articleId
      );

      if (!session) {
        res.json(
          ResponseUtil.success('Get summary message success', {
            session_id: null,
            session_uuid: null,
            uuid: null,
            messages: []
          })
        );
        return;
      }

      const messages = await ChatMessageModel.getBySessionId(session.id);
      res.json(
        ResponseUtil.success('Get summary message success', {
          session_id: session.id,
          session_uuid: session.uuid,
          uuid: session.uuid,
          session_title: session.session_title,
          scene_type: session.scene_type,
          source_id: session.source_id,
          messages
        })
      );
    } catch (error) {
      console.error('getSummaryMessage error:', error);
      res.status(500).json(ResponseUtil.error('Get summary message failed'));
    }
  }

  static async deleteSession(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = getAuthedUserId(req, res);
      if (!userId) return;
      const sessionLookup = parseSessionLookup(req.params.session_id);

      if (!sessionLookup) {
        res.status(400).json(ResponseUtil.error('Invalid session_id'));
        return;
      }

      const session = await findSessionByLookup(sessionLookup, userId);
      if (!session) {
        res.status(404).json(ResponseUtil.error('Session not found or forbidden'));
        return;
      }

      const success = await ChatSessionModel.softDelete(session.id);
      if (success) {
        res.json(ResponseUtil.success('Delete session success', {
          session_id: session.id,
          session_uuid: session.uuid,
          uuid: session.uuid
        }));
      } else {
        res.status(500).json(ResponseUtil.error('Delete session failed'));
      }
    } catch (error) {
      console.error('deleteSession error:', error);
      res.status(500).json(ResponseUtil.error('Delete session failed'));
    }
  }

  /**
   * 简历内容 AI 润色（非流式，直接返回 JSON）
   *
   * 1. 校验登录态和入参
   * 2. 读取用户当前激活的 AI 模型配置
   * 3. 创建非流式模型并调用 model.invoke()
   * 4. 兼容 LangChain 字符串或多段 content 结构
   * 5. 通过 ResponseUtil.success 一次性返回润色结果
   */
  static async polish(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = getAuthedUserId(req, res);
      if (!userId) return;

      const body = (req.body ?? {}) as { content?: unknown; fieldType?: unknown };
      const content = typeof body.content === 'string' ? body.content.trim() : '';
      const fieldType = typeof body.fieldType === 'string' ? body.fieldType.trim() : '简历内容';

      if (!content) {
        res.status(400).json(ResponseUtil.error('内容不能为空'));
        return;
      }

      const config = await AiUserModelConfigModel.getActiveByUserId(userId);
      if (!config) {
        res.status(400).json(ResponseUtil.error('请先在设置中配置 AI 模型'));
        return;
      }

      const provider = resolveProviderConfig(config.provider_name);
      if (!provider) {
        res.status(400).json(ResponseUtil.error('当前激活的模型提供商暂不支持'));
        return;
      }

      const apiKey = decryptModelApiKey(config.api_key_encrypted);
      const modelName = getModelByMode(provider, 0);

      const model = createChatModel({
        provider,
        apiKey,
        modelName,
        streaming: false,
        temperature: 0.7,
      });

      const systemPrompt = `你是一位专业的简历润色助手。请对以下「${fieldType}」内容进行优化：

要求：
1. 保持原意不变，不捏造用户没有提到的经历或数据
2. 使用专业、简洁的语言，突出关键成果和量化数据
3. 采用 Markdown 格式输出（支持列表、加粗等）
4. 消除口语化表达，提升专业度
5. 直接输出润色后的内容，不要输出任何解释性文字`;

      const result = await model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(content),
      ]);

      const polishedContent = typeof result.content === 'string'
        ? result.content
        : Array.isArray(result.content)
          ? result.content.map(c => (typeof c === 'string' ? c : ('text' in c ? c.text : ''))).join('')
          : '';

      res.json(ResponseUtil.success('润色成功', { content: polishedContent }));
    } catch (error) {
      console.error('polish error:', error);
      res.status(500).json(ResponseUtil.error('AI 润色失败，请稍后再试'));
    }
  }
}
