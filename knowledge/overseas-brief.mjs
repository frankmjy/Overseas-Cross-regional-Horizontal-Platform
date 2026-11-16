import {BaseAdapter} from '../research/adapter.mjs';
import {normalizeRows} from '../research/service.mjs';
import {editableDocumentLink, editableText} from './model.mjs';

const chinaDay = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'});
const fields = ['新闻标题', '新闻简介', '原文链接', '展示日期', '消息来源', '地区', '展示状态', '展示顺序', '英文标题', '英文简介'];
const refreshInterval = 15 * 60000;
const compact = (value, max) => editableText(value).replace(/\s+/gu, ' ').trim().slice(0, max);

function displayDay(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const time = typeof value === 'number' ? value : Date.parse(String(value ?? ''));
  return Number.isFinite(time) ? chinaDay.format(time) : '';
}

export function selectOverseasBrief(rows, day) {
  const entries = rows.flatMap(row => {
    const title = compact(row.新闻标题, 120);
    const summary = compact(row.新闻简介, 240);
    const url = editableDocumentLink(row.原文链接)?.url;
    if (displayDay(row.展示日期) !== day || compact(row.展示状态, 20) !== '公开展示' || !title || !summary || !url) return [];
    return [{order: Number.isFinite(row.展示顺序) ? row.展示顺序 : Infinity, item: {
      title, summary, url, source: compact(row.消息来源, 48), region: compact(row.地区, 24),
      titleEn: compact(row.英文标题, 120), summaryEn: compact(row.英文简介, 240),
    }}];
  });
  const seen = new Set();
  return entries.sort((a, b) => a.order - b.order).flatMap(({item}) => {
    if (seen.has(item.url)) return [];
    seen.add(item.url);
    return [item];
  }).slice(0, 3);
}

export function createOverseasBrief({config, now = Date.now, isPaused = () => false, readRows, log = console}) {
  const base = config && new BaseAdapter(config);
  const read = readRows || (async () => {
    const rows = [];
    for (let offset = 0; offset < 20000;) {
      const page = await base.cli('+record-list', ['--table-id', config.overseasBriefTable, '--limit', '200', '--offset', String(offset), '--format', 'json', ...fields.flatMap(field => ['--field-id', field])]);
      if (fields.some(field => !page.fields?.includes(field))) throw Error('海外速览字段配置不匹配。');
      const batch = normalizeRows(page);
      rows.push(...batch);
      if (!page.has_more) return rows;
      if (!batch.length) break;
      offset += batch.length;
    }
    throw Error('海外速览分页未完整读取。');
  });
  let cached, running, timer, closed = false, lastManual;
  function snapshot() {
    const time = now(), day = chinaDay.format(time);
    return cached?.day === day && time - cached.time <= refreshInterval * 2
      ? {day, items: cached.items, state: 'ready'} : {day, items: [], state: 'unavailable'};
  }
  function refresh() {
    if (running) return running;
    if (closed || isPaused()) return Promise.resolve();
    const day = chinaDay.format(now());
    running = Promise.resolve().then(() => read(day)).then(rows => {
      cached = {day, items: selectOverseasBrief(rows, day), time: now()};
    }).finally(() => { running = null; });
    return running;
  }
  function start() {
    if (timer || closed) return;
    const tick = () => {
      refresh().catch(() => log.error('[overseas-brief] Refresh failed.'));
      timer = setTimeout(tick, refreshInterval - now() % refreshInterval);
      timer.unref();
    };
    tick();
  }
  function refreshOnDemand() {
    if (closed || isPaused()) return Promise.reject(Error('海外速览同步暂停。'));
    const time=now();
    if (lastManual && time-lastManual.time<5000) return lastManual.result;
    const result=refresh().then(snapshot);
    lastManual={time,result};
    return result;
  }
  return {snapshot, refresh, refreshOnDemand, start, async close() { closed = true; clearTimeout(timer); await running?.catch(() => {}); }};
}
