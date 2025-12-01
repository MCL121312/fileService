import type { z } from 'zod';

/** 模板元信息 */
export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
}

/** 模板定义 */
export interface TemplateDefinition<T = unknown> {
  metadata: TemplateMetadata;
  /** 数据验证 Schema */
  schema: z.ZodSchema<T>;
  /** PDF 生成器 */
  pdfGenerator?: (data: T) => Promise<Buffer>;
  /** Word 文档生成器 */
  wordGenerator?: (data: T) => Promise<Buffer>;
}

/** 模板注册表 */
export type TemplateRegistry = Map<string, TemplateDefinition>;

/** 生成请求 */
export interface GenerateRequest {
  templateId: string;
  data: unknown;
  format: 'pdf' | 'word';
}

/** 生成结果 */
export interface GenerateResult {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

