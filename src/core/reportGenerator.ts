import { templateManager } from './templateManager.ts';
import type { GenerateResult } from '../types/template.ts';

/** 报告生成器接口 */
export interface ReportGenerator {
  /** 生成 PDF */
  generatePdf(templateId: string, data: unknown): Promise<GenerateResult>;
  /** 生成 Word */
  generateWord(templateId: string, data: unknown): Promise<GenerateResult>;
  /** 通用生成方法 */
  generate(templateId: string, data: unknown, format: 'pdf' | 'word'): Promise<GenerateResult>;
}

/** 创建报告生成器 */
export function createReportGenerator(): ReportGenerator {
  /** 生成 PDF */
  async function generatePdf(templateId: string, data: unknown): Promise<GenerateResult> {
    const template = templateManager.get(templateId);
    if (!template?.pdfGenerator) {
      throw new Error(`模板 "${templateId}" 不支持 PDF 格式`);
    }

    const pdfBuffer = await template.pdfGenerator(data);

    return {
      buffer: pdfBuffer,
      filename: `${template.metadata.id}-${Date.now()}.pdf`,
      contentType: 'application/pdf',
    };
  }

  /** 生成 Word */
  async function generateWord(templateId: string, data: unknown): Promise<GenerateResult> {
    const template = templateManager.get(templateId);
    if (!template?.wordGenerator) {
      throw new Error(`模板 "${templateId}" 不支持 Word 格式`);
    }

    const wordBuffer = await template.wordGenerator(data);

    return {
      buffer: wordBuffer,
      filename: `${template.metadata.id}-${Date.now()}.docx`,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }

  /** 通用生成方法 */
  async function generate(
    templateId: string,
    data: unknown,
    format: 'pdf' | 'word'
  ): Promise<GenerateResult> {
    // 验证数据
    const validation = templateManager.validate(templateId, data);
    if (!validation.success) {
      throw new Error(`数据验证失败: ${JSON.stringify(validation.error)}`);
    }

    if (format === 'pdf') {
      return generatePdf(templateId, validation.data);
    } else {
      return generateWord(templateId, validation.data);
    }
  }

  return {
    generatePdf,
    generateWord,
    generate,
  };
}

/** 全局报告生成器实例 */
export const reportGenerator = createReportGenerator();

