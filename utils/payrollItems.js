// utils/payrollItems.js
// Itemised additions / deductions for employee and driver payroll.
//
// Client (15 Nov): "if we are doing deduction or addition we have to mention what it is for,
// for example insurance deduction, registration in case of owner-operator". Every line now
// carries a memo, and the memo is printed on the pay statement.

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Normalise an array of { memo, amount, date, load, per } sent by the frontend.
 * Lines with no amount are dropped. Returns [] for anything that is not an array.
 */
export const normalizePayItems = (items) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => ({
      memo: String(it?.memo ?? it?.name ?? it?.description ?? '').trim(),
      amount: round2(Math.abs(Number(it?.amount) || 0)),
      date: it?.date ? new Date(it.date) : (it?.loadDate ? new Date(it.loadDate) : null),
      load: it?.load ? String(it.load) : '',
      per: it?.per || 'One Time',
      source: it?.source || 'manual',
    }))
    .filter((it) => it.amount > 0);
};

/** Error message when any line is missing its memo, otherwise null. */
export const missingMemoError = (additionItems = [], deductionItems = []) => {
  const add = additionItems.findIndex((i) => !i.memo);
  if (add >= 0) return `Addition #${add + 1} needs a memo (what is it for?)`;
  const ded = deductionItems.findIndex((i) => !i.memo);
  if (ded >= 0) return `Deduction #${ded + 1} needs a memo (what is it for?)`;
  return null;
};

export const sumItems = (items = []) => round2(items.reduce((s, i) => s + (Number(i.amount) || 0), 0));

/** True when the request carries itemised lists (new frontend), false for older callers. */
export const hasItemizedLists = (body = {}) =>
  Array.isArray(body.additionItems) || Array.isArray(body.deductionItems);

export const TAX_FIELDS = [
  'federalIncomeTaxCA', 'provincialIncomeTaxCA', 'cpp', 'ei', 'provincialHealthTaxCA',
  'federalIncomeTaxUS', 'stateIncomeTaxUS', 'socialSecurityTax', 'medicareTax',
  'stateDisabilityInsurance', 'localTax',
];

/**
 * Tax is optional (client: "we can't deduct tax without paying it to the government").
 * applyTaxes === false (or 'false') means no tax is deducted at all.
 * Older callers that never send the flag keep their behaviour.
 */
export const taxesAreApplied = (body = {}) => !(body.applyTaxes === false || body.applyTaxes === 'false');

export const totalTaxesFor = (src = {}, country = 'USA') => {
  const n = (k) => Number(src[k] || 0);
  return country === 'Canada'
    ? round2(n('federalIncomeTaxCA') + n('provincialIncomeTaxCA') + n('cpp') + n('ei') + n('provincialHealthTaxCA'))
    : round2(n('federalIncomeTaxUS') + n('stateIncomeTaxUS') + n('socialSecurityTax') + n('medicareTax') + n('stateDisabilityInsurance') + n('localTax'));
};

/** Paystub `additions` rows built from addition items. */
export const toPaystubAdditions = (items = []) =>
  items.map((i) => ({
    loadDate: i.date || null,
    memo: i.load ? `${i.memo}` : i.memo,
    amount: i.amount,
    per: i.per || 'One Time',
    gst: 0,
    totalCAD: i.amount,
  }));

/** Paystub `deductionItems` rows built from deduction items. */
export const toPaystubDeductions = (items = []) =>
  items.map((i) => ({
    loadDate: i.date || null,
    memo: i.memo,
    amount: i.amount,
    per: i.per || 'One Time',
    gst: 0,
    totalCAD: i.amount,
  }));

export { round2 };

// Orders a driver gets paid for. Payroll only looked at 'completed', but an order only becomes
// completed after accounts approves the POD, so delivered loads never appeared in driver payroll
// ("it doesn't show any trip"). The driver has done the work once the load is delivered.
export const PAYROLL_ORDER_STATUSES = ['delivered', 'verification_pending', 'pending_review', 'completed'];
