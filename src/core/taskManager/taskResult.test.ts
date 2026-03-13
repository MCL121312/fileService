import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, onTestFinished } from 'vitest';
import { fileURLToPath } from 'node:url';
import { hasTemplate, loadTemplates } from '../templateLoader.ts';
import { saveTaskFile } from './filePersistence.ts';
import { createTaskManager } from './taskManager.ts';
import { createTaskResult } from './taskResult.ts';

const templatesDir = fileURLToPath(new URL('../../templates', import.meta.url));

if (!hasTemplate('test')) {
  await loadTemplates(templatesDir);
}

async function withIsolatedServices(
  run: (services: {
    manager: ReturnType<typeof createTaskManager>;
    resultService: ReturnType<typeof createTaskResult>;
  }) => Promise<void>,
): Promise<void> {
  const previousCwd = process.cwd();
  const tempDir = mkdtempSync(join(tmpdir(), 'task-result-service-test-'));
  const manager = createTaskManager({
    maxConcurrent: 0,
    cleanupIntervalMs: 60_000,
    taskRetentionMs: 60_000,
  });
  const resultService = createTaskResult(manager);

  process.chdir(tempDir);

  onTestFinished(async () => {
    await manager.shutdown();
    process.chdir(previousCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  await manager.init();
  await run({ manager, resultService });
}

describe.sequential('taskResultService', () => {
  it('最小行为：读取结果、删除文件、processing 删除守卫', async () => {
    await withIsolatedServices(async ({ manager, resultService }) => {
      const pendingTask = await manager.createTask({
        templateId: 'test',
        format: 'pdf',
        data: { hospitalName: '某市第一人民医院' },
      });

      assert.equal(resultService.getResult(pendingTask.id), null);
      assert.equal(resultService.getResultByReportId(pendingTask.reportId), null);

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

      assert.equal(
        resultService.getResult(completedTask.id)?.buffer.toString('utf8'),
        'mock pdf content',
      );
      assert.equal(
        resultService.getResultByReportId(completedTask.reportId)?.buffer.toString('utf8'),
        'mock pdf content',
      );

      const deletedFile = await resultService.deleteFile(completedTask.reportId);

      assert.deepEqual(deletedFile, { success: true });
      assert.equal(completedTask.filePath, undefined);
      assert.equal(resultService.getResult(completedTask.id), null);
      assert.equal(resultService.getResultByReportId(completedTask.reportId), null);
      assert.equal(manager.listAllTask('completed')[0].resultReady, false);

      const processingTask = await manager.createTask({
        templateId: 'test',
        format: 'pdf',
        data: { hospitalName: '某市第一人民医院' },
      });

      processingTask.status = 'processing';
      processingTask.startedAt = new Date();

      assert.deepEqual(await resultService.deleteFile(processingTask.reportId), {
        success: false,
        error: '任务正在处理中，无法删除',
      });
    });
  });
});
