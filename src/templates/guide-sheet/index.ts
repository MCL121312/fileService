import type { TemplateDefinition } from '../../types/template.ts';
import { GuideSheetSchema, type GuideSheetData } from './schema.ts';
import { usePdfTemplate } from './pdf/index.ts';

// 导出类型
export { GuideSheetSchema, type GuideSheetData };

// 导出 hooks
export { usePdfTemplate };

/** 指引单模板定义 */
export function useGuideSheetTemplate(): TemplateDefinition<GuideSheetData> {
  const pdf = usePdfTemplate();

  return {
    metadata: {
      id: 'guide-sheet',
      name: '体检指引单',
      description: '体检流程指引单，包含体检项目和位置信息',
      version: '1.0.0',
    },
    schema: GuideSheetSchema,
    pdfGenerator: pdf.generate,
    // 指引单不需要 Word 格式
  };
}

