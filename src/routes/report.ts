import { Hono } from 'hono';
import { templateManager } from '../core/template-manager.ts';
import { browserPool } from '../core/browser-pool.ts';
import { taskManager } from '../core/task-manager.ts';
import type { OutputFormat } from '../types/task.ts';

const report = new Hono();

/** GET / - 获取所有可用模板 */
report.get('/', (c) => {
  const templates = templateManager.list().map((t) => ({
    ...t,
    endpoints: {
      submit: `/api/report/${t.id}/submit`,
      formats: {
        pdf: true,
        word: templateManager.supportsWord(t.id),
      },
    },
  }));
  return c.json({ templates });
});

/** GET /status - 获取服务状态 */
report.get('/status', (c) => {
  return c.json({
    status: 'running',
    browserPool: browserPool.getStatus(),
    taskQueue: taskManager.getStatus(),
    templates: templateManager.list().length,
  });
});

/** GET /tasks - 获取任务列表 */
report.get('/tasks', (c) => {
  const status = c.req.query('status') as 'pending' | 'processing' | 'completed' | 'failed' | undefined;
  const tasks = taskManager.list(status);
  return c.json({ tasks });
});

/** GET /tasks/:taskId - 获取任务状态 */
report.get('/tasks/:taskId', (c) => {
  const taskId = c.req.param('taskId');
  const task = taskManager.getResponse(taskId);

  if (!task) {
    return c.json({ error: '任务不存在' }, 404);
  }

  return c.json({ task });
});

/** GET /tasks/:taskId/download - 下载任务结果 */
report.get('/tasks/:taskId/download', (c) => {
  const taskId = c.req.param('taskId');
  const task = taskManager.get(taskId);

  if (!task) {
    return c.json({ error: '任务不存在' }, 404);
  }

  if (task.status === 'pending' || task.status === 'processing') {
    return c.json({ error: '任务尚未完成', status: task.status }, 202);
  }

  if (task.status === 'failed') {
    return c.json({ error: '任务执行失败', details: task.error }, 400);
  }

  const result = taskManager.getResult(taskId);
  if (!result) {
    return c.json({ error: '任务结果不可用' }, 500);
  }

  return new Response(result.buffer, {
    headers: {
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
    },
  });
});

/** POST /:templateId/submit - 提交生成任务 */
report.post('/:templateId/submit', async (c) => {
  const templateId = c.req.param('templateId');
  const format = (c.req.query('format') || 'pdf') as OutputFormat;

  if (!['pdf', 'word'].includes(format)) {
    return c.json({ error: '不支持的格式，请使用 pdf 或 word' }, 400);
  }

  try {
    const body = await c.req.json();
    const task = taskManager.create({ templateId, format, data: body });

    return c.json({
      message: '任务已提交',
      task: taskManager.getResponse(task.id),
      links: {
        status: `/api/report/tasks/${task.id}`,
        download: `/api/report/tasks/${task.id}/download`,
      },
    }, 201);
  } catch (error) {
    console.error(`创建任务失败 (模板: ${templateId}):`, error);
    return c.json({ error: '创建任务失败', message: String(error) }, 400);
  }
});

export default report;

