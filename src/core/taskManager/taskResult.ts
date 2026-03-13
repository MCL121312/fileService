import type { Task } from './types.ts';
import { deleteTaskFile, readTaskFile } from './filePersistence.ts';
import type { TaskFileResult } from './filePersistence.ts';
import { saveTask } from './persistence.ts';
import { taskManager } from './taskManager.ts';

export interface TaskResultTaskAccessor {
  getTask(taskId: string): Task | null;
  getByReportId(reportId: string): Task | null;
}

export function createTaskResult(taskAccessor: TaskResultTaskAccessor) {
  function getResult(taskId: string): TaskFileResult | null {
    const task = taskAccessor.getTask(taskId);
    if (!task || task.status !== 'completed') return null;
    return readTaskFile(task) ?? null;
  }

  function getResultByReportId(reportId: string): TaskFileResult | null {
    const task = taskAccessor.getByReportId(reportId);
    if (!task || task.status !== 'completed') return null;
    return readTaskFile(task) ?? null;
  }

  async function deleteFile(reportId: string): Promise<{ success: boolean; error?: string }> {
    const task = taskAccessor.getByReportId(reportId);
    if (!task) {
      return { success: false, error: '文件不存在' };
    }

    if (task.status === 'processing') {
      return { success: false, error: '任务正在处理中，无法删除' };
    }

    const deletedFilePath = deleteTaskFile(task);
    if (!deletedFilePath) {
      return { success: false, error: '文件不存在' };
    }

    task.filePath = undefined;
    await saveTask(task);
    console.log(`🗑️ 已删除文件: ${deletedFilePath}`);

    return { success: true };
  }

  return {
    getResult,
    getResultByReportId,
    deleteFile,
  };
}

export const taskResult = createTaskResult(taskManager);
