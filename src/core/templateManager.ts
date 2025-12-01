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
}

/** 创建模板管理器 */
export function createTemplateManager(): TemplateManager {
  const registry: TemplateRegistry = new Map();

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

  return {
    register,
    get,
    has,
    list,
    validate,
  };
}

/** 全局模板管理器实例 */
export const templateManager = createTemplateManager();

