import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { GrowthWorkspaceModel, WorkspaceConflictError } from '../models/GrowthWorkspace';
import { UserHighlightModel } from '../models/UserHighlight';
import { appendCitation, GrowthRequestError, preserveCitationSources, resolveCitation, validateWorkspace } from '../services/growthWorkspaceService';

const respondToWorkspaceError = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof WorkspaceConflictError) {
    res.status(409).json({ message: error.message, current: error.current });
  } else if (error instanceof GrowthRequestError) {
    res.status(error.status).json({ message: error.message });
  } else {
    console.error(fallback, error);
    res.status(500).json({ message: fallback });
  }
};

/**
 * 获取用户的成长规划工作区数据
 * GET /growth/workspace
 * 返回 { data: WorkspaceData | null, revision }，新用户版本号为 0
 */
export const getWorkspace = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const row = await GrowthWorkspaceModel.get(req.userId!);
    if (!row) {
      res.json({ data: null, revision: 0 });
      return;
    }
    // MySQL JSON 列可能返回字符串或已解析的对象，统一处理
    const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    res.json({ data, revision: Number(row.revision) });
  } catch (error) {
    console.error('获取工作区失败:', error);
    res.status(500).json({ message: '获取工作区失败' });
  }
};

/**
 * 保存/更新用户的成长规划工作区数据
 * PUT /growth/workspace
 * 请求体: { data: WorkspaceData, revision }
 * 在事务中校验版本后保存；版本过期时返回 409，不覆盖新数据
 */
export const saveWorkspace = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { data, revision } = req.body;
    validateWorkspace(data);
    if (!Number.isSafeInteger(revision) || revision < 0) throw new GrowthRequestError(400, '请刷新页面后使用工作区版本号保存');
    const snapshot = await GrowthWorkspaceModel.mutate(req.userId!, revision, previous => preserveCitationSources(data, previous));
    res.json({ message: 'ok', ...snapshot });
  } catch (error) {
    respondToWorkspaceError(res, error, '保存工作区失败');
  }
};

/**
 * 获取用户在某篇文章上的高亮标注
 * GET /growth/highlights/:postId
 */
export const getHighlights = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const postId = parseInt(req.params.postId);
    if (isNaN(postId)) {
      res.status(400).json({ message: '无效的文章ID' });
      return;
    }
    const rows = await UserHighlightModel.getByPostId(req.userId!, postId);
    const data = rows.map(r => ({
      id: r.highlight_id,
      text: r.text,
      textBefore: r.text_before,
      textAfter: r.text_after,
      color: r.color,
      note: r.note,
      createdAt: r.created_at.toISOString(),
    }));
    res.json({ data });
  } catch (error) {
    console.error('获取高亮失败:', error);
    res.status(500).json({ message: '获取高亮失败' });
  }
};

/**
 * 批量保存用户在某篇文章上的高亮标注（整体替换）
 * PUT /growth/highlights/:postId
 */
export const saveHighlights = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const postId = parseInt(req.params.postId);
    if (isNaN(postId)) {
      res.status(400).json({ message: '无效的文章ID' });
      return;
    }
    const { highlights } = req.body;
    if (!Array.isArray(highlights)) {
      res.status(400).json({ message: '无效的高亮数据' });
      return;
    }
    await UserHighlightModel.batchReplace(req.userId!, postId, highlights);
    res.json({ message: 'ok' });
  } catch (error) {
    console.error('保存高亮失败:', error);
    res.status(500).json({ message: '保存高亮失败' });
  }
};

/**
 * 将选中的文字添加到用户工作区的「引用收藏」文件夹
 * POST /growth/cite
 */
export const addCitation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const citation = await resolveCitation(req.userId!, req.body);
    const result = { fileId: '', duplicate: false };
    const snapshot = await GrowthWorkspaceModel.mutate(req.userId!, null, workspace => appendCitation(workspace, citation, result));
    res.json({ data: result, revision: snapshot.revision });
  } catch (error) {
    respondToWorkspaceError(res, error, '添加引用失败');
  }
};
