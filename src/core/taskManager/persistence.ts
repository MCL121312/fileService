import { database } from '../database.ts';
import type { PersistedTask, Task } from './types.ts';

export type TaskLogEvent = 'created' | 'started' | 'completed' | 'failed';

function persistedTaskToTask(persistedTask: PersistedTask): Task {
  const task: Task = {
    id: persistedTask.id,
    reportId: persistedTask.report_id,
    templateId: persistedTask.template_id,
    format: persistedTask.format,
    status: persistedTask.status,
    filename: persistedTask.filename,
    ...(persistedTask.file_path ? { filePath: persistedTask.file_path } : {}),
    ...(persistedTask.content_type ? { contentType: persistedTask.content_type } : {}),
    createdAt: new Date(persistedTask.created_at),
    data: {},
  };

  if (persistedTask.started_at) task.startedAt = new Date(persistedTask.started_at);
  if (persistedTask.completed_at) task.completedAt = new Date(persistedTask.completed_at);
  if (persistedTask.error_code) {
    task.error = { code: persistedTask.error_code, message: persistedTask.error_message || '' };
  }

  return task;
}

export async function loadTasks(): Promise<Map<string, Task>> {
  const tasks = new Map<string, Task>();

  try {
    await database.init();

    await database.run(
      `UPDATE tasks SET status = 'failed', completed_at = ?, error_code = 'SERVER_RESTART', error_message = '服务重启，任务中断' WHERE status IN ('pending', 'processing')`,
      [new Date().toISOString()],
    );

    const rows = await database.all<PersistedTask>('SELECT * FROM tasks');
    for (const row of rows) {
      const task = persistedTaskToTask(row);
      tasks.set(task.id, task);
    }

    console.log(`📂 从数据库加载了 ${tasks.size} 个任务`);
  } catch (err) {
    console.error('⚠️ 加载任务失败:', err);
  }

  return tasks;
}

export async function saveTask(task: Task): Promise<void> {
  await database.run(
    `INSERT OR REPLACE INTO tasks (id, report_id, template_id, format, status, filename, file_path, content_type, created_at, started_at, completed_at, error_code, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      task.id,
      task.reportId,
      task.templateId,
      task.format,
      task.status,
      task.filename,
      task.filePath || null,
      task.contentType || null,
      task.createdAt.toISOString(),
      task.startedAt?.toISOString() || null,
      task.completedAt?.toISOString() || null,
      task.error?.code || null,
      task.error?.message || null,
    ],
  );
}

export async function deleteTask(taskId: string): Promise<void> {
  await database.run('DELETE FROM tasks WHERE id = ?', [taskId]);
}

export async function writeTaskLog(task: Task, event: TaskLogEvent): Promise<void> {
  const duration =
    task.startedAt && task.completedAt
      ? task.completedAt.getTime() - task.startedAt.getTime()
      : null;

  await database.run(
    `INSERT INTO task_logs (task_id, event, template_id, format, filename, status, duration, error_code, error_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      task.id,
      event,
      task.templateId,
      task.format,
      task.filename,
      task.status,
      duration,
      task.error?.code || null,
      task.error?.message || null,
      new Date().toISOString(),
    ],
  );
}

export async function closePersistence(): Promise<void> {
  await database.close();
}
