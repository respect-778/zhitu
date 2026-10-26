import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/authMiddleware';
import { ResumeWorkspaceModel } from '../models/ResumeWorkspace';
import { WorkspaceConflictError } from '../models/GrowthWorkspace';

// 保留已有简历字段；验证必需结构，拒绝不能恢复或互相覆盖的数据。
const textObject = (fields: string[]) => z.object(Object.fromEntries(fields.map(key => [key, z.string().optional()]))).passthrough();
const visible = { visible: z.boolean().optional() };
const basicSchema = textObject(['name', 'title', 'email', 'emailPrefix', 'phone', 'phonePrefix', 'location', 'locationPrefix', 'age', 'agePrefix', 'birthDate', 'employementStatus', 'photo', 'layout']).extend({
  photoConfig: z.object({ width: z.number().optional(), height: z.number().optional(), aspectRatio: z.string().optional(), borderRadius: z.string().optional(), customBorderRadius: z.number().optional(), ...visible }).passthrough().optional(),
  customFields: z.array(textObject(['id', 'label', 'value', 'icon']).extend({ ...visible, custom: z.boolean().optional(), displayLabel: z.boolean().optional() })).optional(),
});
const resumeSchema = z.object({
  id: z.string().min(1).max(200), title: z.string().max(200),
  templateId: z.string().min(1).max(200),
  createdAt: z.string().min(1), updatedAt: z.string().min(1),
  basic: basicSchema,
  education: z.array(textObject(['id', 'school', 'major', 'degree', 'startDate', 'endDate', 'gpa', 'courses', 'description']).extend(visible)),
  experience: z.array(textObject(['id', 'company', 'position', 'date', 'details']).extend(visible)),
  projects: z.array(textObject(['id', 'name', 'role', 'date', 'description', 'link', 'linkLabel']).extend(visible)),
  certificates: z.array(textObject(['id', 'url']).extend({ width: z.number().optional() })),
  customData: z.record(z.array(textObject(['id', 'title', 'subtitle', 'dateRange', 'description']).extend(visible))),
  skillContent: z.string(), selfEvaluationContent: z.string(),
  menuSections: z.array(textObject(['id', 'title', 'icon']).extend({ enabled: z.boolean().optional(), order: z.number().optional() })),
  globalSettings: textObject(['themeColor', 'fontFamily']).extend(Object.fromEntries(['baseFontSize', 'pagePadding', 'paragraphSpacing', 'lineHeight', 'sectionSpacing', 'headerSize', 'subheaderSize'].map(key => [key, z.number().optional()]))),
}).passthrough();
const collectionSchema = z.object({ resumes: z.array(resumeSchema).max(100) })
  .refine(value => new Set(value.resumes.map(resume => resume.id)).size === value.resumes.length, '简历编号不能重复');

export const getResumes = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const row = await ResumeWorkspaceModel.get(req.userId!);
    res.json({ data: row ? (typeof row.data === 'string' ? JSON.parse(row.data) : row.data) : null, revision: row ? Number(row.revision) : 0 });
  } catch (error) {
    console.error('获取简历失败', error);
    res.status(500).json({ message: '获取简历失败' });
  }
};

export const saveResumes = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const revision = req.body.revision;
    const parsed = collectionSchema.safeParse(req.body.data);
    if (!parsed.success || !Number.isSafeInteger(revision) || revision < 0) {
      res.status(400).json({ message: '简历结构或版本号无效，请重新加载后重试' });
      return;
    }
    if (Buffer.byteLength(JSON.stringify(parsed.data), 'utf8') > 8 * 1024 * 1024) {
      res.status(413).json({ message: '简历数据超过 8MB，请压缩照片或减少内容' });
      return;
    }
    res.json(await ResumeWorkspaceModel.save(req.userId!, parsed.data, revision));
  } catch (error) {
    if (error instanceof WorkspaceConflictError) {
      res.status(409).json({ message: '简历已在其他页面更新，本地修改已保留', current: error.current });
    } else {
      console.error('保存简历失败', error);
      res.status(500).json({ message: '保存简历失败，本地修改已保留' });
    }
  }
};
