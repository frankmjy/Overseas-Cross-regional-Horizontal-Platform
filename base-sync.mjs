import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const BASE_TOKEN = 'CID8b8V7CaCtKesWGFKcHTdqnlc';
export const TABLE_ID = 'tblSpSvqS2FMpHks';
const BASE_URL =
  'https://vnet.feishu.cn/base/CID8b8V7CaCtKesWGFKcHTdqnlc?table=tblSpSvqS2FMpHks';

export const FIELD_NAMES = [
  'Task Code（任务编号）',
  'Process Group Link（所属项目）',
  'Team Setup Phase（团队组建小阶段）',
  'Task Description（任务详情）',
  'Start Time（开始时间）',
  'Due Time（截止时间）',
  'Gantt End（甘特结束时间）',
  'Project Status（项目进度）',
  'Priority（优先级）',
  'Milestone（里程碑）',
  'Progress Details（进展说明）',
  'Deliverable Requirements（交付物&备注）',
  '交付物-链接',
  '交付物-附件',
];

const STAGE_META = [
  {
    source: '团队筹建准备',
    title: '合规筹备与资质申请',
    short: '合规筹备',
    tone: 'blue',
  },
  {
    source: '核心管理与技术骨干招聘',
    title: '核心管理与技术骨干招聘',
    short: '核心骨干',
    tone: 'amber',
  },
  {
    source: '批量基层招聘与入职培训',
    title: '批量基层招聘与入职培训',
    short: '基层招聘',
    tone: 'green',
  },
  {
    source: '体系演练与交付收官',
    title: '体系演练与交付收官',
    short: '体系演练',
    tone: 'indigo',
  },
];

const FALLBACK_TONES = ['blue', 'amber', 'green', 'indigo', 'rose'];

function runLarkCli(args) {
  const configuredCliScript = process.env.LARK_CLI_SCRIPT?.trim();
  if (configuredCliScript && existsSync(configuredCliScript)) {
    return execFileAsync(process.execPath, [configuredCliScript, ...args], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 8,
      timeout: 30000,
      windowsHide: true,
    });
  }

  const cliScript = path.join(
    path.dirname(process.execPath),
    'node_modules',
    '@larksuite',
    'cli',
    'scripts',
    'run.js',
  );
  const executable = process.platform === 'win32' && existsSync(cliScript) ? process.execPath : 'lark-cli';
  const finalArgs = executable === process.execPath ? [cliScript, ...args] : args;
  return execFileAsync(executable, finalArgs, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 8,
    timeout: 30000,
    windowsHide: true,
  });
}

function firstText(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return firstText(value[0]);
  if (typeof value === 'object') return value.name || value.text || value.id || '';
  return String(value).trim();
}

function getField(record, fields, fieldName) {
  const index = fields.findIndex(name => name === fieldName || name.endsWith(`（${fieldName}）`));
  return index < 0 ? undefined : record[index];
}

function dateFromSerial(value) {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial <= 0) return '';
  const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  return date.toISOString().slice(0, 10);
}

function normalizeDate(value) {
  if (value == null || value === '') return '';
  const text = String(value).trim();
  const match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }
  return dateFromSerial(text);
}

function dateToUtc(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function daysBetween(start, end) {
  if (!start || !end) return 0;
  return Math.round((dateToUtc(end) - dateToUtc(start)) / 86400000);
}

function minDate(dates) {
  return dates.filter(Boolean).sort()[0] || '';
}

function maxDate(dates) {
  return dates.filter(Boolean).sort().at(-1) || '';
}

function normalizePriority(value) {
  const text = firstText(value);
  if (text.includes('P0')) return 'P0';
  if (text.includes('P1')) return 'P1';
  if (text.includes('P2')) return 'P2';
  return text || '未填写';
}

function normalizeStatus(value) {
  const text = firstText(value);
  if (!text) return '未填写';
  if (['完成', '已完成', '正常完成', '逾期完成', '提前完成'].includes(text)) return '已完成';
  return text;
}

function currentChinaTime() {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const dict = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${dict.year}-${dict.month}-${dict.day}`,
    label: `${dict.month}/${dict.day} ${dict.hour}:${dict.minute}`,
  };
}

function makeStageMeta(stageName, index) {
  const predefined = STAGE_META.find((stage) => stage.source === stageName);
  if (predefined) return predefined;
  return {
    source: stageName,
    title: stageName || `未分组阶段 ${index + 1}`,
    short: stageName || `阶段${index + 1}`,
    tone: FALLBACK_TONES[index % FALLBACK_TONES.length],
  };
}

function trimText(text, size = 82) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > size ? `${value.slice(0, size)}...` : value;
}

function extractRiskBody(record) {
  const text = record.remark || record.progressNote || '';
  const riskIndex = text.indexOf('风险');
  if (riskIndex >= 0) return trimText(text.slice(riskIndex).replace(/^风险[:：]\s*/, ''));
  return trimText(text);
}

function buildRiskRadar(records) {
  const riskRecords = records
    .filter((record) => record.priority === 'P0' || /风险|逾期|合规|签证|宿舍|通勤/.test(record.remark || ''))
    .slice(0, 4);

  return riskRecords.map((record) => ({
    title: trimText(record.title, 28),
    body: extractRiskBody(record),
    level: record.priority,
  }));
}

function extractDeliverables(values, recordId) {
  const files = new Map();
  const add = (name, value, inSource = false) => {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return;
      if (!files.has(url.href)) files.set(url.href, { name: name || '查看交付物', url: url.href, inSource });
    } catch { /* Source text without a URL is not a clickable deliverable. */ }
  };
  const read = (value) => {
    if (Array.isArray(value)) { value.forEach(read); return; }
    if (!value) return;
    if (typeof value === 'object') {
      if (value.url || value.link) add(value.name || value.text, value.url || value.link);
      else if (value.file_token && recordId) add(value.name, `${BASE_URL}&record=${encodeURIComponent(recordId)}`, true);
      else if (value.text) read(value.text);
      return;
    }
    const remaining = String(value).replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, name, url) => {
      add(name, url);
      return '';
    });
    for (const match of remaining.matchAll(/https?:\/\/[^\s<>"\])]+/g)) add('', match[0]);
  };
  values.forEach(read);
  return [...files.values()];
}

export function normalizeRecords(envelope) {
  const fields = envelope.data?.fields || FIELD_NAMES;
  const rows = envelope.data?.data || [];

  return rows.map((row, index) => {
    const recordId = envelope.data?.record_id_list?.[index] || '';
    const start = normalizeDate(getField(row, fields, '开始时间'));
    const deadline = normalizeDate(getField(row, fields, '截止时间'));
    const ganttEnd = normalizeDate(getField(row, fields, '甘特结束时间'));
    const end = deadline || ganttEnd;
    const sourceStatus = firstText(getField(row, fields, '项目进度'));
    const status = normalizeStatus(sourceStatus);
    const priority = normalizePriority(getField(row, fields, '优先级'));
    const milestoneValue = getField(row, fields, '里程碑');
    const title = firstText(getField(row, fields, '任务详情'));
    const isMilestone = !['', '否', 'false', '0'].includes(firstText(milestoneValue)) || title.includes('里程碑');

    return {
      rawIndex: index,
      recordId,
      deliverables: extractDeliverables([getField(row, fields, '交付物-链接'), getField(row, fields, '交付物-附件')], recordId),
      code: firstText(getField(row, fields, '任务编号')) || String(index + 1).padStart(3, '0'),
      stage: firstText(getField(row, fields, '团队组建小阶段')) || '未分组',
      title,
      start,
      end,
      status,
      sourceStatus,
      priority,
      progress: status === '已完成' ? 100 : 0,
      type: isMilestone ? 'milestone' : 'task',
      progressNote: firstText(getField(row, fields, '进展说明')),
      remark: firstText(getField(row, fields, '交付物&备注')),
    };
  });
}

export function buildPlan(records) {
  const stageNames = [...new Set(records.map((record) => record.stage))];
  const sortedStageNames = [
    ...STAGE_META.map((stage) => stage.source).filter((stage) => stageNames.includes(stage)),
    ...stageNames.filter((stage) => !STAGE_META.some((item) => item.source === stage)),
  ];
  const rangeStart = minDate(records.map((record) => record.start));
  const rangeEnd = maxDate(records.map((record) => record.end));
  const fetchedAt = currentChinaTime();
  const phases = [];
  const ganttPhases = [];
  const keyRows = [];

  sortedStageNames.forEach((stageName, index) => {
    const stageRecords = records.filter((record) => record.stage === stageName);
    const meta = makeStageMeta(stageName, index);
    const no = String(index + 1).padStart(2, '0');
    const start = minDate(stageRecords.map((record) => record.start));
    const end = maxDate(stageRecords.map((record) => record.end));
    const p0 = stageRecords.filter((record) => record.priority === 'P0').length;
    const p1 = stageRecords.filter((record) => record.priority === 'P1').length;
    const completed = stageRecords.filter((record) => record.status === '已完成').length;
    const progress = Math.round(completed / stageRecords.length * 100);
    const status = completed === stageRecords.length ? '已完成'
      : stageRecords.every((record) => record.status === '未开始') ? '未开始'
      : stageRecords.every((record) => record.status === '未填写') ? '未填写' : '进行中';
    const sampleTasks = stageRecords
      .filter((record) => record.type !== 'milestone')
      .slice(0, 3)
      .map((record) => record.title);
    const deliverable = stageRecords.find((record) => record.remark)?.remark || '交付物待多维表继续补充。';

    phases.push({
      no,
      title: meta.title,
      short: meta.short,
      start,
      end,
      total: stageRecords.length,
      completed,
      remaining: stageRecords.length - completed,
      progress,
      status,
      p0,
      p1,
      tone: meta.tone,
      desc: trimText(stageRecords.find((record) => record.remark)?.remark || sampleTasks.join('、'), 88),
      tasks: sampleTasks.length ? sampleTasks : [meta.title],
      deliverable,
    });

    ganttPhases.push({
      code: no,
      name: meta.title,
      short: meta.short,
      start,
      end,
      tasks: stageRecords.length,
      p0,
      p1,
      status,
      progress,
      tone: meta.tone,
      focus: trimText(stageRecords.find((record) => record.remark)?.remark || sampleTasks.join('、'), 96),
      milestone: stageRecords.find((record) => record.type === 'milestone')?.start || end,
    });

    keyRows.push({
      type: 'phase',
      code: no,
      title: meta.title,
      start,
      end,
      priority: p0 ? 'P0' : p1 ? 'P1' : 'P2',
      status,
      progress,
      phase: meta.tone,
    });

    stageRecords.forEach((record) => {
      keyRows.push({
        type: record.type,
        code: record.code,
        recordId: record.recordId,
        deliverables: record.deliverables,
        title: record.title,
        start: record.start,
        end: record.end,
        priority: record.priority,
        status: record.status,
        sourceStatus: record.sourceStatus,
        progress: record.progress,
        phase: meta.tone,
      });
    });
  });

  const milestones = records
    .filter((record) => record.type === 'milestone' && record.start)
    .map((record) => ({
      date: record.start,
      title: record.title,
    }));

  const p0Tasks = records.filter((record) => record.priority === 'P0').length;

  return {
    phases,
    milestones,
    ganttPlan: {
      source: {
        baseUrl: BASE_URL,
        tableId: TABLE_ID,
        fetchedAt: fetchedAt.date,
      },
      rangeStart,
      rangeEnd,
      totalTasks: records.length,
      completedTasks: records.filter((record) => record.status === '已完成').length,
      p0Tasks,
      milestoneCount: milestones.length,
      durationDays: rangeStart && rangeEnd ? Math.max(0, daysBetween(rangeStart, rangeEnd) + 1) : 0,
      phases: ganttPhases,
      keyRows,
      gaps: records
        .filter((record) => /待|缺口|风险|确认|兜底/.test(`${record.title}${record.remark}`))
        .slice(0, 5)
        .map((record) => trimText(record.title, 32)),
      riskRadar: buildRiskRadar(records),
    },
    syncedAt: fetchedAt.date,
    syncedAtLabel: fetchedAt.label,
    recordCount: records.length,
  };
}

function syncFailure(message) {
  return Object.assign(new Error(message), { publicMessage: message });
}
function applicationFailure(envelope) {
  const detail = envelope?.error;
  const code = String(detail?.code ?? envelope?.code ?? (/\[(\d+)\]/.exec(detail?.message || '')?.[1] || ''));
  if (code === '10014') return syncFailure('飞书应用凭据无效（10014），请在“应用配置”中更新 App Secret 后重试同步。');
  if (['99991672', '91403'].includes(code)) return syncFailure(`飞书应用无权读取项目表（${code}），请检查目标表授权和应用权限。`);
  return syncFailure(`项目数据同步未完成${/^\d{1,10}$/.test(code) ? `（${code}）` : ''}，请稍后手动重试；如持续失败，请检查应用配置和服务器网络。`);
}
export async function fetchBasePlan() {
  const args = [
    'base',
    '+record-list',
    '--as',
    'bot',
    '--base-token',
    BASE_TOKEN,
    '--table-id',
    TABLE_ID,
    '--limit',
    '200',
    '--format',
    'json',
  ];

  FIELD_NAMES.forEach((field) => {
    args.push('--field-id', field);
  });

  const records = [];
  let offset = 0;
  let revision;
  for (let page = 0; page < 50; page++) {
    let stdout;
    try {
      ({ stdout } = await runLarkCli([...args, '--offset', String(offset)]));
    } catch (error) {
      stdout = error.stdout || error.stderr;
      if (!stdout) throw syncFailure('项目数据同步未完成，请检查服务器网络和应用配置后重试。');
    }

    let envelope;
    try {
      envelope = JSON.parse(stdout);
    } catch {
      throw syncFailure('项目同步返回格式不兼容，请检查服务器飞书 CLI 配置。');
    }

    if (!envelope.ok) throw applicationFailure(envelope);

    const data = envelope.data;
    if (!Array.isArray(data?.fields) || !Array.isArray(data?.data)
      || !data.fields.some(name => name === '任务详情' || name.endsWith('（任务详情）'))
      || data.data.some(row => !Array.isArray(row) || row.length !== data.fields.length)) {
      throw syncFailure('项目同步返回的数据结构不完整，请核对泰国任务表字段。');
    }
    if (revision !== undefined && revision !== data.rev) throw syncFailure('同步期间源表发生变化，请重新同步以获取完整数据。');
    revision = data.rev;
    records.push(...normalizeRecords(envelope));
    if (!data.has_more) return buildPlan(records);
    if (!data.data.length) throw syncFailure('项目同步分页未前进，请稍后重试。');
    offset += data.data.length;
  }
  throw syncFailure('项目任务超过单次同步上限，未返回不完整数据。');
}
