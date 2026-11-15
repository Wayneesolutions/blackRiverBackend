// utils/payrollRates.js
// Shared helpers for employee (non-driver) payroll calculations.

const DEFAULT_HOURS_PER_PRESENT_DAY = 8;

/**
 * The Employee module stores pay as `details.payType` (pay FREQUENCY: Hourly,
 * Biweekly, SemiMonthly, Monthly) and `details.payRate`, which the form labels
 * "Pay Rate (per hour)". Older code only copied payRate into hourlyRate when
 * payType === 'Hourly', so Biweekly/SemiMonthly/Monthly employees ended up with
 * a $0 rate. payRate is always an hourly wage, so use it as the fallback.
 */
export const resolveEmployeeHourlyRate = (user) => {
  const details = user?.details || {};
  const hourly = Number(details.hourlyRate) || 0;
  if (hourly > 0) return hourly;
  const payRate = Number(details.payRate) || 0;
  return payRate > 0 ? payRate : 0;
};

/**
 * Hours to pay from attendance. A day marked present/late with no tracked hours
 * (e.g. marked manually by HR, or no check-out) counts as a standard 8-hour day,
 * so a present employee is never paid $0 for that day.
 */
export const payableHoursFromAttendance = (records = []) => {
  return records.reduce((sum, r) => {
    const worked = r.status === 'present' || r.status === 'late';
    if (!worked) return sum;
    const tracked = Number(r.totalHours) || 0;
    return sum + (tracked > 0 ? tracked : DEFAULT_HOURS_PER_PRESENT_DAY);
  }, 0);
};
