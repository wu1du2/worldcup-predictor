import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildImportReportRow,
  formatReportStatusText,
  writeImportReport,
} from '../src/importReports.mjs';

test('buildImportReportRow normalizes success and failed report fields', () => {
  const row = buildImportReportRow({
    jobName: 'odds',
    status: 'success',
    startedAt: '2026-06-13T00:00:00.000Z',
    finishedAt: '2026-06-13T00:01:00.000Z',
    rowsWritten: 616,
    itemsSeen: 22,
    message: 'ok',
    runUrl: 'https://github.com/run/1',
  });

  assert.deepEqual(row, {
    job_name: 'odds',
    status: 'success',
    started_at: '2026-06-13T00:00:00.000Z',
    finished_at: '2026-06-13T00:01:00.000Z',
    rows_written: 616,
    items_seen: 22,
    message: 'ok',
    error_detail: '',
    run_url: 'https://github.com/run/1',
  });
});

test('buildImportReportRow rejects invalid report payloads', () => {
  assert.throws(() => buildImportReportRow({
    jobName: 'odds',
    status: 'unknown',
    startedAt: '2026-06-13T00:00:00.000Z',
  }), /invalid status/);

  assert.throws(() => buildImportReportRow({
    jobName: '',
    status: 'failed',
    startedAt: '2026-06-13T00:00:00.000Z',
  }), /missing jobName/);
});

test('writeImportReport swallows report insert failures and returns false', async () => {
  const calls = [];
  const client = {
    from(table) {
      calls.push(['from', table]);
      return {
        insert(row) {
          calls.push(['insert', row]);
          return Promise.resolve({ error: new Error('report table missing') });
        },
      };
    },
  };

  const wrote = await writeImportReport({
    client,
    report: {
      jobName: 'matches',
      status: 'failed',
      startedAt: '2026-06-13T00:00:00.000Z',
      message: 'failed',
      errorDetail: 'boom',
    },
  });

  assert.equal(wrote, false);
  assert.equal(calls[0][1], 'import_reports');
});

test('formatReportStatusText renders compact report status labels', () => {
  assert.equal(formatReportStatusText({ status: 'success' }), '成功');
  assert.equal(formatReportStatusText({ status: 'failed' }), '失败');
  assert.equal(formatReportStatusText({ status: 'other' }), '未知');
});
