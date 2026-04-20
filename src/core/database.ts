import BetterSQLite, { type Database } from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

/** 数据库文件路径 */
const DB_PATH = 'data/fileservice.db';

class DataBase {
  private db: Database | null = null;
  private initialized = false;

  /** 初始化数据库连接 */
  async init(): Promise<void> {
    if (this.initialized) return;

    // 确保目录存在
    const dir = dirname(DB_PATH);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    try {
      this.db = new BetterSQLite(DB_PATH);
      this.initialized = true;
      console.log('📦 SQLite 数据库已连接');
      await this.createTables();
    } catch (err) {
      throw err;
    }
  }

  /** 创建表结构 */
  private async createTables(): Promise<void> {
    // 任务表
    await this.run(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        report_id TEXT NOT NULL UNIQUE,
        template_id TEXT NOT NULL,
        format TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        filename TEXT NOT NULL,
        file_path TEXT,
        content_type TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        error_code TEXT,
        error_message TEXT
      )
    `);

    // 任务日志表
    await this.run(`
      CREATE TABLE IF NOT EXISTS task_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        event TEXT NOT NULL,
        template_id TEXT,
        format TEXT,
        filename TEXT,
        status TEXT,
        duration INTEGER,
        error_code TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      )
    `);

    // 创建索引
    await this.run('CREATE INDEX IF NOT EXISTS idx_tasks_report_id ON tasks(report_id)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_task_logs_task_id ON task_logs(task_id)');

    console.log('📋 数据库表结构已就绪');
  }

  /** 执行 SQL (INSERT/UPDATE/DELETE) */
  run(sql: string, params: unknown[] = []): Promise<{ lastInsertRowid: number | bigint; changes: number }> {
    try {
      const stmt = this.db!.prepare(sql);
      const result = stmt.run(...params);
      return Promise.resolve(result);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /** 查询单条记录 */
  get<T = unknown>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    try {
      const stmt = this.db!.prepare(sql);
      const row = stmt.get(...params) as T | undefined;
      return Promise.resolve(row);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /** 查询多条记录 */
  all<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    try {
      const stmt = this.db!.prepare(sql);
      const rows = stmt.all(...params) as T[];
      return Promise.resolve(rows);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /** 关闭数据库连接 */
  close(): Promise<void> {
    if (!this.db) {
      return Promise.resolve();
    }
    try {
      this.db.close();
      this.initialized = false;
      console.log('📦 SQLite 数据库已关闭');
      return Promise.resolve();
    } catch (err) {
      return Promise.reject(err);
    }
  }
}

/** 全局数据库实例 */
export const database = new DataBase();
