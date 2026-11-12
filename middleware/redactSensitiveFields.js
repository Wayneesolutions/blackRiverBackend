// Hides personal identifiers, tax/bank numbers and pay from employee and driver records for
// roles that only need the person's name and contact details (dispatcher, safety officer,
// fleet, compliance, mechanics...). Admin, HR and accounting still get the full record.
//
// Apply it on read routes after authMiddleware:
//   router.get('/driver', authMiddleware, authorizeRoles(...), redactSensitiveFields, handler)

const FULL_ACCESS_ROLES = new Set(['admin', 'superadmin', 'hr', 'accountant', 'accounts']);

// Removed wherever they appear in the response
const SENSITIVE_KEYS = new Set([
  // Government / tax identifiers
  'sinNo', 'sin', 'sinNumber', 'craAccountNo', 'federalTaxNo', 'localTaxNo', 'wsibAccountNo',
  // Date of birth
  'dateOfBirth', 'dob', 'dateOfBirthFormatted',
  // Passport and immigration documents
  'passport', 'passportNumber', 'prCardDocumentUrl', 'workPermitDocumentUrl',
  // Bank / payment account
  'account', 'accountNumber', 'transitNumber', 'institutionNumber', 'bankAccount',
  // Pay
  'payRate', 'hourlyRate', 'mileRate', 'mileRateTeam', 'emptyMileRate', 'emptyMileRateTeam',
  'weightRate', 'percentageRate', 'perTripAmount', 'dailyRate', 'salary', 'baseSalary',
  'salaryPerMile', 'salaryPerMileSnow', 'salaryPerMileHighTemp',
  'bonusDrop', 'bonusPick', 'bonusLayover', 'safetyBonus', 'vacationPay', 'defaultAmount',
]);

const MAX_DEPTH = 8;

export const canSeeSensitiveFields = (user) => FULL_ACCESS_ROLES.has(user?.role);

/** Returns a copy of `value` with every sensitive key removed (plain data only). */
export const stripSensitiveFields = (value, depth = 0) => {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((v) => stripSensitiveFields(v, depth + 1));
  // Mongoose documents / ObjectIds: serialise the same way res.json would
  if (typeof value.toJSON === 'function' && value.constructor?.name !== 'Object') {
    const json = value.toJSON();
    if (json !== value) return stripSensitiveFields(json, depth);
  }
  const out = {};
  for (const [key, v] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key)) continue;
    out[key] = stripSensitiveFields(v, depth + 1);
  }
  return out;
};

export const redactSensitiveFields = (req, res, next) => {
  if (canSeeSensitiveFields(req.user)) return next();
  const originalJson = res.json.bind(res);
  res.json = (body) => originalJson(stripSensitiveFields(body));
  next();
};

export default redactSensitiveFields;
