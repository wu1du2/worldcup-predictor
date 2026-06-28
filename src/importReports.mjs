export function buildImportReportRow(report) {
  const {
    jobName,
    status,
    startedAt,
    finishedAt = new Date().toISOString(),
    rowsWritten = 0,
    itemsSeen = 0,
    message = '',
    errorDetail = '',
    runUrl = '',
  } = report;

  if (!jobName) throw new Error('Import report missing jobName.');
  if (!['success', 'failed'].includes(status)) throw new Error(`Import report invalid status ${status}.`);
  if (!startedAt) throw new Error('Import report missing startedAt.');

  return {
    job_name: jobName,
    status,
    started_at: startedAt,
    finished_at: finishedAt,
    rows_written: rowsWritten,
    items_seen: itemsSeen,
    message,
    error_detail: errorDetail,
    run_url: runUrl,
  };
}

export async function writeImportReport({ client, report }) {
  try {
    const { error } = await client
      .from('import_reports')
      .insert(buildImportReportRow(report));

    if (error) {
      console.warn(`Import report write failed: ${error.message || error}`);
      return false;
    }

    return true;
  } catch (error) {
    console.warn(`Import report write failed: ${error.message || error}`);
    return false;
  }
}

export function formatReportStatusText(report) {
  if (report.status === 'success') return '成功';
  if (report.status === 'failed') return '失败';
  return '未知';
}

export function formatReportJobTitle(report) {
  if (report.jobName === 'odds') return '赔率更新';
  if (report.jobName === 'matches') return '比分更新';
  if (report.jobName === 'strategy_loop') return '策略迭代';
  return '后台任务';
}

export function getGithubRunUrl(env = process.env) {
  if (!env.GITHUB_SERVER_URL || !env.GITHUB_REPOSITORY || !env.GITHUB_RUN_ID) return '';
  return `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
}
