import fs from "fs";
import path from "path";
import { browserPool } from "./browserPool.ts";

/** PDF 渲染配置 */
export interface PdfRenderOptions {
  /** 页面大小 */
  pageSize?: "A4" | "A3" | "Letter";
  /** 页边距 */
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
}

const defaultOptions: PdfRenderOptions = {
  pageSize: "A4",
  margin: { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" }
};

/** Vue 运行时缓存 */
let vueRuntimeCache: string | null = null;

/** 获取 Vue 运行时代码 */
function getVueRuntime(): string {
  if (vueRuntimeCache) return vueRuntimeCache;
  const vuePath = path.join(
    import.meta.dirname,
    "../../node_modules/vue/dist/vue.global.prod.js"
  );
  vueRuntimeCache = fs.readFileSync(vuePath, "utf-8");
  return vueRuntimeCache;
}

/** 注入 Vue 运行时和数据到 HTML */
function injectVueRuntime(html: string, data: unknown): string {
  const vueRuntime = getVueRuntime();
  const dataScript = `
    <script>
      const __DATA__ = ${JSON.stringify({
        ...(data as object),
        generatedAt: new Date().toLocaleString("zh-CN")
      })};
      Vue.createApp({
        data() { return __DATA__; }
      }).mount('#app');
    </script>
  `;

  return html.replace(
    "</body>",
    `<script>${vueRuntime}</script>${dataScript}</body>`
  );
}

/** 渲染 PDF */
export async function renderPdf(
  templatePath: string,
  data: unknown,
  options: PdfRenderOptions = {}
): Promise<Buffer> {
  const opts = { ...defaultOptions, ...options };

  // 读取模板
  let html = fs.readFileSync(templatePath, "utf-8");

  // 注入 Vue 运行时和数据
  html = injectVueRuntime(html, data);

  // 使用浏览器池生成 PDF
  const pdfBuffer = await browserPool.use(async browser => {
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: "domcontentloaded" });

      // 等待 Vue 挂载完成
      await page.waitForSelector("#app", { timeout: 5000 });

      // 给 Vue 一点时间完成渲染
      await new Promise(resolve => setTimeout(resolve, 100));

      const pdf = await page.pdf({
        format: opts.pageSize,
        printBackground: true,
        margin: opts.margin
      });
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  });

  return pdfBuffer;
}
