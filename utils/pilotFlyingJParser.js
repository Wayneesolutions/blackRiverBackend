/**
 * Pilot Flying J (PFJ) Customer Portal fuel transaction reports, as Excel (.xlsx) or PDF.
 *
 * Both give one line per product per transaction: Card #, Card Description (the unit number),
 * Trx Date, Transaction #, Store, City, State, Country, Product, Driver ID, Odometer, Trailer,
 * Trip, Vehicle, Quantity, Fuel, Fuel G/HST, Fuel P/QST, Merchandise, Invoice Amount.
 *
 * The output has the same shape as parseEfsRows() in fuelReportsController, so the existing
 * preview -> confirm import (driver / truck matching) works unchanged, plus:
 *   - time:       "7:59 PM"
 *   - importKey:  same for one purchase in the PDF and in the Excel (their transaction numbers
 *                 differ), so importing a month twice, or as PDF and Excel, saves it only once.
 *
 * Excel: every sheet with the transaction header is read and duplicates are dropped (the "US"
 * sheet in the October 2026 export also holds every Canadian line, and the "Canada" sheet repeats
 * them). Total rows and the summary sheets are skipped.
 * PDF: cells wrap over 2-3 lines ("San / Antonio", "Diesel / Exhaust / Fluid"), sometimes across
 * a page break, so each record is built from its date line plus the lines that follow it.
 */
import * as XLSX from 'xlsx';

// Canonical columns, in report order
const COLUMNS = [
  'cardNumber', 'cardDescription', 'trxDate', 'transactionNumber', 'storeNumber', 'storeCity',
  'state', 'country', 'product', 'driverId', 'odometer', 'trailer', 'trip', 'vehicle',
  'quantity', 'fuel', 'taxHst', 'taxQst', 'merchandise', 'invoiceAmount',
];

const DATE_RE = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
const TIME_RE = /(\d{1,2}):(\d{2})\s*([AP]M)?/i;

const money = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const text = (v) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
const round2 = (n) => Math.round(n * 100) / 100;

/** "10/31/2026 7:59 PM" (or an Excel date) -> { date: UTC midnight, time: "7:59 PM", stamp } */
const parseTrxDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const date = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
    const h = value.getHours();
    const m = value.getMinutes();
    const time = `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
    return { date, time, stamp: `${date.toISOString().slice(0, 10)}T${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}` };
  }
  const s = text(value);
  const d = s.match(DATE_RE);
  if (!d) return null;
  const [, mm, dd, yyyy] = d.map(Number);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const date = new Date(Date.UTC(yyyy, mm - 1, dd));
  const t = s.slice(d.index + d[0].length).match(TIME_RE);
  let h = 0;
  let min = 0;
  let time = '';
  if (t) {
    h = Number(t[1]) % 12 + (t[3] && t[3].toUpperCase() === 'PM' ? 12 : 0);
    if (!t[3]) h = Number(t[1]);
    min = Number(t[2]);
    time = `${t[1]}:${t[2]}${t[3] ? ` ${t[3].toUpperCase()}` : ''}`;
  }
  return { date, time, stamp: `${date.toISOString().slice(0, 10)}T${String(h).padStart(2, '0')}${String(min).padStart(2, '0')}` };
};

const slug = (s) => text(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';

/** One raw record (column -> text/number) -> the import row shape. null when it isn't a transaction. */
const toTransaction = (rec, defaultCountry) => {
  const when = parseTrxDate(rec.trxDate);
  if (!when) return null;
  const card = text(rec.cardNumber);
  if (!card || /^total/i.test(card)) return null;

  const country = text(rec.country) || defaultCountry || '';
  const isCanada = /^(canada|can|ca)$/i.test(country);
  const quantity = money(rec.quantity);
  const invoiceAmount = round2(money(rec.invoiceAmount));
  const product = text(rec.product);
  const t = {
    source: 'pilot-flying-j',
    cardNumber: card,
    cardDescription: text(rec.cardDescription),
    date: when.date,
    time: when.time,
    transactionNumber: text(rec.transactionNumber),
    storeNumber: text(rec.storeNumber),
    storeCity: text(rec.storeCity),
    state: text(rec.state),
    country,
    product,
    driverIdRaw: text(rec.driverId),
    odometer: text(rec.odometer),
    trailer: text(rec.trailer),
    trip: text(rec.trip),
    vehicleRaw: text(rec.vehicle),
    quantity: round2(quantity),
    measurementUnit: isCanada ? 'L' : 'gal',
    fuelAmount: round2(money(rec.fuel)),
    taxHst: round2(money(rec.taxHst)),
    taxQst: round2(money(rec.taxQst)),
    merchandiseAmount: round2(money(rec.merchandise)),
    invoiceAmount,
    currency: isCanada ? 'CAD' : 'USA',
  };
  // Same purchase -> same key in the PDF and the Excel (their transaction numbers differ)
  t.importKey = [
    'PFJ', slug(card), when.stamp, slug(product),
    Math.round(quantity * 100), Math.round(invoiceAmount * 100),
  ].join('-');
  return t;
};

const dedupe = (rows) => {
  const seen = new Set();
  return rows.filter((r) => (seen.has(r.importKey) ? false : (seen.add(r.importKey), true)));
};

// ── Excel ────────────────────────────────────────────────────────────────────

const HEADER_NAMES = {
  'card #': 'cardNumber', 'card#': 'cardNumber', 'card number': 'cardNumber',
  'card description': 'cardDescription',
  'trx date': 'trxDate', 'transaction date': 'trxDate',
  'transaction #': 'transactionNumber', 'transaction#': 'transactionNumber',
  'store number': 'storeNumber', 'store #': 'storeNumber',
  'store city': 'storeCity', 'city': 'storeCity',
  'state': 'state', 'store state': 'state', 'province': 'state',
  'country': 'country', 'product': 'product', 'driver id': 'driverId',
  'odometer': 'odometer', 'trailer': 'trailer', 'trip': 'trip', 'vehicle': 'vehicle',
  'quantity': 'quantity', 'fuel': 'fuel', 'fuel g/hst': 'taxHst', 'fuel p/qst': 'taxQst',
  'merchandise': 'merchandise', 'invoice amount': 'invoiceAmount',
};

export const looksLikePfjSheet = (rows) =>
  rows.slice(0, 15).some((r) => {
    const cells = (r || []).map((c) => text(c).toLowerCase());
    return cells.includes('trx date') && cells.includes('invoice amount') && cells.some((c) => c.startsWith('card'));
  });

/** @param {Buffer} buffer .xlsx file */
export const parsePfjXlsx = (buffer) => {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const out = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
    const headerIdx = rows.findIndex((r, i) => i < 15 && looksLikePfjSheet([r]));
    if (headerIdx < 0) continue; // summary sheets
    const map = rows[headerIdx].map((h) => HEADER_NAMES[text(h).toLowerCase()] || null);
    const defaultCountry = /canad/i.test(name) ? 'Canada' : '';
    for (const r of rows.slice(headerIdx + 1)) {
      if (!r || r.every((c) => c === null || c === '')) continue;
      const rec = {};
      map.forEach((col, i) => { if (col) rec[col] = r[i]; });
      const t = toTransaction(rec, defaultCountry);
      if (t) out.push(t);
    }
  }
  return dedupe(out);
};

// ── PDF ──────────────────────────────────────────────────────────────────────

const loadPdfLines = async (buffer) => {
  let pdfjs;
  try {
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch {
    pdfjs = await import('pdfjs-dist');
  }
  const lib = pdfjs.default || pdfjs;
  const pdf = await lib.getDocument({ data: new Uint8Array(buffer), verbosity: 0 }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items
      .filter((i) => i.str && i.str.trim())
      .map((i) => ({ str: i.str.trim(), x: i.transform[4], y: vp.height - i.transform[5] }));
    // Lines: items within 2.5pt vertically, left to right
    items.sort((a, b) => a.y - b.y || a.x - b.x);
    const lines = [];
    for (const it of items) {
      const line = lines[lines.length - 1];
      if (line && Math.abs(line.y - it.y) <= 2.5) line.items.push(it);
      else lines.push({ y: it.y, items: [it] });
    }
    lines.forEach((l) => l.items.sort((a, b) => a.x - b.x));
    pages.push(lines);
  }
  return pages;
};

// First header line labels -> column (repeated labels in order: Card, Card / Fuel, Fuel, Fuel)
const FIRST_LINE_LABELS = [
  ['card', 'cardNumber'], ['card', 'cardDescription'], ['trx date', 'trxDate'],
  ['transaction', 'transactionNumber'], ['store', 'storeNumber'], ['store city', 'storeCity'],
  ['state', 'state'], ['country', 'country'], ['product', 'product'], ['driver', 'driverId'],
  ['odometer', 'odometer'], ['trailer', 'trailer'], ['trip', 'trip'], ['vehicle', 'vehicle'],
  ['quantity', 'quantity'], ['fuel', 'fuel'], ['fuel', 'taxHst'], ['fuel', 'taxQst'],
  ['merchandise', 'merchandise'], ['invoice', 'invoiceAmount'],
];
const HEADER_WORDS = new Set(['#', 'description', 'number', 'id', 'g/', 'hst', 'p/', 'qst', 'amount', 'p/qst', 'amoun']);

/** Column x-bands from a header line, or null when the line isn't the table header. */
const headerColumns = (line) => {
  const labels = line.items.map((i) => i.str.toLowerCase());
  if (!labels.includes('trx date') || !labels.some((l) => l.startsWith('invoice'))) return null;
  const anchors = [];
  let li = 0;
  for (const item of line.items) {
    const label = item.str.toLowerCase();
    // advance to the next expected label this item can be
    let j = li;
    while (j < FIRST_LINE_LABELS.length && !label.startsWith(FIRST_LINE_LABELS[j][0])) j++;
    if (j >= FIRST_LINE_LABELS.length) continue;
    anchors.push({ col: FIRST_LINE_LABELS[j][1], x: item.x });
    li = j + 1;
  }
  if (anchors.length < 15) return null;
  // Values sit at or slightly left of their heading: split halfway between headings
  return anchors.map((a, i) => ({
    col: a.col,
    from: i === 0 ? -Infinity : (anchors[i - 1].x + a.x) / 2,
    to: i === anchors.length - 1 ? Infinity : (a.x + anchors[i + 1].x) / 2,
  }));
};

const columnFor = (bands, x) => (bands.find((b) => x >= b.from && x < b.to) || bands[bands.length - 1]).col;

/** @param {Buffer} buffer PDF file */
export const parsePfjPdf = async (buffer) => {
  const pages = await loadPdfLines(buffer);
  const records = [];
  let bands = null;
  let current = null;
  let section = '';
  let done = false;

  for (const lines of pages) {
    for (const line of lines) {
      if (done) break;
      const joined = line.items.map((i) => i.str).join(' ');
      if (/^Summary by/i.test(joined)) { done = true; break; }
      if (/^US Transactions/i.test(joined)) { section = 'US'; current = null; continue; }
      if (/^Canadian Transactions/i.test(joined)) { section = 'Canada'; current = null; continue; }

      const hdr = headerColumns(line);
      if (hdr) { bands = hdr; continue; } // a record can continue after a page header
      if (!bands) continue;
      if (line.items.every((i) => HEADER_WORDS.has(i.str.toLowerCase()))) continue;
      if (/^Total\b/i.test(line.items[0].str)) { current = null; continue; }

      const cells = {};
      for (const it of line.items) {
        const col = columnFor(bands, it.x);
        cells[col] = cells[col] ? `${cells[col]} ${it.str}` : it.str;
      }

      if (cells.trxDate && DATE_RE.test(cells.trxDate) && cells.cardNumber) {
        current = { ...cells, _section: section };
        records.push(current);
      } else if (current) {
        // wrapped cell text: "7:59 PM", "Antonio", "States", "Diesel", "Fluid"
        for (const [col, val] of Object.entries(cells)) {
          current[col] = current[col] ? `${current[col]} ${val}` : val;
        }
      }
    }
    if (done) break;
  }

  return dedupe(records.map((r) => toTransaction(r, r._section === 'Canada' ? 'Canada' : '')).filter(Boolean));
};

/** Totals for a check against the report's printed totals. */
export const summarize = (rows) => ({
  transactions: rows.length,
  invoiceAmount: round2(rows.reduce((s, r) => s + r.invoiceAmount, 0)),
  fuelAmount: round2(rows.reduce((s, r) => s + r.fuelAmount, 0)),
  quantity: round2(rows.reduce((s, r) => s + r.quantity, 0)),
  byCurrency: rows.reduce((acc, r) => {
    acc[r.currency] = round2((acc[r.currency] || 0) + r.invoiceAmount);
    return acc;
  }, {}),
});
