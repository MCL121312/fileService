import { randomUUID } from 'crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Task, TaskStatus, TaskResponse, CreateTaskRequest, TaskError, OutputFormat } from '../types/task.ts';
import { reportGenerator } from './reportGenerator.ts';
import { templateManager } from './templateManager.ts';

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
const TASKS_FILE = join(DATA_DIR, 'tasks.json');
const FILES_DIR = join(DATA_DIR, 'files');

/** 日志目录 */
const LOG_DIR = 'logs';
const LOG_FILE = join(LOG_DIR, 'tasks.log');

/** 确保目录存在 */
function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/** 持久化任务的数据结构 (不含 result 大数据) */
interface PersistedTask {
  id: string;
  reportId: string;
  templateId: string;
  format: OutputFormat;
  status: TaskStatus;
  filename: string;
  /** 文件路径 (完成后才有) */
  filePath?: string | undefined;
  createdAt: string;
  startedAt?: string | undefined;
  completedAt?: string | undefined;
  error?: TaskError | undefined;
}

/** 从文件加载任务 */
function loadTasks(): Map<string, Task> {
  const tasks = new Map<string, Task>();

  if (!existsSync(TASKS_FILE)) {
    return tasks;
  }

  try {
    const data = readFileSync(TASKS_FILE, 'utf-8');
    const persisted: PersistedTask[] = JSON.parse(data);

    for (const p of persisted) {
      // 处理中的任务重启后标记为失败
      let status = p.status;
      let completedAt = p.completedAt ? new Date(p.completedAt) : undefined;
      let error = p.error;

      if (status === 'pending' || status === 'processing') {
        status = 'failed';
        completedAt = new Date();
        error = { code: 'SERVER_RESTART', message: '服务重启，任务中断' };
      }

      const task: Task = {
        id: p.id,
        reportId: p.reportId || p.id, // 兼容旧数据
        templateId: p.templateId,
        format: p.format,
        status,
        filename: p.filename,
        filePath: p.filePath,
        createdAt: new Date(p.createdAt),
        data: {}, // 原始数据不持久化
      };

      if (p.startedAt) task.startedAt = new Date(p.startedAt);
      if (completedAt) task.completedAt = completedAt;
      if (error) task.error = error;

      tasks.set(task.id, task);
    }

    console.log(`📂 从文件加载了 ${tasks.size} 个任务`);
  } catch (err) {
    console.error('⚠️ 加载任务文件失败:', err);
  }

  return tasks;
}

/** 保存任务到文件 */
function saveTasks(tasks: Map<string, Task>): void {
  ensureDir(DATA_DIR);

  const persisted: PersistedTask[] = [];
  for (const task of tasks.values()) {
    persisted.push({
      id: task.id,
      reportId: task.reportId,
      templateId: task.templateId,
      format: task.format,
      status: task.status,
      filename: task.filename,
      filePath: task.filePath,
      createdAt: task.createdAt.toISOString(),
      startedAt: task.startedAt?.toISOString(),
      completedAt: task.completedAt?.toISOString(),
      error: task.error,
    });
  }

  writeFileSync(TASKS_FILE, JSON.stringify(persisted, null, 2));
}

/** 写入任务日志 */
function writeTaskLog(task: Task, event: 'created' | 'started' | 'completed' | 'failed'): void {
  ensureDir(LOG_DIR);
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
  create: (request: CreateTaskRequest) => Task;
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
  deleteFile: (reportId: string) => { success: boolean; error?: string };
  deleteTask: (taskId: string) => { success: boolean; error?: string };
  shutdown: () => void;
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
  const tasks = loadTasks(); // 从文件加载已有任务
  const queue: string[] = [];
  let processingCount = 0;
  let cleanupTimer: ReturnType<typeof setInterval> | undefined;

  /** 持久化当前任务 */
  function persist(): void {
    saveTasks(tasks);
  }

  /** 清理过期任务 */
  function cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, task] of tasks) {
      const taskAge = now - task.createdAt.getTime();
      if (taskAge > finalConfig.taskRetentionMs && (task.status === 'completed' || task.status === 'failed')) {
        tasks.delete(id);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`🧹 清理了 ${cleaned} 个过期任务`);
      persist(); // 清理后持久化
    }
  }

  /** 启动定期清理 */
  function startCleanup(): void {
    cleanupTimer = setInterval(cleanup, finalConfig.cleanupIntervalMs);
  }

  /** 处理单个任务 */
  async function processTask(task: Task): Promise<void> {
    task.status = 'processing';
    task.startedAt = new Date();
    writeTaskLog(task, 'started');
    persist(); // 状态变化时持久化
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
      writeTaskLog(task, 'completed');
      persist(); // 状态变化时持久化
      console.log(`✅ 任务完成: ${task.id} (${task.completedAt.getTime() - task.startedAt!.getTime()}ms)`);
    } catch (err) {
      task.status = 'failed';
      task.completedAt = new Date();
      task.error = normalizeError(err);
      writeTaskLog(task, 'failed');
      persist(); // 状态变化时持久化
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
    // 优先使用持久化的 filePath，兼容旧数据动态计算
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

  // 启动清理定时器
  startCleanup();

  return {
    /** 创建任务 */
    create(request: CreateTaskRequest): Task {
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
      const reportId = randomUUID(); // 独立的报告 ID，以后可改为业务格式
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
      writeTaskLog(task, 'created');
      persist(); // 创建时持久化
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
    deleteFile(reportId: string): { success: boolean; error?: string } {
      const task = this.getByReportId(reportId);
      if (!task) {
        return { success: false, error: '文件不存在' };
      }

      // 如果任务正在处理中，不允许删除
      if (task.status === 'processing') {
        return { success: false, error: '任务正在处理中，无法删除' };
      }

      const filePath = task.filePath || getFilePath(task.reportId, task.format);
      if (!existsSync(filePath)) {
        return { success: false, error: '文件不存在' };
      }

      unlinkSync(filePath);
      task.filePath = undefined;
      persist();
      console.log(`🗑️ 已删除文件: ${filePath}`);

      return { success: true };
    },

    /** 删除任务记录（通过任务ID） */
    deleteTask(taskId: string): { success: boolean; error?: string } {
      const task = tasks.get(taskId);
      if (!task) {
        return { success: false, error: '任务不存在' };
      }

      // 如果任务正在处理中，不允许删除
      if (task.status === 'processing') {
        return { success: false, error: '任务正在处理中，无法删除' };
      }

      tasks.delete(taskId);
      persist();
      console.log(`🗑️ 已删除任务: ${taskId}`);

      return { success: true };
    },

    /** 关闭任务管理器 */
    shutdown(): void {
      if (cleanupTimer) {
        clearInterval(cleanupTimer);
      }
      console.log('🛑 任务管理器已关闭');
    },
  };
}

/** 全局任务管理器实例 */
export const taskManager = createTaskManager();
