import nunjucks from 'nunjucks';
import path from 'path';
import type { TemplateDefinition, TemplateRegistry, TemplateMetadata } from '../types/template.ts';

/** 模板管理器 - 负责模板的注册、加载和渲染 */
export class TemplateManager {
  private registry: TemplateRegistry = new Map();
  private nunjucksEnv: nunjucks.Environment;

  constructor() {
    const templatesDir = path.join(import.meta.dirname, '../templates');
    this.nunjucksEnv = nunjucks.configure(templatesDir, {
      autoescape: true,
      noCache: process.env.NODE_ENV !== 'production',
    });
  }

  /** 注册模板 */
  register<T>(template: TemplateDefinition<T>): void {
    if (this.registry.has(template.metadata.id)) {
      console.warn(`模板 "${template.metadata.id}" 已存在，将被覆盖`);
    }
    this.registry.set(template.metadata.id, template as TemplateDefinition);
    console.log(`✓ 已注册模板: ${template.metadata.id} (${template.metadata.name})`);
  }

  /** 获取模板 */
  get(templateId: string): TemplateDefinition | undefined {
    return this.registry.get(templateId);
  }

  /** 检查模板是否存在 */
  has(templateId: string): boolean {
    return this.registry.has(templateId);
  }

  /** 获取所有模板列表 */
  list(): TemplateMetadata[] {
    return Array.from(this.registry.values()).map((t) => t.metadata);
  }

  /** 验证数据 */
  validate(templateId: string, data: unknown): { success: true; data: unknown } | { success: false; error: unknown } {
    const template = this.get(templateId);
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
  render(templateId: string, data: unknown): string {
    const template = this.get(templateId);
    if (!template) {
      throw new Error(`模板 "${templateId}" 不存在`);
    }

    return this.nunjucksEnv.render(template.htmlTemplate, {
      ...data as object,
      generatedAt: new Date().toLocaleString('zh-CN'),
    });
  }

  /** 检查模板是否支持 Word 格式 */
  supportsWord(templateId: string): boolean {
    const template = this.get(templateId);
    return !!template?.wordGenerator;
  }

  /** 生成 Word 文档 */
  async generateWord(templateId: string, data: unknown): Promise<Buffer> {
    const template = this.get(templateId);
    if (!template?.wordGenerator) {
      throw new Error(`模板 "${templateId}" 不支持 Word 格式`);
    }

    return template.wordGenerator(data);
  }
}

/** 全局模板管理器实例 */
export const templateManager = new TemplateManager();

