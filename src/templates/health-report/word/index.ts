import { createReport } from 'docx-templates';
import fs from 'fs';
import path from 'path';
import type { HealthReportData } from '../schema.ts';

/** Word 模板配置和生成器 */
export function useWordTemplate() {
  const templateDir = import.meta.dirname;
  const templatePath = path.join(templateDir, 'template.docx');

  /** 预处理数据 */
  function preprocessData(data: HealthReportData) {
    return {
      ...data,
      generatedAt: new Date().toLocaleString('zh-CN'),
      examItems: data.examItems.map((category) => ({
        ...category,
        items: category.items.map((item) => ({
          ...item,
          statusText:
            item.status === 'normal' ? '正常' : item.status === 'high' ? '偏高 ↑' : '偏低 ↓',
        })),
      })),
    };
  }

  /** 生成 Word 文档 */
  async function generate(data: HealthReportData): Promise<Buffer> {
    const template = fs.readFileSync(templatePath);
    const processedData = preprocessData(data);

    const buffer = await createReport({
      template,
      data: processedData,
      cmdDelimiter: ['+++', '+++'],
    });

    return Buffer.from(buffer);
  }

  return {
    templatePath,
    generate,
  };
}

