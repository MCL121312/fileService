import fs from 'fs';
import path from 'path';
import { browserPool } from '../../../core/browserPool.ts';
import type { HealthReportData } from '../schema.ts';

/** PDF 模板 Hook */
export function usePdfTemplate() {
  const templateDir = import.meta.dirname;
  const templatePath = path.join(templateDir, 'template.html');

  /** 读取并渲染 HTML */
  function renderHtml(data: HealthReportData): string {
    let html = fs.readFileSync(templatePath, 'utf-8');

    // 注入 Vue 运行时
    const vueRuntime = getVueRuntime();
    const dataScript = `
      <script>
        const __DATA__ = ${JSON.stringify({
          ...data,
          generatedAt: new Date().toLocaleString('zh-CN'),
        })};
        Vue.createApp({
          data() { return __DATA__; }
        }).mount('#app');
      </script>
    `;

    // 在 </body> 前插入 Vue 运行时和数据
    html = html.replace('</body>', `<script>${vueRuntime}</script>${dataScript}</body>`);

    return html;
  }

  /** 生成 PDF */
  async function generate(data: HealthReportData): Promise<Buffer> {
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

/** 获取 Vue 运行时代码 */
let vueRuntimeCache: string | null = null;
function getVueRuntime(): string {
  if (vueRuntimeCache) return vueRuntimeCache;
  const vuePath = path.join(
    import.meta.dirname,
    '../../../../node_modules/vue/dist/vue.global.prod.js'
  );
  vueRuntimeCache = fs.readFileSync(vuePath, 'utf-8');
  return vueRuntimeCache;
}

