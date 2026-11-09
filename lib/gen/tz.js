export const HOUSE_TZ = "America/Sao_Paulo";

const WEEK = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedClock(date, timeZone = HOUSE_TZ) {
  const d = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: WEEK[get("weekday")] ?? 0,
  };
}

export function sameLocalSlot(a, b) {
  return a && b
    && a.year === b.year
    && a.month === b.month
    && a.day === b.day
    && a.hour === b.hour;
}

export function sameLocalDay(a, b) {
  return a && b
    && a.year === b.year
    && a.month === b.month
    && a.day === b.day;
}
