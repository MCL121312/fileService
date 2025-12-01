import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Task, TaskStatus, TaskResponse, CreateTaskRequest, TaskError, OutputFormat } from '../types/task.ts';
import { reportGenerator } from './reportGenerator.ts';
import { templateManager } from './templateManager.ts';
import { database } from './database.ts';

/** 文件扩展名映射 */
const FORMAT_EXTENSIONS: Record<OutputFormat, string> = {
  pdf: 'pdf',
  word: 'docx',
};

/** Content-Type 映射 */
const FORMAT_CONTENT_TYPES: Record<OutputFormat, string> = {
  pdf: 'application/pdf',
  word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/** 根据格式获取 Content-Type */
function getContentType(format: OutputFormat): string {
  return FORMAT_CONTENT_TYPES[format];
}

/** 数据目录 */
const DATA_DIR = 'data';
const FILES_DIR = join(DATA_DIR, 'files');

/** 确保目录存在 */
function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/** 数据库任务记录结构 */
interface TaskRow {
  id: string;
  report_id: string;
  template_id: string;
  format: OutputFormat;
  status: TaskStatus;
  filename: string;
  file_path: string | null;
  content_type: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_code: string | null;
  error_message: string | null;
}

/** 将数据库行转换为 Task 对象 */
function rowToTask(row: TaskRow): Task {
  const task: Task = {
    id: row.id,
    reportId: row.report_id,
    templateId: row.template_id,
    format: row.format,
    status: row.status,
    filename: row.filename,
    filePath: row.file_path || undefined,
    contentType: row.content_type || undefined,
    createdAt: new Date(row.created_at),
    data: {},
  };

  if (row.started_at) task.startedAt = new Date(row.started_at);
  if (row.completed_at) task.completedAt = new Date(row.completed_at);
  if (row.error_code) {
    task.error = { code: row.error_code, message: row.error_message || '' };
  }

  return task;
}

/** 从数据库加载任务 */
async function loadTasks(): Promise<Map<string, Task>> {
  const tasks = new Map<string, Task>();

  try {
    await database.init();

    // 将处理中的任务标记为失败（服务重启）
    await database.run(
      `UPDATE tasks SET status = 'failed', completed_at = ?, error_code = 'SERVER_RESTART', error_message = '服务重启，任务中断' WHERE status IN ('pending', 'processing')`,
      [new Date().toISOString()]
    );

    const rows = await database.all<TaskRow>('SELECT * FROM tasks');
    for (const row of rows) {
      const task = rowToTask(row);
      tasks.set(task.id, task);
    }

    console.log(`📂 从数据库加载了 ${tasks.size} 个任务`);
  } catch (err) {
    console.error('⚠️ 加载任务失败:', err);
  }

  return tasks;
}

/** 保存单个任务到数据库 */
async function saveTask(task: Task): Promise<void> {
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
    ]
  );
}

/** 删除任务记录 */
async function deleteTaskFromDb(taskId: string): Promise<void> {
  await database.run('DELETE FROM task_logs WHERE task_id = ?', [taskId]);
  await database.run('DELETE FROM tasks WHERE id = ?', [taskId]);
}

/** 写入任务日志到数据库 */
async function writeTaskLog(task: Task, event: 'created' | 'started' | 'completed' | 'failed'): Promise<void> {
  const duration = task.startedAt && task.completedAt
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
    ]
  );
}

/** 生成规范的文件名 */
function generateFilename(templateId: string, reportId: string, format: OutputFormat): string {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
  const shortId = reportId.slice(0, 8);
  return `${templateId}_${timestamp}_${shortId}.${FORMAT_EXTENSIONS[format]}`;
}

/** 获取报告文件存储路径 */
function getFilePath(reportId: string, format: OutputFormat): string {
  const ext = FORMAT_EXTENSIONS[format];
  return join(FILES_DIR, `${reportId}.${ext}`);
}

/** 保存报告文件到磁盘 */
function saveReportFile(reportId: string, format: OutputFormat, buffer: Buffer): void {
  ensureDir(FILES_DIR);
  const filePath = getFilePath(reportId, format);
  writeFileSync(filePath, buffer);
  console.log(`💾 报告文件已保存: ${filePath}`);
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

/** 任务管理器接口 */
export interface TaskManager {
  /** 初始化（加载数据库数据） */
  init: () => Promise<void>;
  create: (request: CreateTaskRequest) => Promise<Task>;
  get: (taskId: string) => Task | undefined;
  getByReportId: (reportId: string) => Task | undefined;
  getResponse: (taskId: string) => TaskResponse | undefined;
  getResult: (taskId: string) => { buffer: Buffer; filename: string; contentType: string } | undefined;
  getResultByReportId: (reportId: string) => { buffer: Buffer; filename: string; contentType: string } | undefined;
  getStatus: () => {
    total: number;
    queue: number;
    processing: number;
    maxConcurrent: number;
    pending: number;
    completed: number;
    failed: number;
  };
  list: (status?: TaskStatus) => TaskResponse[];
  deleteFile: (reportId: string) => Promise<{ success: boolean; error?: string }>;
  deleteTask: (taskId: string) => Promise<{ success: boolean; error?: string }>;
  shutdown: () => Promise<void>;
}

const defaultConfig: TaskManagerConfig = {
  taskRetentionMs: 60 * 60 * 1000,
  cleanupIntervalMs: 5 * 60 * 1000,
  maxConcurrent: 10,
};

/** 规范化错误 */
function normalizeError(err: unknown): TaskError {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    return err as TaskError;
  }
  return { code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
}

/** 创建任务管理器 */
export function createTaskManager(config: Partial<TaskManagerConfig> = {}): TaskManager {
  const finalConfig = { ...defaultConfig, ...config };
  const tasks = new Map<string, Task>();
  const queue: string[] = [];
  let processingCount = 0;
  let cleanupTimer: ReturnType<typeof setInterval> | undefined;
  let initialized = false;

  /** 清理过期任务 */
  async function cleanup(): Promise<void> {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, task] of tasks) {
      const taskAge = now - task.createdAt.getTime();
      if (taskAge > finalConfig.taskRetentionMs && (task.status === 'completed' || task.status === 'failed')) {
        await deleteTaskFromDb(id);
        tasks.delete(id);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`🧹 清理了 ${cleaned} 个过期任务`);
    }
  }

  /** 启动定期清理 */
  function startCleanup(): void {
    cleanupTimer = setInterval(() => cleanup().catch(console.error), finalConfig.cleanupIntervalMs);
  }

  /** 处理单个任务 */
  async function processTask(task: Task): Promise<void> {
    task.status = 'processing';
    task.startedAt = new Date();
    await writeTaskLog(task, 'started');
    await saveTask(task);
    console.log(`⚙️ 开始处理任务: ${task.id}`);

    try {
      const validation = templateManager.validate(task.templateId, task.data);
      if (!validation.success) {
        throw { code: 'VALIDATION_ERROR', message: '数据验证失败', details: validation.error };
      }
      const result = await reportGenerator.generate(task.templateId, validation.data, task.format);
      // 保存文件到磁盘并记录路径
      const filePath = getFilePath(task.reportId, task.format);
      saveReportFile(task.reportId, task.format, result.buffer);
      task.filePath = filePath;
      task.contentType = result.contentType;
      task.status = 'completed';
      task.completedAt = new Date();
      await writeTaskLog(task, 'completed');
      await saveTask(task);
      console.log(`✅ 任务完成: ${task.id} (${task.completedAt.getTime() - task.startedAt!.getTime()}ms)`);
    } catch (err) {
      task.status = 'failed';
      task.completedAt = new Date();
      task.error = normalizeError(err);
      await writeTaskLog(task, 'failed');
      await saveTask(task);
      console.error(`❌ 任务失败: ${task.id}`, task.error);
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

  /** 检查报告文件是否存在 */
  function isFileReady(task: Task): boolean {
    const filePath = task.filePath || getFilePath(task.reportId, task.format);
    return existsSync(filePath);
  }

  /** 获取任务响应 (不含 result 数据) */
  function getResponse(taskId: string): TaskResponse | undefined {
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

  return {
    /** 初始化任务管理器 */
    async init(): Promise<void> {
      if (initialized) return;

      const loadedTasks = await loadTasks();
      for (const [id, task] of loadedTasks) {
        tasks.set(id, task);
      }

      startCleanup();
      initialized = true;
      console.log('✅ 任务管理器已初始化');
    },
    /** 创建任务 */
    async create(request: CreateTaskRequest): Promise<Task> {
      const template = templateManager.get(request.templateId);
      if (!template) {
        throw new Error(`模板 "${request.templateId}" 不存在`);
      }
      if (request.format === 'pdf' && !template.pdfGenerator) {
        throw new Error(`模板 "${request.templateId}" 不支持 PDF 格式`);
      }
      if (request.format === 'word' && !template.wordGenerator) {
        throw new Error(`模板 "${request.templateId}" 不支持 Word 格式`);
      }

      const taskId = randomUUID();
      const reportId = randomUUID();
      const task: Task = {
        id: taskId,
        reportId,
        templateId: request.templateId,
        format: request.format,
        status: 'pending',
        filename: generateFilename(request.templateId, reportId, request.format),
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
    },

    /** 获取任务 */
    get(taskId: string): Task | undefined {
      return tasks.get(taskId);
    },

    /** 通过报告ID获取任务 */
    getByReportId(reportId: string): Task | undefined {
      for (const task of tasks.values()) {
        if (task.reportId === reportId) return task;
      }
      return undefined;
    },

    getResponse,

    /** 获取任务结果 (Buffer) - 从文件读取 */
    getResult(taskId: string): { buffer: Buffer; filename: string; contentType: string } | undefined {
      const task = tasks.get(taskId);
      if (!task || task.status !== 'completed') return undefined;
      // 优先使用持久化的 filePath，兼容旧数据动态计算
      const filePath = task.filePath || getFilePath(task.reportId, task.format);
      if (!existsSync(filePath)) return undefined;
      // 根据格式计算 contentType（兼容重启后 contentType 为空的情况）
      const contentType = task.contentType || getContentType(task.format);
      return {
        buffer: readFileSync(filePath),
        filename: task.filename,
        contentType,
      };
    },

    /** 通过报告ID获取任务结果 - 从文件读取 */
    getResultByReportId(reportId: string): { buffer: Buffer; filename: string; contentType: string } | undefined {
      const task = this.getByReportId(reportId);
      if (!task || task.status !== 'completed') return undefined;
      // 优先使用持久化的 filePath，兼容旧数据动态计算
      const filePath = task.filePath || getFilePath(task.reportId, task.format);
      if (!existsSync(filePath)) return undefined;
      // 根据格式计算 contentType（兼容重启后 contentType 为空的情况）
      const contentType = task.contentType || getContentType(task.format);
      return {
        buffer: readFileSync(filePath),
        filename: task.filename,
        contentType,
      };
    },

    /** 获取队列状态 */
    getStatus() {
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
    },

    /** 列出所有任务 */
    list(status?: TaskStatus): TaskResponse[] {
      const result: TaskResponse[] = [];
      for (const task of tasks.values()) {
        if (!status || task.status === status) {
          result.push(getResponse(task.id)!);
        }
      }
      return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },

    /** 删除文件（通过报告ID） */
    async deleteFile(reportId: string): Promise<{ success: boolean; error?: string }> {
      const task = this.getByReportId(reportId);
      if (!task) {
        return { success: false, error: '文件不存在' };
      }

      if (task.status === 'processing') {
        return { success: false, error: '任务正在处理中，无法删除' };
      }

      const filePath = task.filePath || getFilePath(task.reportId, task.format);
      if (!existsSync(filePath)) {
        return { success: false, error: '文件不存在' };
      }

      unlinkSync(filePath);
      task.filePath = undefined;
      await saveTask(task);
      console.log(`🗑️ 已删除文件: ${filePath}`);

      return { success: true };
    },

    /** 删除任务记录（通过任务ID） */
    async deleteTask(taskId: string): Promise<{ success: boolean; error?: string }> {
      const task = tasks.get(taskId);
      if (!task) {
        return { success: false, error: '任务不存在' };
      }

      if (task.status === 'processing') {
        return { success: false, error: '任务正在处理中，无法删除' };
      }

      await deleteTaskFromDb(taskId);
      tasks.delete(taskId);
      console.log(`🗑️ 已删除任务: ${taskId}`);

      return { success: true };
    },

    /** 关闭任务管理器 */
    async shutdown(): Promise<void> {
      if (cleanupTimer) {
        clearInterval(cleanupTimer);
      }
      await database.close();
      console.log('🛑 任务管理器已关闭');
    },
  };
}

/** 全局任务管理器实例 */
export const taskManager = createTaskManager();
