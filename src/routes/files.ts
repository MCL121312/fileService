import { Hono } from 'hono';
import { taskManager } from '../core/taskManager.ts';

const files = new Hono();

/** GET /:filename - 直接访问文件资源 */
files.get('/:filename', (c) => {
  const filename = c.req.param('filename');

  // 解析文件名: {reportId}.{ext}
  const match = filename.match(/^([a-f0-9-]+)\.(pdf|docx)$/i);
  if (!match) {
    return c.json({ error: '无效的文件名格式' }, 400);
  }

  const [, reportId, ext] = match;
  const task = taskManager.getByReportId(reportId);

  if (!task) {
    return c.json({ error: '文件不存在' }, 404);
  }

  if (task.status !== 'completed') {
    return c.json({ error: '文件尚未生成完成', status: task.status }, 202);
  }

  // 验证格式匹配
  const expectedExt = task.format === 'word' ? 'docx' : 'pdf';
  if (ext.toLowerCase() !== expectedExt) {
    return c.json({ error: '文件格式不匹配' }, 400);
  }

  const result = taskManager.getResultByReportId(reportId);
  if (!result) {
    return c.json({ error: '文件不可用' }, 500);
  }

  return new Response(result.buffer, {
    headers: {
      'Content-Type': result.contentType,
      'Content-Disposition': `inline; filename="${result.filename}"`,
    },
  });
});

/** DELETE /:filename - 删除文件资源 */
files.delete('/:filename', async (c) => {
  const filename = c.req.param('filename');

  // 解析文件名: {reportId}.{ext}
  const match = filename.match(/^([a-f0-9-]+)\.(pdf|docx)$/i);
  if (!match) {
    return c.json({ error: '无效的文件名格式' }, 400);
  }

  const [, reportId] = match;
  const result = await taskManager.deleteFile(reportId);

  if (!result.success) {
    return c.json({ error: result.error }, 404);
  }

  return c.json({ message: '文件删除成功' });
});

export default files;

