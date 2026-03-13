import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { describe, it, onTestFinished } from 'vitest';
import { deleteTaskFile, isTaskFileReady, readTaskFile, saveTaskFile } from './filePersistence.ts';

describe('filePersistence', () => {
  it('save/read/delete 使用 reportId 回退路径工作正常', () => {
    const reportId = `file-persistence-${randomUUID()}`;
    const filename = 'report.pdf';
    const content = 'hello file persistence';

    onTestFinished(() => {
      deleteTaskFile({ reportId });
    });

    assert.equal(isTaskFileReady({ reportId }), false);

    const filePath = saveTaskFile(reportId, Buffer.from(content));

    assert.equal(filePath, join('data', 'files', `${reportId}.pdf`));
    assert.equal(isTaskFileReady({ reportId }), true);

    const result = readTaskFile({ reportId, filename, format: 'pdf' });

    assert.ok(result);
    assert.equal(result.filename, filename);
    assert.equal(result.contentType, 'application/pdf');
    assert.equal(result.buffer.toString('utf8'), content);

    const deletedFilePath = deleteTaskFile({ reportId });

    assert.equal(deletedFilePath, filePath);
    assert.equal(isTaskFileReady({ reportId }), false);
    assert.equal(readTaskFile({ reportId, filename, format: 'pdf' }), undefined);
  });

  it('readTaskFile 优先返回任务上已持久化的 contentType', () => {
    const reportId = `file-persistence-${randomUUID()}`;
    const customContentType = 'application/custom-pdf';

    onTestFinished(() => {
      deleteTaskFile({ reportId });
    });

    saveTaskFile(reportId, Buffer.from('content-type override'));

    const result = readTaskFile({
      reportId,
      filename: 'custom.pdf',
      format: 'pdf',
      contentType: customContentType,
    });

    assert.ok(result);
    assert.equal(result.contentType, customContentType);
  });

  it('readTaskFile/deleteTaskFile 可优先使用显式 filePath', () => {
    const savedReportId = `saved-${randomUUID()}`;
    const mismatchedReportId = `mismatch-${randomUUID()}`;
    const filePath = saveTaskFile(savedReportId, Buffer.from('read by filePath'));

    onTestFinished(() => {
      deleteTaskFile({ reportId: savedReportId, filePath });
    });

    const result = readTaskFile({
      reportId: mismatchedReportId,
      filePath,
      filename: 'by-path.pdf',
      format: 'pdf',
    });

    assert.ok(result);
    assert.equal(result.buffer.toString('utf8'), 'read by filePath');

    const deletedFilePath = deleteTaskFile({ reportId: mismatchedReportId, filePath });

    assert.equal(deletedFilePath, filePath);
    assert.equal(
      readTaskFile({
        reportId: mismatchedReportId,
        filePath,
        filename: 'by-path.pdf',
        format: 'pdf',
      }),
      undefined,
    );
  });
});
