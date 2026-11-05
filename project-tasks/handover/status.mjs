export const executionStatuses = Object.freeze(['未开始', '进行中', '逾期进行', '逾期完成', '已完成']);
export const chinaDay = (now = Date.now()) => new Date(Number(now) + 8 * 3600000).toISOString().slice(0, 10);
export function executionStatus(task, now = Date.now()) {
  if (task.actualCompletion) return task.due && task.actualCompletion > task.due ? '逾期完成' : '已完成';
  if (!task.start || !task.due || task.due < task.start) return '未开始';
  const today = chinaDay(now);
  return today < task.start ? '未开始' : today > task.due ? '逾期进行' : '进行中';
}
export const completedStatus = value => ['已完成', '逾期完成'].includes(value);
