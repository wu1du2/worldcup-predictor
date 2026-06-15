export function buildOddsImportSnapshotRow({
  source,
  sourceDate,
  sourceUrl,
  rawHtml,
  matches,
  rows,
  createdAt = new Date().toISOString(),
}) {
  if (!source) throw new Error('Snapshot source is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate || '')) {
    throw new Error('Snapshot sourceDate must be YYYY-MM-DD.');
  }
  if (!sourceUrl) throw new Error('Snapshot sourceUrl is required.');
  if (typeof rawHtml !== 'string' || rawHtml.length === 0) {
    throw new Error('Snapshot rawHtml is required.');
  }
  if (!Array.isArray(matches)) throw new Error('Snapshot matches must be an array.');
  if (!Array.isArray(rows)) throw new Error('Snapshot rows must be an array.');

  return {
    source,
    source_date: sourceDate,
    source_url: sourceUrl,
    raw_html: rawHtml,
    parsed_json: { matches, rows },
    matches_count: matches.length,
    rows_count: rows.length,
    created_at: createdAt,
  };
}

export async function writeOddsImportSnapshot({ client, row, warn = console.warn }) {
  try {
    const { error } = await client.from('odds_import_snapshots').insert(row);
    if (error) throw error;
    return true;
  } catch (error) {
    warn(`Odds import snapshot was not saved: ${error.message || String(error)}`);
    return false;
  }
}
