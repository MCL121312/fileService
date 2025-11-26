import { randomUUID } from 'crypto';
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { Task, TaskStatus, TaskResponse, CreateTaskRequest, TaskError, OutputFormat } from '../types/task.ts';
import { reportGenerator } from './report-generator.ts';
import { templateManager } from './template-manager.ts';

/** 文件扩展名映射 */
const FORMAT_EXTENSIONS: Record<OutputFormat, string> = {
  pdf: 'pdf',
  word: 'docx',
};

/** 日志目录 */
const LOG_DIR = 'logs';
const LOG_FILE = join(LOG_DIR, 'tasks.log');

/** 确保日志目录存在 */
function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

/** 写入任务日志 */
function writeTaskLog(task: Task, event: 'created' | 'started' | 'completed' | 'failed'): void {
  ensureLogDir();
  const logEntry = {
    timestamp: new Date().toISOString(),
    event,
    taskId: task.id,
    templateId: task.templateId,
    format: task.format,
    filename: task.filename,
    status: task.status,
    duration: task.startedAt && task.completedAt
      ? task.completedAt.getTime() - task.startedAt.getTime()
      : undefined,
    error: task.error,
  };
  appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n');
}

/** 生成规范的文件名 */
function generateFilename(templateId: string, taskId: string, format: OutputFormat): string {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
  const shortId = taskId.slice(0, 8);
  return `${templateId}_${timestamp}_${shortId}.${FORMAT_EXTENSIONS[format]}`;
}

/** 任务管理器配置 */
export interface TaskManagerConfig {
  /** 任务保留时间 (ms)，默认 1 小时 */
  taskRetentionMs: number;
  /** 清理间隔 (ms)，默认 5 分钟 */
  cleanupIntervalMs: number;
  /** 最大并发任务数 */
  maxConcurrent: number;
}

const defaultConfig: TaskManagerConfig = {
  taskRetentionMs: 60 * 60 * 1000,
  cleanupIntervalMs: 5 * 60 * 1000,
  maxConcurrent: 10,
};

/** 任务管理器 */
export class TaskManager {
  private tasks: Map<string, Task> = new Map();
  private processingCount = 0;
  private queue: string[] = [];
  private config: TaskManagerConfig;
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(config: Partial<TaskManagerConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.startCleanup();
  }

  /** 启动定期清理 */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMs);
  }

  /** 清理过期任务 */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, task] of this.tasks) {
      const taskAge = now - task.createdAt.getTime();
      if (taskAge > this.config.taskRetentionMs && (task.status === 'completed' || task.status === 'failed')) {
        this.tasks.delete(id);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`🧹 清理了 ${cleaned} 个过期任务`);
    }
  }

  /** 创建任务 */
  create(request: CreateTaskRequest): Task {
    if (!templateManager.has(request.templateId)) {
      throw new Error(`模板 "${request.templateId}" 不存在`);
    }
    if (request.format === 'word' && !templateManager.supportsWord(request.templateId)) {
      throw new Error(`模板 "${request.templateId}" 不支持 Word 格式`);
    }

    const taskId = randomUUID();
    const task: Task = {
      id: taskId,
      templateId: request.templateId,
      format: request.format,
      status: 'pending',
      filename: generateFilename(request.templateId, taskId, request.format),
      createdAt: new Date(),
      data: request.data,
    };

    this.tasks.set(taskId, task);
    this.queue.push(taskId);
    writeTaskLog(task, 'created');
    console.log(`📝 创建任务: ${taskId} (${request.templateId}/${request.format})`);
    this.processQueue();
    return task;
  }

  /** 处理队列 */
  private async processQueue(): Promise<void> {
    while (this.queue.length > 0 && this.processingCount < this.config.maxConcurrent) {
      const taskId = this.queue.shift();
      if (!taskId) break;
      const task = this.tasks.get(taskId);
      if (!task || task.status !== 'pending') continue;

      this.processingCount++;
      this.processTask(task).finally(() => {
        this.processingCount--;
        this.processQueue();
      });
    }
  }

  /** 处理单个任务 */
  private async processTask(task: Task): Promise<void> {
    task.status = 'processing';
    task.startedAt = new Date();
    writeTaskLog(task, 'started');
    console.log(`⚙️ 开始处理任务: ${task.id}`);

    try {
      const validation = templateManager.validate(task.templateId, task.data);
      if (!validation.success) {
        throw { code: 'VALIDATION_ERROR', message: '数据验证失败', details: validation.error };
      }
      const result = await reportGenerator.generate(task.templateId, validation.data, task.format);
      task.result = result.buffer.toString('base64');
      task.contentType = result.contentType;
      task.status = 'completed';
      task.completedAt = new Date();
      writeTaskLog(task, 'completed');
      console.log(`✅ 任务完成: ${task.id} (${task.completedAt.getTime() - task.startedAt!.getTime()}ms)`);
    } catch (err) {
      task.status = 'failed';
      task.completedAt = new Date();
      task.error = this.normalizeError(err);
      writeTaskLog(task, 'failed');
      console.error(`❌ 任务失败: ${task.id}`, task.error);
    }
  }

  /** 规范化错误 */
  private normalizeError(err: unknown): TaskError {
    if (typeof err === 'object' && err !== null && 'code' in err) {
      return err as TaskError;
    }
    return { code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
  }

  /** 获取任务 */
  get(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /** 获取任务响应 (不含 result 数据) */
  getResponse(taskId: string): TaskResponse | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;
    return {
      id: task.id,
      templateId: task.templateId,
      format: task.format,
      status: task.status,
      filename: task.filename,
      createdAt: task.createdAt.toISOString(),
      startedAt: task.startedAt?.toISOString(),
      completedAt: task.completedAt?.toISOString(),
      error: task.error,
      resultReady: task.status === 'completed' && !!task.result,
    };
  }

  /** 获取任务结果 (Buffer) */
  getResult(taskId: string): { buffer: Buffer; filename: string; contentType: string } | undefined {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'completed' || !task.result) return undefined;
    return {
      buffer: Buffer.from(task.result, 'base64'),
      filename: task.filename,
      contentType: task.contentType!,
    };
  }

  /** 获取队列状态 */
  getStatus() {
    const statusCounts: Record<TaskStatus, number> = { pending: 0, processing: 0, completed: 0, failed: 0 };
    for (const task of this.tasks.values()) {
      statusCounts[task.status]++;
    }
    return {
      total: this.tasks.size,
      queue: this.queue.length,
      processing: this.processingCount,
      maxConcurrent: this.config.maxConcurrent,
      ...statusCounts,
    };
  }

  /** 列出所有任务 */
  list(status?: TaskStatus): TaskResponse[] {
    const tasks: TaskResponse[] = [];
    for (const task of this.tasks.values()) {
      if (!status || task.status === status) {
        tasks.push(this.getResponse(task.id)!);
      }
    }
    return tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /** 关闭任务管理器 */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    console.log('🛑 任务管理器已关闭');
  }
}

/** 全局任务管理器实例 */
export const taskManager = new TaskManager();
