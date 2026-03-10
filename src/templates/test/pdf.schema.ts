import { z } from "zod";
import type { TemplateMeta } from "../../core/templateLoader.ts";

export const meta: TemplateMeta = {
  id: "test",
  name: "测试报告",
  description: "一个测试报告"
};

export const schema = z.object({
  /** 医院名称 */
  hospitalName: z.string().min(1, "医院名称不能为空")
});

export type TestTemplateSchema = z.infer<typeof schema>;
