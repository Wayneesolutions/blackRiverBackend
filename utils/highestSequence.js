/**
 * Highest sequence number already used for a numbered record, e.g. 7 for INC-2026-0007.
 *
 * Record numbers used to be "count of records + 1". After a record was deleted the count went
 * down, so the next number was one that still existed, the unique index rejected the save, and
 * every retry got the same number again. Creating incidents, CAPAs, invoices and so on then
 * failed until someone added records some other way. Taking the highest number in use instead
 * always gives a free number.
 *
 * Call it where `countDocuments(query)` was used; the result works the same way (next = result + 1).
 *
 * @param {import('mongoose').Model} Model
 * @param {object} query  filter that includes the number field as a RegExp, e.g.
 *                        { incidentNumber: /^INC-2026-/, company }
 * @returns {Promise<number>} the highest number in use, or 0 when none
 */
export const highestSequence = async (Model, query) => {
  const field = Object.keys(query).find((key) => query[key] instanceof RegExp);
  if (!field) throw new Error('highestSequence: the query needs the number field as a RegExp');

  // When the number is unique across ALL companies (unique: true on the field itself), a
  // per-company search would hand a second company a number the first one already uses.
  // Only a compound { number, company } index makes numbers per company.
  const globallyUnique = Model.schema?.path?.(field)?.options?.unique === true;
  if (globallyUnique) query = { [field]: query[field] };

  // numericOrdering sorts INC-2026-10000 after INC-2026-9999
  const latest = await Model.findOne(query)
    .select(field)
    .sort({ [field]: -1 })
    .collation({ locale: 'en', numericOrdering: true })
    .lean();

  const match = String(latest?.[field] ?? '').match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
};
