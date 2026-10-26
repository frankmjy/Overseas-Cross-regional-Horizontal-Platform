import { civilDate, columns } from './model.mjs';
export const chinaDay = now => new Date(Number(now) + 8 * 3600000).toISOString().slice(0, 10);
export function nextChinaMidnight(now) {
  return Date.parse(`${chinaDay(now)}T00:00:00Z`) + 16 * 3600000;
}
export function calculatedStatus(row, now) {
  const start = civilDate(row[columns.start[0]]), due = civilDate(row[columns.due[0]]), actual = civilDate(row[columns.actualCompletion[0]]);
  if (!due || !start || due < start) return null;
  if (actual) return actual > due ? '逾期完成' : '正常完成';
  const today = chinaDay(now);
  return today < start ? '未开始' : today > due ? '逾期未完成' : '进行中';
}
