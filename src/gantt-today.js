export function centeredTimelineScroll({ offset, dayWidth, viewportWidth, frozenWidth, scrollWidth }) {
  const visible = Math.max(0, viewportWidth - frozenWidth);
  return Math.max(0, Math.min(scrollWidth - viewportWidth, offset * dayWidth - visible / 2));
}

export function todayMarker(rangeStart, rangeEnd, now = new Date()) {
  if (!/^\d{4}-\d\d-\d\d$/.test(rangeStart || '') || !/^\d{4}-\d\d-\d\d$/.test(rangeEnd || '')) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const start = new Date(`${rangeStart.slice(0, 7)}-01T00:00:00Z`);
  const last = new Date(`${rangeEnd.slice(0, 7)}-01T00:00:00Z`); last.setUTCMonth(last.getUTCMonth() + 1);
  const days = (last - start) / 86400000;
  const offset = (Date.parse(`${date}T00:00:00Z`) - start) / 86400000 + (Number(parts.hour) * 60 + Number(parts.minute)) / 1440;
  if (offset < 0 || offset >= days) return null;
  return { date, label: `今天 ${parts.month}/${parts.day}`, offset, percent: offset / days * 100 };
}
