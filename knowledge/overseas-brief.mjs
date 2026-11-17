import {BaseAdapter} from '../research/adapter.mjs';
import {normalizeRows} from '../research/service.mjs';
import {editableDocumentLink, editableText} from './model.mjs';

const chinaDay = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'});
const fields = ['新闻标题', '新闻简介', '原文链接', '展示日期', '消息来源', '地区', '展示状态', '展示顺序', '英文标题', '英文简介'];
const refreshInterval = 15 * 60000;
const compact = (value, max) => editableText(value).replace(/\s+/gu, ' ').trim().slice(0, max);
const regionGroups = {
  southeastAsia: '东南亚 泰国 马来西亚 马来 新加坡 印尼 印度尼西亚 越南 菲律宾 柬埔寨 老挝 缅甸 文莱 东帝汶 ASEAN',
  middleEast: '中东 海湾 阿联酋 沙特 沙特阿拉伯 卡塔尔 科威特 巴林 阿曼 以色列 约旦 伊拉克 伊朗 土耳其 埃及',
  europe: '欧洲 欧盟 英国 德国 法国 荷兰 爱尔兰 西班牙 葡萄牙 意大利 瑞士 奥地利 比利时 卢森堡 瑞典 挪威 芬兰 丹麦 冰岛 波兰 捷克 希腊 罗马尼亚 匈牙利 塞尔维亚',
  japanKorea: '日韩 日本 韩国 南韩',
  americas: '美洲 北美 南美 拉美 拉丁美洲 美国 加拿大 墨西哥 巴西 智利 阿根廷 哥伦比亚 秘鲁 乌拉圭',
  china: '中国 中国大陆 中国内地 中国香港 中国澳门 中国台湾 香港 澳门 台湾 大中华区',
};
const regionAliases = new Map(Object.entries(regionGroups).flatMap(([key, names]) => names.split(' ').map(name => [name, key])));

function displayDay(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const time = typeof value === 'number' ? value : Date.parse(String(value ?? ''));
  return Number.isFinite(time) ? chinaDay.format(time) : '';
}

function publishedEntries(rows) {
  const entries = rows.flatMap(row => {
    const title = compact(row.新闻标题, 120);
    const summary = compact(row.新闻简介, 240);
    const url = editableDocumentLink(row.原文链接)?.url;
    const day = displayDay(row.展示日期);
    if (!day || compact(row.展示状态, 20) !== '公开展示' || !title || !summary || !url) return [];
    const region = compact(Array.isArray(row.地区) ? row.地区.map(editableText).join(' / ') : row.地区, 64);
    const regions = [...new Set(region.split(/[\s/／、，,;；|＋+]+/u).map(name => regionAliases.get(name)).filter(Boolean))];
    return [{order: Number.isFinite(row.展示顺序) ? row.展示顺序 : Infinity, item: {
      day, title, summary, url, source: compact(row.消息来源, 48), region, regions,
      titleEn: compact(row.英文标题, 120), summaryEn: compact(row.英文简介, 240),
    }}];
  });
  return entries.sort((a, b) => b.item.day.localeCompare(a.item.day) || a.order - b.order).map(({item}) => item);
}

function entriesInRange(entries, day, days) {
  const start = new Date(Date.parse(day) - (days - 1) * 86400000).toISOString().slice(0, 10);
  const seen = new Set();
  return entries.filter(item => {
    if (item.day < start || item.day > day || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

export function selectOverseasBrief(rows, day, days = 1) {
  return entriesInRange(publishedEntries(rows), day, days);
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
  function snapshot(days = 1) {
    const time = now(), day = chinaDay.format(time);
    return cached?.day === day && time - cached.time <= refreshInterval * 2
      ? {day, items: entriesInRange(cached.entries, day, days), state: 'ready'} : {day, items: [], state: 'unavailable'};
  }
  function refresh() {
    if (running) return running;
    if (closed || isPaused()) return Promise.resolve();
    const day = chinaDay.format(now());
    running = Promise.resolve().then(() => read(day)).then(rows => {
      cached = {day, entries: publishedEntries(rows), time: now()};
    }).finally(() => { running = null; });
    return running;
  }
  function start() {
    if (timer || closed) return;
    const tick = () => {
      const paused=isPaused();
      if (!paused) refresh().catch(() => log.error('[overseas-brief] Refresh failed.'));
      timer = setTimeout(tick, paused ? 5000 : refreshInterval - now() % refreshInterval);
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
