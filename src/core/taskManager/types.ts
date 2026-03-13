/** 数据库任务记录结构 */
export interface PersistedTask {
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
/** 任务信息 */
export interface Task {
  /** 任务 ID */
  id: string;
  /** 报告 ID (业务层面，可以是日期+病人号等格式) */
  reportId: string;
  /** 模板 ID */
  templateId: string;
  /** 输出格式 */
  format: OutputFormat;
  /** 任务状态 */
  status: TaskStatus;
  /** 输出文件名 */
  filename: string;
  /** 文件存储路径 (完成后才有) */
  filePath?: string | undefined;
  /** 创建时间 */
  createdAt: Date;
  /** 开始处理时间 */
  startedAt?: Date;
  /** 完成时间 */
  completedAt?: Date;
  /** 输入数据 */
  data: unknown;
  /** Content-Type */
  contentType?: string;
  /** 错误信息 */
  error?: TaskError;
}
/** 输出格式 */
export type OutputFormat = 'pdf';

/** 任务状态 */
export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

/** 任务管理器配置 */
export interface TaskManagerConfig {
  /** 任务保留时间 (ms)，默认 1 小时 */
  taskRetentionMs: number;
  /** 清理间隔 (ms)，默认 5 分钟 */
  cleanupIntervalMs: number;
  /** 最大并发任务数 */
  maxConcurrent: number;
}

/** 任务错误 */
export interface TaskError {
  code: string;
  message: string;
  details?: unknown;
}

/** 创建任务请求 */
export interface CreateTaskRequest {
  templateId: string;
  format: OutputFormat;
  data: unknown;
}

/** 任务响应 (不含结果数据) */
export interface TaskResponse {
  id: string;
  reportId: string;
  templateId: string;
  format: OutputFormat;
  status: TaskStatus;
  filename: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: TaskError;
  /** 结果是否可用 */
  resultReady: boolean;
}
