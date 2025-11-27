import { browserPool } from './browserPool.ts';
import { templateManager } from './templateManager.ts';
import type { GenerateResult } from '../types/template.ts';

/** PDF 生成选项 */
export interface PdfOptions {
  format?: 'A4' | 'A3' | 'Letter';
  landscape?: boolean;
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
}

/** 报告生成器接口 */
export interface ReportGenerator {
  /** 生成 PDF */
  generatePdf(templateId: string, data: unknown, options?: PdfOptions): Promise<GenerateResult>;
  /** 生成 Word */
  generateWord(templateId: string, data: unknown): Promise<GenerateResult>;
  /** 通用生成方法 */
  generate(templateId: string, data: unknown, format: 'pdf' | 'word', options?: PdfOptions): Promise<GenerateResult>;
}

const defaultPdfOptions: PdfOptions = {
  format: 'A4',
  landscape: false,
  margin: {
    top: '20mm',
    right: '15mm',
    bottom: '20mm',
    left: '15mm',
  },
};

/** 创建报告生成器 */
export function createReportGenerator(): ReportGenerator {
  /** 生成 PDF */
  async function generatePdf(
    templateId: string,
    data: unknown,
    options: PdfOptions = {}
  ): Promise<GenerateResult> {
    const finalOptions = { ...defaultPdfOptions, ...options };

    // 渲染 HTML
    const html = templateManager.render(templateId, data);

    // 使用浏览器池生成 PDF
    const pdfBuffer = await browserPool.use(async (browser) => {
      const page = await browser.newPage();

      try {
        await page.setContent(html, { waitUntil: 'networkidle0' });

        const pdf = await page.pdf({
          format: finalOptions.format ?? 'A4',
          landscape: finalOptions.landscape ?? false,
          printBackground: true,
          margin: finalOptions.margin ?? { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
        });

        return Buffer.from(pdf);
      } finally {
        await page.close();
      }
    });

    const template = templateManager.get(templateId)!;
    return {
      buffer: pdfBuffer,
      filename: `${template.metadata.id}-${Date.now()}.pdf`,
      contentType: 'application/pdf',
    };
  }

  /** 生成 Word */
  async function generateWord(templateId: string, data: unknown): Promise<GenerateResult> {
    if (!templateManager.supportsWord(templateId)) {
      throw new Error(`模板 "${templateId}" 不支持 Word 格式`);
    }

    const wordBuffer = await templateManager.generateWord(templateId, data);
    const template = templateManager.get(templateId)!;

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
    format: 'pdf' | 'word',
    options?: PdfOptions
  ): Promise<GenerateResult> {
    // 验证数据
    const validation = templateManager.validate(templateId, data);
    if (!validation.success) {
      throw new Error(`数据验证失败: ${JSON.stringify(validation.error)}`);
    }

    if (format === 'pdf') {
      return generatePdf(templateId, validation.data, options);
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

