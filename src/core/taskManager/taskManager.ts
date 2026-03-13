import { randomUUID } from 'crypto';
import type {
  Task,
  TaskStatus,
  TaskResponse,
  CreateTaskRequest,
  TaskError,
  TaskManagerConfig,
} from './types.ts';
import { reportGenerator } from '../reportGenerator.ts';
import { getTemplate, validateData } from '../templateLoader.ts';
import { isTaskFileReady, saveTaskFile } from './filePersistence.ts';
import {
  closePersistence,
  deleteTask as deleteTaskFromPersistence,
  loadTasks,
  saveTask,
  writeTaskLog,
} from './persistence.ts';

const defaultConfig: TaskManagerConfig = {
  taskRetentionMs: 60 * 60 * 1000,
  cleanupIntervalMs: 5 * 60 * 1000,
  maxConcurrent: 10,
};

/** 创建任务管理器 */
export function createTaskManager(config: Partial<TaskManagerConfig> = {}) {
  const finalConfig = { ...defaultConfig, ...config };
  const tasks = new Map<string, Task>();
  const queue: string[] = [];
  let processingCount = 0;
  let cleanupTimer: ReturnType<typeof setInterval> | undefined;
  let initialized = false;

  /** 初始化任务管理器 */
  async function init(): Promise<void> {
    if (initialized) return;

    const loadedTasks = await loadTasks();
    for (const [id, task] of loadedTasks) {
      tasks.set(id, task);
    }

    startCleanup();
    initialized = true;
    console.log('✅ 任务管理器已初始化');
  }
  /** 启动定期清理 */
  function startCleanup(): void {
    cleanupTimer = setInterval(() => cleanup().catch(console.error), finalConfig.cleanupIntervalMs);
  }

  /** 清理过期任务 */
  async function cleanup(): Promise<void> {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, task] of tasks) {
      const taskAge = now - task.createdAt.getTime();
      if (
        taskAge > finalConfig.taskRetentionMs &&
        (task.status === 'completed' || task.status === 'failed')
      ) {
        await deleteTaskFromPersistence(id);
        tasks.delete(id);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`🧹 清理了 ${cleaned} 个过期任务`);
    }
  }

  /** 处理队列 */
  async function processQueue(): Promise<void> {
    while (queue.length > 0 && processingCount < finalConfig.maxConcurrent) {
      const taskId = queue.shift();
      if (!taskId) break;
      const task = tasks.get(taskId);
      if (!task || task.status !== 'pending') continue;

      processingCount++;
      processTask(task).finally(() => {
        processingCount--;
        processQueue();
      });
    }
  }

  /** 创建任务 */
  async function createTask(request: CreateTaskRequest): Promise<Task> {
    ensureTemplateExists(request.templateId);

    const UUID = randomUUID();
    const taskId = UUID;
    const reportId = UUID;
    const task: Task = {
      id: taskId,
      reportId,
      templateId: request.templateId,
      format: request.format,
      status: 'pending',
      filename: generateFilename(request.templateId, reportId),
      createdAt: new Date(),
      data: request.data,
    };

    tasks.set(taskId, task);
    queue.push(taskId);
    await writeTaskLog(task, 'created');
    await saveTask(task);
    console.log(`📝 创建任务: ${taskId} (${request.templateId}/${request.format})`);
    processQueue();
    return task;
  }

  /** 获取任务 */
  function getTask(taskId: string): Task | null {
    return tasks.get(taskId) ?? null;
  }

  /** 通过报告ID获取任务 */
  function getByReportId(reportId: string): Task | null {
    for (const task of tasks.values()) {
      if (task.reportId === reportId) return task;
    }
    return null;
  }

  /** 获取队列状态 */
  function getStatus() {
    const statusCounts = { pending: 0, completed: 0, failed: 0 };
    for (const task of tasks.values()) {
      if (task.status === 'pending') statusCounts.pending++;
      else if (task.status === 'completed') statusCounts.completed++;
      else if (task.status === 'failed') statusCounts.failed++;
    }
    return {
      total: tasks.size,
      queue: queue.length,
      processing: processingCount,
      maxConcurrent: finalConfig.maxConcurrent,
      ...statusCounts,
    };
  }

  /** 列出所有任务 */
  function listAllTask(status?: TaskStatus): TaskResponse[] {
    const result: TaskResponse[] = [];
    for (const task of tasks.values()) {
      if (!status || task.status === status) {
        result.push(getTaskResponse(task.id)!);
      }
    }
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  /** 获取任务响应 (不含 result 数据) */
  function getTaskResponse(taskId: string): TaskResponse | undefined {
    const task = tasks.get(taskId);
    if (!task) return undefined;
    const response: TaskResponse = {
      id: task.id,
      reportId: task.reportId,
      templateId: task.templateId,
      format: task.format,
      status: task.status,
      filename: task.filename,
      createdAt: task.createdAt.toISOString(),
      resultReady: task.status === 'completed' && isFileReady(task),
    };
    if (task.startedAt) response.startedAt = task.startedAt.toISOString();
    if (task.completedAt) response.completedAt = task.completedAt.toISOString();
    if (task.error) response.error = task.error;
    return response;
  }

  /** 删除任务记录（通过任务ID） */
  async function deleteTask(taskId: string): Promise<{ success: boolean; error?: string }> {
    const task = tasks.get(taskId);
    if (!task) {
      return { success: false, error: '任务不存在' };
    }

    if (task.status === 'processing') {
      return { success: false, error: '任务正在处理中，无法删除' };
    }

    await deleteTaskFromPersistence(taskId);
    tasks.delete(taskId);
    console.log(`🗑️ 已删除任务: ${taskId}`);

    return { success: true };
  }

  /** 关闭任务管理器 */
  async function shutdown(): Promise<void> {
    if (cleanupTimer) {
      clearInterval(cleanupTimer);
    }
    await closePersistence();
    console.log('🛑 任务管理器已关闭');
  }
  return {
    init,
    createTask,
    getTask,
    getByReportId,
    getStatus,
    listAllTask,
    deleteTask,
    shutdown,
  };
}

// #region 生成

/** 处理单个任务 */
async function processTask(task: Task): Promise<void> {
  await markTaskProcessing(task);
  console.log(`⚙️ 开始处理任务: ${task.id}`);

  try {
    const data = getValidatedTaskData(task);
    const result = await reportGenerator.generate(task.templateId, data);
    const filePath = saveTaskFile(task.reportId, result.buffer);
    const completedAt = await markTaskCompleted(task, filePath, result.contentType);
    console.log(`✅ 任务完成: ${task.id} (${completedAt.getTime() - task.startedAt!.getTime()}ms)`);
  } catch (err) {
    await markTaskFailed(task, err);
    console.error(`❌ 任务失败: ${task.id}`, task.error);
  }
}

async function markTaskProcessing(task: Task): Promise<void> {
  task.status = 'processing';
  task.startedAt = new Date();
  await writeTaskLog(task, 'started');
  await saveTask(task);
}

async function markTaskCompleted(task: Task, filePath: string, contentType: string): Promise<Date> {
  task.filePath = filePath;
  task.contentType = contentType;
  task.status = 'completed';
  const completedAt = new Date();
  task.completedAt = completedAt;
  await writeTaskLog(task, 'completed');
  await saveTask(task);
  return completedAt;
}

async function markTaskFailed(task: Task, err: unknown): Promise<void> {
  task.status = 'failed';
  task.completedAt = new Date();
  task.error = normalizeError(err);
  await writeTaskLog(task, 'failed');
  await saveTask(task);
}

/** 检查报告文件是否存在 */
function isFileReady(task: Task): boolean {
  return isTaskFileReady(task);
}

/** 生成规范的文件名 */
function generateFilename(templateId: string, reportId: string): string {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
  const shortId = reportId.slice(0, 8);
  return `${templateId}_${timestamp}_${shortId}.pdf`;
}

/** 规范化错误 */
function normalizeError(err: unknown): TaskError {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    return err as TaskError;
  }
  return {
    code: 'INTERNAL_ERROR',
    message: err instanceof Error ? err.message : String(err),
  };
}
// #endregion

// #region 模板

/** 确保模板存在 */
function ensureTemplateExists(templateId: string): void {
  const template = getTemplate(templateId);
  if (!template) {
    throw new Error(`模板 "${templateId}" 不存在`);
  }
}

/** 校验任务模板数据 */
function getValidatedTaskData(task: Task) {
  const validation = validateData(task.templateId, task.data);
  if (!validation.success) {
    throw {
      code: 'VALIDATION_ERROR',
      message: '数据验证失败',
      details: validation.error,
    };
  }
  return validation.data;
}

// #endregion

/** 全局任务管理器实例 */
export const taskManager = createTaskManager();
