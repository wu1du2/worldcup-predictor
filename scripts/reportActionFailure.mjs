import { buildImportReportRow, getGithubRunUrl } from '../src/importReports.mjs';

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...valueParts] = arg.replace(/^--/, '').split('=');
  return [key, valueParts.join('=') || ''];
}));

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.warn('Skipping action failure report: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(0);
}

const jobName = args.get('job');
const message = args.get('message') || 'Workflow failed before import completed.';

try {
  const row = buildImportReportRow({
    jobName,
    status: 'failed',
    startedAt: new Date().toISOString(),
    rowsWritten: 0,
    itemsSeen: 0,
    message,
    errorDetail: message,
    runUrl: getGithubRunUrl(),
  });

  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/import_reports`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
      prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });

  if (!response.ok) {
    console.warn(`Action failure report write failed: ${response.status} ${await response.text()}`);
  }
} catch (error) {
  console.warn(`Action failure report write failed: ${error.message || error}`);
}
