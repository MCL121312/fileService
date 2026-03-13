import { Hono } from 'hono';
import { taskManager } from '../core/taskManager/taskManager.ts';
import { taskResult } from '../core/taskManager/taskResult.ts';

const files = new Hono();
export const fileApis = new Hono();

/** 生成文件的 HTTP 访问地址 */
function getFileHttpUrl(requestUrl: string, reportId: string): string {
  const url = new URL(requestUrl);
  return new URL(`/files/${reportId}.pdf`, url.origin).toString();
}

/** GET /getAllFiles - 获取已生成文件列表 */
fileApis.get('/getAllFiles', c => {
  const items = taskManager
    .listAllTask('completed')
    .filter(task => task.resultReady)
    .map(task => ({
      reportId: task.reportId,
      taskId: task.id,
      templateId: task.templateId,
      filename: task.filename,
      file: getFileHttpUrl(c.req.url, task.reportId),
      status: task.status,
      createdAt: task.createdAt,
      completedAt: task.completedAt || null,
    }));

  return c.json({ items, total: items.length });
});

/** GET /:filename - 直接访问文件资源 */
files.get('/:filename', c => {
  const filename = c.req.param('filename');

  // 解析文件名: {reportId}.pdf
  const match = filename.match(/^([a-f0-9-]+)\.pdf$/i);
  if (!match) {
    return c.json({ error: '无效的文件名格式' }, 400);
  }

  const [, reportId] = match;
  const task = taskManager.getByReportId(reportId);

  if (!task) {
    return c.json({ error: '文件不存在' }, 404);
  }

  if (task.status !== 'completed') {
    return c.json({ error: '文件尚未生成完成', status: task.status }, 202);
  }

  const result = taskResult.getResultByReportId(reportId);
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
files.delete('/:filename', async c => {
  const filename = c.req.param('filename');

  // 解析文件名: {reportId}.pdf
  const match = filename.match(/^([a-f0-9-]+)\.pdf$/i);
  if (!match) {
    return c.json({ error: '无效的文件名格式' }, 400);
  }

  const [, reportId] = match;
  const result = await taskResult.deleteFile(reportId);

  if (!result.success) {
    return c.json({ error: result.error }, 404);
  }

  return c.json({ message: '文件删除成功' });
});

export default files;
