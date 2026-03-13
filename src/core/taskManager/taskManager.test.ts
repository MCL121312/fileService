import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, onTestFinished } from 'vitest';
import { fileURLToPath } from 'node:url';
import { hasTemplate, loadTemplates } from '../templateLoader.ts';
import { saveTaskFile } from './filePersistence.ts';
import { createTaskManager } from './taskManager.ts';

const templatesDir = fileURLToPath(new URL('../../templates', import.meta.url));

if (!hasTemplate('test')) {
  await loadTemplates(templatesDir);
}

async function withIsolatedManager(
  run: (manager: ReturnType<typeof createTaskManager>) => Promise<void>,
): Promise<void> {
  const previousCwd = process.cwd();
  const tempDir = mkdtempSync(join(tmpdir(), 'task-manager-test-'));
  const manager = createTaskManager({
    maxConcurrent: 0,
    cleanupIntervalMs: 60_000,
    taskRetentionMs: 60_000,
  });

  process.chdir(tempDir);

  onTestFinished(async () => {
    await manager.shutdown();
    process.chdir(previousCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  await manager.init();
  await run(manager);
}

describe.sequential('taskManager', () => {
  it('最小行为：创建查询、状态统计、结果就绪可见、processing 删除守卫', async () => {
    await withIsolatedManager(async manager => {
      const pendingTask = await manager.createTask({
        templateId: 'test',
        format: 'pdf',
        data: { hospitalName: '某市第一人民医院' },
      });

      assert.equal(pendingTask.status, 'pending');
      assert.equal(manager.getTask(pendingTask.id), pendingTask);
      assert.equal(manager.getByReportId(pendingTask.reportId), pendingTask);
      assert.equal(manager.getTask('missing-task-id'), null);
      assert.equal(manager.getByReportId('missing-report-id'), null);

      const allTasks = manager.listAllTask();
      const pendingTasks = manager.listAllTask('pending');

      assert.equal(allTasks.length, 1);
      assert.equal(pendingTasks.length, 1);
      assert.equal(allTasks[0].id, pendingTask.id);
      assert.equal(allTasks[0].status, 'pending');
      assert.equal(allTasks[0].resultReady, false);
      assert.equal(typeof allTasks[0].createdAt, 'string');

      assert.deepEqual(manager.getStatus(), {
        total: 1,
        queue: 1,
        processing: 0,
        maxConcurrent: 0,
        pending: 1,
        completed: 0,
        failed: 0,
      });

      const completedTask = await manager.createTask({
        templateId: 'test',
        format: 'pdf',
        data: { hospitalName: '某市第一人民医院' },
      });

      const filePath = saveTaskFile(completedTask.reportId, Buffer.from('mock pdf content'));
      completedTask.status = 'completed';
      completedTask.filePath = filePath;
      completedTask.contentType = 'application/pdf';
      completedTask.startedAt = new Date(Date.now() - 1000);
      completedTask.completedAt = new Date();

      const completedTasks = manager.listAllTask('completed');
      assert.equal(completedTasks.length, 1);
      assert.equal(completedTasks[0].id, completedTask.id);
      assert.equal(completedTasks[0].resultReady, true);

      const processingTask = await manager.createTask({
        templateId: 'test',
        format: 'pdf',
        data: { hospitalName: '某市第一人民医院' },
      });

      processingTask.status = 'processing';
      processingTask.startedAt = new Date();

      assert.deepEqual(await manager.deleteTask(processingTask.id), {
        success: false,
        error: '任务正在处理中，无法删除',
      });
      assert.equal(manager.getTask(processingTask.id), processingTask);
    });
  });
});
