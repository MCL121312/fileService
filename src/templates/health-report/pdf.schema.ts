import { z } from 'zod';
import type { TemplateMeta } from '../../core/templateLoader.ts';

/** 模板元信息 */
export const meta: TemplateMeta = {
  id: 'health-report',
  name: '健康体检报告',
  description: '标准健康体检报告，包含血常规、肝功能、血脂等检查项目',
};

/** 数据验证 Schema */
export const schema = z.object({
  /** 患者基本信息 */
  patientInfo: z.object({
    /** 姓名 */
    name: z.string().min(1, '姓名不能为空'),
    /** 性别 */
    gender: z.enum(['男', '女']),
    /** 年龄 */
    age: z.number().int().min(0).max(150),
    /** 身份证号 */
    idCard: z.string().min(1, '身份证号不能为空'),
    /** 体检日期 */
    examDate: z.string().min(1, '体检日期不能为空'),
  }),

  /** 检查项目列表 */
  examItems: z.array(
    z.object({
      /** 分类名称，如"血常规"、"肝功能" */
      category: z.string().min(1),
      /** 该分类下的检查项 */
      items: z.array(
        z.object({
          /** 项目名称 */
          name: z.string().min(1),
          /** 检测值 */
          value: z.union([z.string(), z.number()]),
          /** 单位 */
          unit: z.string(),
          /** 参考范围 */
          reference: z.string(),
          /** 状态：正常/偏高/偏低 */
          status: z.enum(['normal', 'high', 'low']),
        })
      ),
    })
  ),

  /** 体检总结 */
  summary: z.object({
    /** 总体结论 */
    conclusion: z.string().min(1, '结论不能为空'),
    /** 健康建议列表 */
    suggestions: z.array(z.string()),
  }),
});

/** 体检报告数据类型 */
export type HealthReportData = z.infer<typeof schema>;

