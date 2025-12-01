import fs from 'fs';
import path from 'path';
import { browserPool } from '../../../core/browserPool.ts';
import type { GuideSheetData } from '../schema.ts';

/** PDF 模板 Hook */
export function usePdfTemplate() {
  const templateDir = import.meta.dirname;
  const templatePath = path.join(templateDir, 'template.html');

  /** 预处理数据 */
  function preprocessData(data: GuideSheetData): Record<string, unknown> {
    const examItemsHtml = data.examItems
      .map(
        (item) => `
        <div class="exam-item ${item.completed ? 'completed' : ''}">
          <div class="checkbox"></div>
          <span class="name">${item.name}</span>
          <span class="location">${item.location}</span>
        </div>`
      )
      .join('');

    const notesHtml = data.notes.map((note) => `<li>${note}</li>`).join('');

    return {
      ...data,
      examItemsHtml,
      notesHtml,
      generatedAt: new Date().toLocaleString('zh-CN'),
    };
  }

  /** 渲染 HTML（简单字符串替换） */
  function renderHtml(data: GuideSheetData): string {
    let html = fs.readFileSync(templatePath, 'utf-8');
    const processedData = preprocessData(data);

    // 简单变量替换
    html = html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, keyPath: string) => {
      const keys = keyPath.split('.');
      let value: unknown = processedData;
      for (const key of keys) {
        value = (value as Record<string, unknown>)?.[key];
      }
      return value !== undefined ? String(value) : '';
    });

    return html;
  }

  /** 生成 PDF */
  async function generate(data: GuideSheetData): Promise<Buffer> {
    const html = renderHtml(data);

    const pdfBuffer = await browserPool.use(async (browser) => {
      const page = await browser.newPage();
      try {
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdf = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
        });
        return Buffer.from(pdf);
      } finally {
        await page.close();
      }
    });

    return pdfBuffer;
  }

  return {
    templatePath,
    generate,
  };
}

