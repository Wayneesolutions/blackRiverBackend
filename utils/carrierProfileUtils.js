// Helpers that turn raw AI output from a carrier profile document into clean,
// consistent CVSA inspection rows. The AI is good at reading the table but
// inconsistent about formats, so everything here is deterministic clean-up.

const CANADA_CODES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];
const USA_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA',
  'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK',
  'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
];

const CANADA_NAMES = {
  alberta: 'AB', 'british columbia': 'BC', manitoba: 'MB', 'new brunswick': 'NB', newfoundland: 'NL',
  'newfoundland and labrador': 'NL', 'nova scotia': 'NS', 'northwest territories': 'NT', nunavut: 'NU',
  ontario: 'ON', 'prince edward island': 'PE', quebec: 'QC', 'québec': 'QC', saskatchewan: 'SK', yukon: 'YT'
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const clean = (v) => (v === undefined || v === null ? '' : String(v).trim());

/** Returns { code, country } for a province/state code or name, or null. */
export const resolveJurisdiction = (value) => {
  const raw = clean(value);
  if (!raw) return null;
  const upper = raw.toUpperCase().replace(/[^A-Z ]/g, '').trim();
  if (CANADA_CODES.includes(upper)) return { code: upper, country: 'canada' };
  if (USA_CODES.includes(upper)) return { code: upper, country: 'usa' };
  const lower = raw.toLowerCase();
  if (CANADA_NAMES[lower]) return { code: CANADA_NAMES[lower], country: 'canada' };
  return null;
};

/** Infers the country from a free-text location such as "Headingley, MB" or "Emerson Port". */
const countryFromLocation = (location) => {
  const text = clean(location);
  if (!text) return null;
  // Trailing 2-letter code: "Brandon, MB", "Fargo ND". Only the last token is
  // trusted, since words like "IN" or "OR" appear in ordinary location text.
  const tokens = text.toUpperCase().split(/[\s,/()-]+/).filter(Boolean);
  const last = tokens[tokens.length - 1];
  if (last && last.length === 2) {
    if (CANADA_CODES.includes(last)) return 'canada';
    if (USA_CODES.includes(last)) return 'usa';
  }
  const lower = text.toLowerCase();
  for (const name of Object.keys(CANADA_NAMES)) {
    if (lower.includes(name)) return 'canada';
  }
  if (/\b(canada|winnipeg|toronto|calgary|edmonton|regina|saskatoon|vancouver|montreal|ottawa|brandon|emerson|headingley|kenora|thunder bay)\b/.test(lower)) {
    return 'canada';
  }
  if (/\b(usa|u\.s\.a\.|united states)\b/.test(lower)) return 'usa';
  return null;
};

/** Parses the date formats seen on carrier profiles into "YYYY-MM-DD" (or null). */
export const parseDocumentDate = (value) => {
  const raw = clean(value);
  if (!raw) return null;

  const build = (y, m, d) => {
    if (y < 100) y += 2000;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCMonth() !== m - 1) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };

  // 2025-12-30 / 2025/12/30 (optionally followed by a time)
  let m = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return build(+m[1], +m[2], +m[3]);

  // 30/Dec/2025, 30-Dec-25, 30 Dec 2025
  m = raw.match(/^(\d{1,2})[\s\-/.]+([A-Za-z]{3,})[\s\-/.,]+(\d{2,4})/);
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) return build(+m[3], mi + 1, +m[1]);
  }

  // Dec 30, 2025 / December 30 2025
  m = raw.match(/^([A-Za-z]{3,})[\s.]+(\d{1,2})(?:st|nd|rd|th)?[\s,]+(\d{2,4})/);
  if (m) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mi >= 0) return build(+m[3], mi + 1, +m[2]);
  }

  // Numeric with slashes: Canadian documents print day first; only treat as
  // month-first when the first number cannot be a day/month split otherwise.
  m = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const y = +m[3];
    if (b > 12) return build(y, a, b); // 12/30/2025 → month first
    return build(y, b, a); // 30/12/2025 or 05/06/2025 → day first
  }

  return null;
};

/** Maps the "Result" column to our status values. */
export const normalizeStatus = (value) => {
  const v = clean(value).toLowerCase().replace(/[^a-z]/g, '');
  if (!v) return null;
  if (['pass', 'passed', 'p', 'nodefect', 'nodefects', 'clean', 'ok'].includes(v)) return 'pass';
  if (v.startsWith('oos') || v.includes('outofservice') || v === 'os') return 'out-of-service';
  if (['fail', 'failed', 'f', 'defect', 'defects', 'reqattn', 'requiresattention'].includes(v) || v.startsWith('fail')) return 'fail';
  if (['warning', 'warn', 'w', 'warned', 'conditional'].includes(v)) return 'warning';
  return null;
};

/** Maps "Level" (1, "III", "Level 3", "level-3") to "level-N". */
export const normalizeLevel = (value) => {
  const v = clean(value).toUpperCase().replace(/LEVEL|[-\s]/g, '');
  const roman = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };
  const n = roman[v] || parseInt(v, 10);
  return n >= 1 && n <= 6 ? `level-${n}` : 'level-1';
};

const normalizeSeverity = (value) => {
  const v = clean(value).toLowerCase();
  if (v.includes('crit') || v.includes('oos') || v.includes('out')) return 'critical';
  if (v.includes('maj') || v.includes('high')) return 'major';
  return 'minor';
};

/** Works out an inspection's country from all the hints a row carries. */
export const resolveInspectionCountry = (row) => {
  const jurisdiction =
    resolveJurisdiction(row.province) ||
    resolveJurisdiction(row.state) ||
    resolveJurisdiction(row.jurisdiction);
  if (jurisdiction) return { country: jurisdiction.country, jurisdiction: jurisdiction.code };

  const fromLocation = countryFromLocation(row.location);
  if (fromLocation) return { country: fromLocation, jurisdiction: null };

  // Report numbers often start with the jurisdiction: MBE25-..., ONEA..., AB29...
  const report = clean(row.reportNumber).toUpperCase();
  const prefix = report.slice(0, 2);
  if (CANADA_CODES.includes(prefix)) return { country: 'canada', jurisdiction: prefix };
  if (USA_CODES.includes(prefix) && /^[A-Z]{2}\d/.test(report)) return { country: 'usa', jurisdiction: prefix };

  // The AI's own country guess is the weakest hint, so it comes last
  const explicit = clean(row.country).toLowerCase();
  if (explicit === 'canada' || explicit === 'ca' || explicit === 'can') return { country: 'canada', jurisdiction: null };
  if (explicit === 'usa' || explicit === 'us' || explicit === 'united states') return { country: 'usa', jurisdiction: null };

  return { country: null, jurisdiction: null };
};

const summarize = (rows) => {
  const count = (fn) => rows.filter(fn).length;
  const total = rows.length;
  const pass = count((r) => r.status === 'pass');
  const oos = count((r) => r.status === 'out-of-service');
  return {
    totalInspections: total,
    totalPass: pass,
    totalFail: count((r) => r.status === 'fail'),
    totalWarning: count((r) => r.status === 'warning'),
    totalOutOfService: oos,
    canadaInspections: count((r) => r.country === 'canada'),
    usaInspections: count((r) => r.country === 'usa'),
    passRate: total ? Math.round((pass / total) * 100) : 0,
    oosRate: total ? Math.round((oos / total) * 100) : 0
  };
};

/**
 * Cleans one extraction result. Each row gets a country, a YYYY-MM-DD date and a
 * known status; rows that are not inspections (blank lines, repeated headers) are
 * dropped; the summary is recomputed from the rows so the numbers always add up.
 * What the document itself printed is kept separately in `documentTotals`.
 */
export const normalizeCarrierProfileExtraction = (raw) => {
  const data = raw && typeof raw === 'object' ? raw : {};
  const rawRows = Array.isArray(data.inspections) ? data.inspections : [];
  const seen = new Set();
  const inspections = [];

  for (const row of rawRows) {
    if (!row || typeof row !== 'object') continue;
    const reportNumber = clean(row.reportNumber) || null;
    const date = parseDocumentDate(row.date) || (row.year && row.month ? parseDocumentDate(`1 ${row.month} ${row.year}`) : null);
    const status = normalizeStatus(row.status ?? row.result);
    if (!reportNumber && !date) continue; // not an inspection row
    if (reportNumber && /^report/i.test(reportNumber)) continue; // repeated table header

    const dedupeKey = reportNumber ? `r:${reportNumber.toUpperCase()}` : `d:${date}|${clean(row.location).toLowerCase()}|${clean(row.vehicleUnitNo).toUpperCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const { country, jurisdiction } = resolveInspectionCountry(row);
    inspections.push({
      reportNumber,
      date,
      country,
      jurisdiction: jurisdiction || clean(row.province || row.state).toUpperCase() || null,
      location: clean(row.location) || null,
      status,
      inspectionType: normalizeLevel(row.inspectionType ?? row.level),
      vehicleUnitNo: clean(row.vehicleUnitNo) || null,
      driverName: clean(row.driverName) || null,
      driverLicenseNumber: clean(row.driverLicenseNumber) || null,
      inspectorName: clean(row.inspectorName) || null,
      violations: Array.isArray(row.violations)
        ? row.violations
            .filter((v) => v && (clean(v.code) || clean(v.description)))
            .map((v) => ({
              code: clean(v.code) || 'N/A',
              description: clean(v.description) || 'No description',
              severity: normalizeSeverity(v.severity)
            }))
        : [],
      notes: clean(row.notes) || null
    });
  }

  inspections.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const docSummary = data.summary && typeof data.summary === 'object' ? data.summary : {};
  const toNum = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
  const dates = inspections.map((r) => r.date).filter(Boolean);

  return {
    carrier: {
      name: clean(data.carrier?.name) || null,
      nscNumber: clean(data.carrier?.nscNumber) || null,
      usdotNumber: clean(data.carrier?.usdotNumber) || null,
      safetyRating: normalizeSafetyRating(data.carrier?.safetyRating || docSummary.safetyRating)
    },
    period: {
      label: clean(docSummary.period) || null,
      start: parseDocumentDate(data.period?.start ?? docSummary.periodStart) || dates[0] || null,
      end: parseDocumentDate(data.period?.end ?? docSummary.periodEnd) || dates[dates.length - 1] || null
    },
    documentTotals: {
      totalInspections: toNum(docSummary.totalInspections),
      totalPass: toNum(docSummary.totalPass),
      totalFail: toNum(docSummary.totalFail),
      totalWarning: toNum(docSummary.totalWarning),
      totalOutOfService: toNum(docSummary.totalOutOfService)
    },
    inspections,
    summary: { ...summarize(inspections), period: clean(docSummary.period) || null, safetyRating: normalizeSafetyRating(data.carrier?.safetyRating || docSummary.safetyRating) }
  };
};

export const summarizeInspectionRows = summarize;

/** Normalizes the safety rating text to the values the UI colours. */
export function normalizeSafetyRating(value) {
  const v = clean(value).toLowerCase();
  if (!v) return null;
  if (v.startsWith('unsat')) return 'Unsatisfactory';
  if (v.startsWith('cond')) return 'Conditional';
  if (v.startsWith('sat') || v.includes('excellent')) return 'Satisfactory';
  return clean(value);
}
