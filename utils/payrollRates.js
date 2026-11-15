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

/**
 * Attendance summary for a pay period. Present/late days with no tracked hours count as
 * a standard 8-hour day (same rule as payableHoursFromAttendance). Hours above 8 in a day
 * are overtime for hourly staff.
 */
export const summarizeAttendance = (records = [], hourlyRate = 0) => {
  let totalHours = 0, regularHours = 0, overtimeHours = 0;
  let presentDays = 0, absentDays = 0, leaveDays = 0;
  for (const r of records) {
    if (r.status === 'present' || r.status === 'late') {
      presentDays++;
      const tracked = Math.min(Number(r.totalHours) || 0, 24);
      const hours = tracked > 0 ? tracked : DEFAULT_HOURS_PER_PRESENT_DAY;
      totalHours += hours;
      if (hourlyRate > 0) {
        regularHours += Math.min(hours, DEFAULT_HOURS_PER_PRESENT_DAY);
        overtimeHours += Math.max(0, hours - DEFAULT_HOURS_PER_PRESENT_DAY);
      } else {
        regularHours += hours;
      }
    } else if (r.status === 'absent') {
      absentDays++;
    } else if (r.status === 'leave') {
      leaveDays++;
    }
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  return {
    totalHours: r2(totalHours), regularHours: r2(regularHours), overtimeHours: r2(overtimeHours),
    presentDays, absentDays, leaveDays,
  };
};

/** Attendance `date` values are UTC midnight of the calendar day: query a period the same way. */
export const attendanceRangeFor = (startDate, endDate) => {
  const day = (d) => new Date(`${new Date(d).toISOString().slice(0, 10)}T00:00:00.000Z`);
  const start = day(startDate);
  const end = new Date(day(endDate).getTime() + 24 * 3600 * 1000 - 1);
  return { $gte: start, $lte: end };
};
