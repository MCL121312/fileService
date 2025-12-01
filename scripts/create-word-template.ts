import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } from 'docx';
import fs from 'fs';

async function createTemplate() {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        // 标题
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: '健康体检报告', bold: true, size: 48 }),
          ],
        }),
        new Paragraph({ text: '' }),

        // 基本信息
        new Paragraph({
          children: [
            new TextRun({ text: '姓名：', bold: true }),
            new TextRun({ text: '+++INS patientInfo.name+++' }),
            new TextRun({ text: '    性别：', bold: true }),
            new TextRun({ text: '+++INS patientInfo.gender+++' }),
            new TextRun({ text: '    年龄：', bold: true }),
            new TextRun({ text: '+++INS patientInfo.age+++' }),
            new TextRun({ text: ' 岁' }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: '身份证号：', bold: true }),
            new TextRun({ text: '+++INS patientInfo.idCard+++' }),
            new TextRun({ text: '    体检日期：', bold: true }),
            new TextRun({ text: '+++INS patientInfo.examDate+++' }),
          ],
        }),
        new Paragraph({ text: '' }),

        // 检查项目循环
        new Paragraph({
          children: [new TextRun({ text: '+++FOR category IN examItems+++' })],
        }),
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: '【+++INS category.category+++】', bold: true })],
        }),
        new Paragraph({
          children: [new TextRun({ text: '+++FOR item IN category.items+++' })],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: '  · ' }),
            new TextRun({ text: '+++INS item.name+++' }),
            new TextRun({ text: ': ' }),
            new TextRun({ text: '+++INS item.value+++' }),
            new TextRun({ text: ' ' }),
            new TextRun({ text: '+++INS item.unit+++' }),
            new TextRun({ text: ' (参考: ' }),
            new TextRun({ text: '+++INS item.reference+++' }),
            new TextRun({ text: ') ' }),
            new TextRun({ text: '+++INS item.statusText+++' }),
          ],
        }),
        new Paragraph({
          children: [new TextRun({ text: '+++END-FOR item+++' })],
        }),
        new Paragraph({
          children: [new TextRun({ text: '+++END-FOR category+++' })],
        }),
        new Paragraph({ text: '' }),

        // 总结
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: '体检总结', bold: true })],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: '结论：', bold: true }),
            new TextRun({ text: '+++INS summary.conclusion+++' }),
          ],
        }),
        new Paragraph({
          children: [new TextRun({ text: '健康建议：', bold: true })],
        }),
        new Paragraph({
          children: [new TextRun({ text: '+++FOR suggestion IN summary.suggestions+++' })],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: '  · ' }),
            new TextRun({ text: '+++INS suggestion+++' }),
          ],
        }),
        new Paragraph({
          children: [new TextRun({ text: '+++END-FOR suggestion+++' })],
        }),
        new Paragraph({ text: '' }),

        // 生成时间
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: '生成时间：', italics: true, size: 20 }),
            new TextRun({ text: '+++INS generatedAt+++', italics: true, size: 20 }),
          ],
        }),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync('src/templates/health-report/word/template.docx', buffer);
  console.log('✓ Word 模板已生成');
}

createTemplate();

