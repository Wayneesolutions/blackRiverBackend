// CSV and date helpers for the fuel report import.

const DELIMITERS = [",", ";", "\t"];

// Count a character in a line, ignoring anything inside double quotes.
const countOutsideQuotes = (line, ch) => {
  let inQuotes = false;
  let count = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ch && !inQuotes) count++;
  }
  return count;
};

// Pick the delimiter from the header row only, so a ";" inside a notes cell
// further down the file can't change how the whole file is read.
export const detectDelimiter = (text) => {
  const firstLine = String(text).replace(/^﻿/, "").split(/\r?\n/).find((l) => l.trim()) || "";
  let best = ",";
  let bestCount = 0;
  for (const d of DELIMITERS) {
    const n = countOutsideQuotes(firstLine, d);
    if (n > bestCount) {
      best = d;
      bestCount = n;
    }
  }
  return best;
};

// RFC 4180 style parser: quoted cells may contain the delimiter, line breaks
// and doubled quotes ("") for a literal quote. Returns an array of rows.
export const parseCsvRows = (text, delimiter) => {
  const src = String(text).replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows
    .map((r) => r.map((v) => v.trim()))
    .filter((r) => r.some((v) => v !== ""));
};

// Parse CSV text into { headers, rows, delimiter }. Each row is an object
// keyed by the header text exactly as it appears in the file.
// Files exported from fuel portals often start with title lines ("Pilot Flying J - Customer
// Portal", report dates) before the real header. Use the first row, within the first 15, that
// has at least 2 distinct values and is about as wide as the widest row.
const findHeaderRow = (all) => {
  const look = all.slice(0, 15);
  const filled = (r) => r.filter((v) => v.trim()).length;
  const distinct = (r) => new Set(r.map((v) => v.trim()).filter(Boolean)).size;
  const widest = Math.max(...look.map(filled));
  const idx = look.findIndex((r) => distinct(r) >= 2 && filled(r) >= Math.ceil(widest * 0.6));
  return idx < 0 ? 0 : idx;
};

// Repeated or blank header names would overwrite each other in the row objects.
const uniqueHeaders = (raw) => {
  const seen = new Map();
  return raw.map((h, i) => {
    const base = h.trim() || `Column ${i + 1}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
};

export const parseCsv = (text) => {
  const delimiter = detectDelimiter(text);
  const all = parseCsvRows(text, delimiter);
  if (all.length === 0) return { headers: [], rows: [], delimiter };
  const headerIdx = findHeaderRow(all);
  const headers = uniqueHeaders(all[headerIdx]);
  const rows = all.slice(headerIdx + 1).map((values) =>
    headers.reduce((obj, header, index) => {
      obj[header] = values[index] ?? "";
      return obj;
    }, {})
  );
  return { headers, rows, delimiter };
};

// "1,250.00", "$1,250.00", "C$ 1 250.00", "(12.50)" -> number, or NaN.
export const parseNumber = (raw) => {
  if (raw === undefined || raw === null) return NaN;
  let s = String(raw).trim();
  if (!s) return NaN;
  const negative = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/[^0-9.]/g, "");
  if (!s) return NaN;
  const n = parseFloat(s);
  return negative ? -n : n;
};

const SLASH_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/;
const ISO_DATE = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?:[T\s].*)?$/;

const utcDate = (y, m, d) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  // Reject rollovers like 31/02 -> 3 March
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
};

const fullYear = (y) => (y.length === 2 ? 2000 + Number(y) : Number(y));

// Decide whether slash dates in a file are month-first or day-first.
// Returns 'MDY', 'DMY', or null when every date fits both.
export const detectDateOrder = (values) => {
  let mdyPossible = true;
  let dmyPossible = true;
  for (const v of values) {
    const m = SLASH_DATE.exec(String(v ?? "").trim());
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12) mdyPossible = false;
    if (b > 12) dmyPossible = false;
  }
  if (mdyPossible && !dmyPossible) return "MDY";
  if (dmyPossible && !mdyPossible) return "DMY";
  return null;
};

// Parse a fuel date to UTC midnight of that calendar day, so the stored date
// is the same day wherever it is viewed. order: 'MDY' | 'DMY' for slash dates.
export const parseFuelDate = (raw, order = "MDY") => {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  let m = ISO_DATE.exec(s);
  if (m) return utcDate(Number(m[1]), Number(m[2]), Number(m[3]));

  m = SLASH_DATE.exec(s);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    const y = fullYear(m[3]);
    return order === "DMY" ? utcDate(y, b, a) : utcDate(y, a, b);
  }

  // Text dates like "Nov 5 2026" or "5 November 2026": keep the calendar day.
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return utcDate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
};
