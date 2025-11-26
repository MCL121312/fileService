import { z } from 'zod';
import type { TemplateDefinition } from '../../types/template.ts';

/** 指引单数据 Schema */
export const GuideSheetSchema = z.object({
  patientInfo: z.object({
    name: z.string().min(1, '姓名不能为空'),
    gender: z.enum(['男', '女']),
    age: z.number().int().min(0).max(150),
  }),
  examDate: z.string().min(1, '体检日期不能为空'),
  barcode: z.string().min(1, '体检编号不能为空'),
  hospitalName: z.string().default('健康体检中心'),
  examItems: z.array(
    z.object({
      name: z.string().min(1),
      location: z.string(),
      completed: z.boolean().default(false),
    })
  ),
  notes: z.array(z.string()).default([
    '请空腹进行抽血检查',
    '请携带本指引单依次完成各项检查',
    '检查完毕后请将指引单交回前台',
  ]),
});

export type GuideSheetData = z.infer<typeof GuideSheetSchema>;

/** 指引单模板定义 (仅支持 PDF) */
export const guideSheetTemplate: TemplateDefinition<GuideSheetData> = {
  metadata: {
    id: 'guide-sheet',
    name: '体检指引单',
    description: '体检流程指引单，包含体检项目和位置信息',
    version: '1.0.0',
  },
  htmlTemplate: 'guide-sheet/template.html',
  schema: GuideSheetSchema,
  // 指引单不需要 Word 格式
};

