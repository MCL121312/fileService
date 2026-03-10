import fs from "fs";
import path from "path";
import type { z } from "zod";
import { renderPdf, type PdfRenderOptions } from "./pdfRenderer.ts";

/** 模板元信息 */
export interface TemplateMeta {
  id: string;
  name: string;
  description?: string;
}

/** 模板 Schema 模块导出格式 */
export interface TemplateSchemaModule {
  meta: TemplateMeta;
  schema: z.ZodSchema;
  pdfOptions?: PdfRenderOptions;
}

/** 已加载的模板 */
export interface LoadedTemplate {
  meta: TemplateMeta;
  schema: z.ZodSchema;
  format: "pdf";
  templatePath: string;
  pdfOptions?: PdfRenderOptions;
  generate: (data: unknown) => Promise<Buffer>;
}

/** 模板注册表 */
const registry = new Map<string, LoadedTemplate>();

/** 扫描并加载所有模板 */
export async function loadTemplates(templatesDir: string): Promise<void> {
  console.log("📋 正在扫描模板目录...");

  const dirs = fs
    .readdirSync(templatesDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith("."));

  for (const dir of dirs) {
    const dirPath = path.join(templatesDir, dir.name);
    await loadTemplatesFromDir(dirPath);
  }

  console.log(`✓ 已加载 ${registry.size} 个模板`);
}

/** 从目录加载模板 */
async function loadTemplatesFromDir(dirPath: string): Promise<void> {
  const files = fs.readdirSync(dirPath);

  // 查找所有 *.schema.ts 文件
  const schemaFiles = files.filter(f => f.endsWith(".schema.ts"));

  for (const schemaFile of schemaFiles) {
    const format = schemaFile.replace(".schema.ts", "") as "pdf";

    // 目前只支持 pdf
    if (format !== "pdf") continue;

    const templateFile = `${format}.html`;
    if (!files.includes(templateFile)) {
      console.warn(`⚠ 模板文件 ${templateFile} 不存在，跳过 ${schemaFile}`);
      continue;
    }

    const schemaPath = path.join(dirPath, schemaFile);
    const templatePath = path.join(dirPath, templateFile);

    try {
      // 动态导入 schema 模块
      const schemaModule = (await import(schemaPath)) as TemplateSchemaModule;
      const { meta, schema, pdfOptions } = schemaModule;

      // 检查 ID 唯一性
      if (registry.has(meta.id)) {
        throw new Error(`模板 ID "${meta.id}" 重复`);
      }

      // 创建生成函数
      const generate = async (data: unknown): Promise<Buffer> => {
        return renderPdf(templatePath, data, pdfOptions);
      };

      // 注册模板
      registry.set(meta.id, {
        meta,
        schema,
        format,
        templatePath,
        ...(pdfOptions ? { pdfOptions } : {}),
        generate
      });

      console.log(`  ✓ ${meta.id} (${meta.name})`);
    } catch (err) {
      console.error(`✗ 加载模板失败: ${schemaPath}`, err);
      throw err;
    }
  }
}

/** 获取模板 */
export function getTemplate(id: string): LoadedTemplate | undefined {
  return registry.get(id);
}

/** 检查模板是否存在 */
export function hasTemplate(id: string): boolean {
  return registry.has(id);
}

/** 获取所有模板列表 */
export function listTemplates(): TemplateMeta[] {
  return Array.from(registry.values()).map(t => t.meta);
}

/** 验证数据 */
export function validateData(
  templateId: string,
  data: unknown
): { success: true; data: unknown } | { success: false; error: unknown } {
  const template = getTemplate(templateId);
  if (!template) {
    return { success: false, error: `模板 "${templateId}" 不存在` };
  }

  const result = template.schema.safeParse(data);
  if (!result.success) {
    return { success: false, error: result.error.issues };
  }

  return { success: true, data: result.data };
}
