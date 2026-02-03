import { getTemplate, validateData } from "./templateLoader.ts";
import type { GenerateResult } from "../types/template.ts";

/** 报告生成器接口 */
export interface ReportGenerator {
  /** 生成 PDF */
  generatePdf(templateId: string, data: unknown): Promise<GenerateResult>;
  /** 通用生成方法 */
  generate(
    templateId: string,
    data: unknown,
    format: "pdf"
  ): Promise<GenerateResult>;
}

/** 创建报告生成器 */
export function createReportGenerator(): ReportGenerator {
  /** 生成 PDF */
  async function generatePdf(
    templateId: string,
    data: unknown
  ): Promise<GenerateResult> {
    const template = getTemplate(templateId);
    if (!template) {
      throw new Error(`模板 "${templateId}" 不存在`);
    }

    const pdfBuffer = await template.generate(data);

    return {
      buffer: pdfBuffer,
      filename: `${template.meta.id}-${Date.now()}.pdf`,
      contentType: "application/pdf"
    };
  }

  /** 通用生成方法 */
  async function generate(
    templateId: string,
    data: unknown,
    format: "pdf"
  ): Promise<GenerateResult> {
    // 验证数据
    const validation = validateData(templateId, data);
    if (!validation.success) {
      throw new Error(`数据验证失败: ${JSON.stringify(validation.error)}`);
    }

    return generatePdf(templateId, validation.data);
  }

  return {
    generatePdf,
    generate
  };
}

/** 全局报告生成器实例 */
export const reportGenerator = createReportGenerator();
