import type { TemplateDefinition } from '../../types/template.ts';
import { HealthReportSchema, type HealthReportData } from './schema.ts';
import { usePdfTemplate } from './pdf/index.ts';
import { useWordTemplate } from './word/index.ts';

// 导出类型供外部使用
export { HealthReportSchema, type HealthReportData };

// 导出 hooks
export { usePdfTemplate, useWordTemplate };

/** 体检报告模板定义 */
export function useHealthReportTemplate(): TemplateDefinition<HealthReportData> {
  const pdf = usePdfTemplate();
  const word = useWordTemplate();

  return {
    metadata: {
      id: 'health-report',
      name: '健康体检报告',
      description: '标准健康体检报告，包含血常规、肝功能、血脂等检查项目',
      version: '1.0.0',
    },
    schema: HealthReportSchema,
    pdfGenerator: pdf.generate,
    wordGenerator: word.generate,
  };
}

