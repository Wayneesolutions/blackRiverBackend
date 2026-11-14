/**
 * Local-time helpers for attendance.
 *
 * The server runs in UTC, but the fleet works in Manitoba (Central time). Attendance used the
 * server clock for "today", check-in/out times and the day boundary, so:
 *  - check-in times showed 5–6 hours ahead (a 3:20 pm start showed as 21:20),
 *  - "today" ended at 6–7 pm Winnipeg time, so a running work session was cut at that point,
 *    restarted from zero, and the person dropped out of "Present Today".
 *
 * Every attendance calculation now uses the company's working time zone. Set COMPANY_TIMEZONE
 * (IANA name, e.g. America/Winnipeg, America/Toronto) to change it; the default is Winnipeg.
 * Attendance `date` values keep the existing storage format: UTC midnight of the local calendar day.
 */

export const DEFAULT_TIMEZONE = process.env.COMPANY_TIMEZONE || 'America/Winnipeg';

const partsCache = new Map();
const formatterFor = (tz) => {
  if (!partsCache.has(tz)) {
    partsCache.set(tz, new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }));
  }
  return partsCache.get(tz);
};

/** { year, month, day, hour, minute, second } of an instant, as seen in `tz`. */
export const localParts = (date = new Date(), tz = DEFAULT_TIMEZONE) => {
  const out = {};
  for (const p of formatterFor(tz).formatToParts(new Date(date))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out;
};

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' of the local calendar day. */
export const localDayKey = (date = new Date(), tz = DEFAULT_TIMEZONE) => {
  const { year, month, day } = localParts(date, tz);
  return `${year}-${pad(month)}-${pad(day)}`;
};

/** 'HH:mm' local clock time. */
export const localHHmm = (date = new Date(), tz = DEFAULT_TIMEZONE) => {
  const { hour, minute } = localParts(date, tz);
  return `${pad(hour)}:${pad(minute)}`;
};

/** How the attendance `date` field stores a calendar day: UTC midnight of that day. */
export const attendanceDateFor = (date = new Date(), tz = DEFAULT_TIMEZONE) =>
  new Date(`${localDayKey(date, tz)}T00:00:00.000Z`);

/** Offset (ms) of `tz` from UTC at a given instant. */
const offsetMs = (date, tz) => {
  const p = localParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(new Date(date).getTime() / 1000) * 1000;
};

/** The real instant when the local day containing `date` starts in `tz`. */
export const startOfLocalDay = (date = new Date(), tz = DEFAULT_TIMEZONE) => {
  const { year, month, day } = localParts(date, tz);
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0);
  // Two passes handle days where the offset changes (daylight saving)
  let t = guess - offsetMs(new Date(guess), tz);
  t = guess - offsetMs(new Date(t), tz);
  return new Date(t);
};

/** The last millisecond of the local day containing `date`. */
export const endOfLocalDay = (date = new Date(), tz = DEFAULT_TIMEZONE) => {
  const start = startOfLocalDay(date, tz);
  // Next local midnight: jump 26h ahead and take that day's start (safe across DST)
  const next = startOfLocalDay(new Date(start.getTime() + 26 * 3600 * 1000), tz);
  return new Date(next.getTime() - 1);
};

/** True when two instants fall on the same local calendar day. */
export const isSameLocalDay = (a, b, tz = DEFAULT_TIMEZONE) => localDayKey(a, tz) === localDayKey(b, tz);
