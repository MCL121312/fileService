import { Hono } from 'hono';
import { taskManager } from '../core/taskManager/taskManager.ts';

const tasks = new Hono();

/** 生成文件资源路径 */
function getFileUrl(task: { reportId: string; status: string }) {
  if (task.status !== 'completed') return null;
  return `/files/${task.reportId}.pdf`;
}

/** GET /getAllTasks - 获取任务列表 */
tasks.get('/getAllTasks', c => {
  const status = c.req.query('status') as
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed'
    | undefined;
  const startTime = c.req.query('startTime');
  const endTime = c.req.query('endTime');

  let taskList = taskManager.listAllTask(status);

  // 时间范围筛选
  if (startTime || endTime) {
    const start = startTime ? new Date(startTime).getTime() : 0;
    const end = endTime ? new Date(endTime).getTime() : Date.now();

    taskList = taskList.filter(t => {
      const createdAt = new Date(t.createdAt).getTime();
      return createdAt >= start && createdAt <= end;
    });
  }

  return c.json({
    tasks: taskList.map(t => ({
      taskId: t.id,
      status: t.status,
      content: {
        reportId: t.reportId,
        file: t.status === 'completed' && t.resultReady ? `/files/${t.reportId}.pdf` : null,
      },
      templateId: t.templateId,
      format: t.format,
      createdAt: t.createdAt,
      startedAt: t.startedAt,
      completedAt: t.completedAt,
      error: t.error,
    })),
  });
});

/** GET /getTask/:taskId - 获取单个任务 */
tasks.get('/getTask/:taskId', c => {
  const taskId = c.req.param('taskId');
  const task = taskManager.getTask(taskId);

  if (!task) {
    return c.json({ error: '任务不存在' }, 404);
  }

  return c.json({
    taskId: task.id,
    status: task.status,
    content: {
      reportId: task.reportId,
      file: getFileUrl(task),
    },
    detail: {
      templateId: task.templateId,
      format: task.format,
      createdAt: task.createdAt.toISOString(),
      startedAt: task.startedAt?.toISOString(),
      completedAt: task.completedAt?.toISOString(),
      duration:
        task.startedAt && task.completedAt
          ? task.completedAt.getTime() - task.startedAt.getTime()
          : null,
      error: task.error,
    },
  });
});

/** DELETE /deleteTask/:taskId - 删除任务记录 */
tasks.delete('/deleteTask/:taskId', async c => {
  const taskId = c.req.param('taskId');
  const result = await taskManager.deleteTask(taskId);

  if (!result.success) {
    return c.json({ error: result.error }, 404);
  }

  return c.json({ message: '任务删除成功' });
});

export default tasks;
