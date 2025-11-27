import nunjucks from 'nunjucks';
import path from 'path';
import type { TemplateDefinition, TemplateRegistry, TemplateMetadata } from '../types/template.ts';

/** 模板管理器接口 */
export interface TemplateManager {
  /** 注册模板 */
  register<T>(template: TemplateDefinition<T>): void;
  /** 获取模板 */
  get(templateId: string): TemplateDefinition | undefined;
  /** 检查模板是否存在 */
  has(templateId: string): boolean;
  /** 获取所有模板列表 */
  list(): TemplateMetadata[];
  /** 验证数据 */
  validate(templateId: string, data: unknown): { success: true; data: unknown } | { success: false; error: unknown };
  /** 渲染 HTML */
  render(templateId: string, data: unknown): string;
  /** 检查模板是否支持 Word 格式 */
  supportsWord(templateId: string): boolean;
  /** 生成 Word 文档 */
  generateWord(templateId: string, data: unknown): Promise<Buffer>;
}

/** 创建模板管理器 */
export function createTemplateManager(): TemplateManager {
  const registry: TemplateRegistry = new Map();
  const templatesDir = path.join(import.meta.dirname, '../templates');
  const nunjucksEnv = nunjucks.configure(templatesDir, {
    autoescape: true,
    noCache: process.env.NODE_ENV !== 'production',
  });

  /** 注册模板 */
  function register<T>(template: TemplateDefinition<T>): void {
    if (registry.has(template.metadata.id)) {
      console.warn(`模板 "${template.metadata.id}" 已存在，将被覆盖`);
    }
    registry.set(template.metadata.id, template as TemplateDefinition);
    console.log(`✓ 已注册模板: ${template.metadata.id} (${template.metadata.name})`);
  }

  /** 获取模板 */
  function get(templateId: string): TemplateDefinition | undefined {
    return registry.get(templateId);
  }

  /** 检查模板是否存在 */
  function has(templateId: string): boolean {
    return registry.has(templateId);
  }

  /** 获取所有模板列表 */
  function list(): TemplateMetadata[] {
    return Array.from(registry.values()).map((t) => t.metadata);
  }

  /** 验证数据 */
  function validate(templateId: string, data: unknown): { success: true; data: unknown } | { success: false; error: unknown } {
    const template = get(templateId);
    if (!template) {
      return { success: false, error: `模板 "${templateId}" 不存在` };
    }

    const result = template.schema.safeParse(data);
    if (!result.success) {
      return { success: false, error: result.error.issues };
    }

    return { success: true, data: result.data };
  }

  /** 渲染 HTML */
  function render(templateId: string, data: unknown): string {
    const template = get(templateId);
    if (!template) {
      throw new Error(`模板 "${templateId}" 不存在`);
    }

    return nunjucksEnv.render(template.htmlTemplate, {
      ...data as object,
      generatedAt: new Date().toLocaleString('zh-CN'),
    });
  }

  /** 检查模板是否支持 Word 格式 */
  function supportsWord(templateId: string): boolean {
    const template = get(templateId);
    return !!template?.wordGenerator;
  }

  /** 生成 Word 文档 */
  async function generateWord(templateId: string, data: unknown): Promise<Buffer> {
    const template = get(templateId);
    if (!template?.wordGenerator) {
      throw new Error(`模板 "${templateId}" 不支持 Word 格式`);
    }

    return template.wordGenerator(data);
  }

  return {
    register,
    get,
    has,
    list,
    validate,
    render,
    supportsWord,
    generateWord,
  };
}

/** 全局模板管理器实例 */
export const templateManager = createTemplateManager();

