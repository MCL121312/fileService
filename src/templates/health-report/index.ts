import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  AlignmentType,
  BorderStyle,
  HeadingLevel,
} from 'docx';
import { z } from 'zod';
import type { TemplateDefinition } from '../../types/template.ts';

/** 体检报告数据 Schema */
export const HealthReportSchema = z.object({
  patientInfo: z.object({
    name: z.string().min(1, '姓名不能为空'),
    gender: z.enum(['男', '女']),
    age: z.number().int().min(0).max(150),
    idCard: z.string().min(1, '身份证号不能为空'),
    examDate: z.string().min(1, '体检日期不能为空'),
  }),
  examItems: z.array(
    z.object({
      category: z.string().min(1),
      items: z.array(
        z.object({
          name: z.string().min(1),
          value: z.union([z.string(), z.number()]),
          unit: z.string(),
          reference: z.string(),
          status: z.enum(['normal', 'high', 'low']),
        })
      ),
    })
  ),
  summary: z.object({
    conclusion: z.string().min(1, '结论不能为空'),
    suggestions: z.array(z.string()),
  }),
});

export type HealthReportData = z.infer<typeof HealthReportSchema>;

/** Word 文档生成器 */
async function generateWord(data: HealthReportData): Promise<Buffer> {
  const { patientInfo, examItems, summary } = data;

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: '健康体检报告',
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          new Paragraph({ text: '基本信息', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 200 } }),
          createInfoParagraph('姓名', patientInfo.name),
          createInfoParagraph('性别', patientInfo.gender),
          createInfoParagraph('年龄', `${patientInfo.age} 岁`),
          createInfoParagraph('身份证', patientInfo.idCard),
          createInfoParagraph('体检日期', patientInfo.examDate),
          ...examItems.flatMap((category) => [
            new Paragraph({ text: category.category, heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 200 } }),
            createExamTable(category.items),
          ]),
          new Paragraph({ text: '体检结论与建议', heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 200 } }),
          new Paragraph({
            children: [new TextRun({ text: '总体结论：', bold: true }), new TextRun(summary.conclusion)],
            spacing: { after: 200 },
          }),
          new Paragraph({ children: [new TextRun({ text: '健康建议：', bold: true })], spacing: { after: 100 } }),
          ...summary.suggestions.map((s, i) => new Paragraph({ text: `${i + 1}. ${s}`, spacing: { after: 100 } })),
          new Paragraph({
            text: `报告生成时间：${new Date().toLocaleString('zh-CN')}`,
            alignment: AlignmentType.CENTER,
            spacing: { before: 400 },
          }),
        ],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

function createInfoParagraph(label: string, value: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `${label}：`, bold: true }), new TextRun(value)],
    spacing: { after: 100 },
  });
}

function createExamTable(items: HealthReportData['examItems'][0]['items']): Table {
  const headerRow = new TableRow({
    children: ['项目名称', '检测结果', '单位', '参考范围', '状态'].map(
      (text) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })], shading: { fill: 'E8ECF1' } })
    ),
  });

  const dataRows = items.map(
    (item) =>
      new TableRow({
        children: [item.name, String(item.value), item.unit, item.reference, item.status === 'normal' ? '正常' : item.status === 'high' ? '偏高 ↑' : '偏低 ↓'].map(
          (text) => new TableCell({ children: [new Paragraph(text)] })
        ),
      })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1 },
      bottom: { style: BorderStyle.SINGLE, size: 1 },
      left: { style: BorderStyle.SINGLE, size: 1 },
      right: { style: BorderStyle.SINGLE, size: 1 },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
      insideVertical: { style: BorderStyle.SINGLE, size: 1 },
    },
    rows: [headerRow, ...dataRows],
  });
}

/** 体检报告模板定义 */
export const healthReportTemplate: TemplateDefinition<HealthReportData> = {
  metadata: {
    id: 'health-report',
    name: '健康体检报告',
    description: '标准健康体检报告，包含血常规、肝功能、血脂等检查项目',
    version: '1.0.0',
  },
  htmlTemplate: 'health-report/template.html',
  schema: HealthReportSchema,
  wordGenerator: generateWord,
};

