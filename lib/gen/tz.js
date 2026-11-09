export const HOUSE_TZ = "America/Sao_Paulo";

const MONTH_PT = [
  "", "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const WEEKDAY_PT = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function saoPauloTodayLine(now = new Date(), timeZone = HOUSE_TZ) {
  const c = zonedClock(now, timeZone);
  const weekday = WEEKDAY_PT[c.weekday] || "hoje";
  const month = MONTH_PT[c.month] || "";
  return `Hoje é ${weekday}, ${c.day} de ${month} de ${c.year} (${timeZone}). Use esta data e este ano para “hoje” e “próximo jogo”. Nunca invente outro ano.`;
}

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
