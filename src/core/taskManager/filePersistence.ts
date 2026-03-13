import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { OutputFormat, Task } from './types.ts';

const DATA_DIR = 'data';
const FILES_DIR = join(DATA_DIR, 'files');

const FORMAT_CONTENT_TYPES: Record<OutputFormat, string> = {
  pdf: 'application/pdf',
};

export interface TaskFileResult {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

type TaskFileRef = Pick<Task, 'reportId' | 'filePath'>;
type TaskFileReader = Pick<Task, 'reportId' | 'filePath' | 'filename' | 'format' | 'contentType'>;

export function isTaskFileReady(task: TaskFileRef): boolean {
  return existsSync(resolveTaskFilePath(task));
}

export function saveTaskFile(reportId: string, buffer: Buffer): string {
  ensureDir(FILES_DIR);
  const filePath = join(FILES_DIR, `${reportId}.pdf`);
  writeFileSync(filePath, buffer);
  console.log(`💾 报告文件已保存: ${filePath}`);
  return filePath;
}

export function readTaskFile(task: TaskFileReader): TaskFileResult | undefined {
  const filePath = resolveTaskFilePath(task);
  if (!existsSync(filePath)) return undefined;

  return {
    buffer: readFileSync(filePath),
    filename: task.filename,
    contentType: task.contentType || getContentType(task.format),
  };
}

export function deleteTaskFile(task: TaskFileRef): string | undefined {
  const filePath = resolveTaskFilePath(task);
  if (!existsSync(filePath)) return undefined;

  unlinkSync(filePath);
  return filePath;
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function getContentType(format: OutputFormat): string {
  return FORMAT_CONTENT_TYPES[format];
}

function resolveTaskFilePath(task: TaskFileRef): string {
  return task.filePath || join(FILES_DIR, `${task.reportId}.pdf`);
}
