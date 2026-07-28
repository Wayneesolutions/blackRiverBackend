import * as XLSX from 'xlsx';

/**
 * Parse a CSV or Excel file buffer into an array of row objects.
 * Keys are normalized: trimmed, lowercased, spaces→underscore.
 * Returns { rows: [{ col: value, ... }], headers: [string] }
 */
export function parseImportFile(buffer, originalname) {
  const ext = (originalname || '').split('.').pop().toLowerCase();
  let workbook;

  if (ext === 'csv') {
    const text = buffer.toString('utf8');
    workbook = XLSX.read(text, { type: 'string' });
  } else {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (!rawRows.length) return { rows: [], headers: [] };

  // Normalize headers
  const headers = Object.keys(rawRows[0]).map(normalizeKey);

  const rows = rawRows.map(raw => {
    const normalized = {};
    for (const [k, v] of Object.entries(raw)) {
      normalized[normalizeKey(k)] = typeof v === 'string' ? v.trim() : v;
    }
    return normalized;
  });

  return { rows, headers };
}

function normalizeKey(k) {
  return String(k).trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

/**
 * Build a downloadable error-report workbook buffer (xlsx).
 * errors: [{ row: number, data: object, reason: string }]
 */
export function buildErrorReport(errors, entityName = 'import') {
  if (!errors.length) return null;

  const rows = errors.map(e => ({
    Row: e.row,
    Reason: e.reason,
    ...e.data
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${entityName}_errors`);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
