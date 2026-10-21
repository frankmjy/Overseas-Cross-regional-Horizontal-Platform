import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { normalizeRows, companies } from './service.mjs';
import { canonicalFieldName, normalizeRecord, encodeFields } from './field-names.mjs';

const exec = promisify(execFile);
export class BaseAdapter {
  constructor(config) { this.config = config; this.subjectLabels={};this.subjectAliases=new Map(companies.map(c=>[c.name,c.name])); }
  setSubjectLabels(labels){for(const [key,value]of Object.entries(labels||{})){this.subjectLabels[key]=value;this.subjectAliases.set(value,key);}}
  resetSubjectLabels(labels){this.subjectLabels={};this.subjectAliases=new Map(companies.map(c=>[c.name,c.name]));this.setSubjectLabels(labels);}
  normalizeSubjects(table,rows){
    const text=v=>Array.isArray(v)?text(v[0]):v==null?'':typeof v==='object'?v.text||v.name||'':String(v);
    if(table==='findings'){
      const labels=new Map();
      for(const row of rows){const key=companies.find(c=>text(row.明细编号).endsWith(':'+c.name))?.name,label=text(row.调研对象);if(!key||!label)continue;if(this.subjectAliases.has(label)&&this.subjectAliases.get(label)!==key)throw Error('调研对象名称存在冲突，请核对正式明细。');this.subjectAliases.set(label,key);if(!labels.has(key))labels.set(key,new Set());labels.get(key).add(label);}
      for(const [key,values]of labels)this.subjectLabels[key]=values.has(this.subjectLabels[key])?this.subjectLabels[key]:[...values][0];
    }
    if(['findings','evidence'].includes(table))for(const row of rows){const label=text(row.调研对象),key=this.subjectAliases.get(label);if(key){row.__subjectLabel=label;row.调研对象=key;}}
    return rows;
  }
  writeFields(fields,literalSubject=false){return encodeFields({...fields,...(!literalSubject&&Object.hasOwn(fields,'调研对象')?{调研对象:this.subjectLabels[fields.调研对象]||fields.调研对象}:{})},{});}
  async cli(command, args = [], cwd = process.cwd(), domain = 'base') {
    const configured = process.env.LARK_CLI_SCRIPT;
    const installed = path.join(path.dirname(process.execPath), 'node_modules/@larksuite/cli/scripts/run.js');
    const vendor = path.resolve('vendor/lark-cli/run.cjs');
    const script = path.resolve(configured || (existsSync(vendor) ? vendor : installed));
    if (!existsSync(script)) throw new Error('飞书 CLI 未安装，请运行项目依赖预检。');
    let stdout;
    try {
      ({ stdout } = await exec(process.execPath, [script, domain, command, ...(domain === 'base' ? ['--base-token', this.config.baseToken] : []), ...args, '--as', 'bot', '--jq', '.'], { cwd, windowsHide: true, timeout: 90000, maxBuffer: 20 * 1024 * 1024, encoding: 'utf8' }));
    } catch (error) {
      stdout = error.stdout || error.stderr;
      if (!stdout) throw new Error('飞书应用请求未完成，请检查服务器网络、应用配置及权限；写入结果将先核对再重试。');
    }
    let result;
    try { result = JSON.parse(stdout); } catch { throw new Error('飞书 CLI 返回格式不兼容，请执行部署预检。'); }
    if (domain === 'api' && result.code === 0) return result.data;
    if (!result.ok) {
      if (result.error?.type === 'validation') throw new Error('飞书 CLI 参数或路径不受支持，请执行部署预检。');
      const code = result.error?.code ?? result.code ?? /\[(\d+)\]/.exec(result.error?.message || '')?.[1];
      if (String(code) === '10014') throw new Error('飞书应用凭据无效（10014），请在“应用配置”中更新 App Secret 后重试同步。');
      if (!code) throw new Error('飞书应用请求未完成，请稍后手动同步；如持续失败，请检查服务器网络和飞书服务状态。');
      const reason = ['99991672', '91403'].includes(String(code)) ? '请检查目标表授权、应用权限和发布状态。' : '请稍后重试同步；如持续失败，请核对服务端错误码。';
      throw new Error(`飞书应用请求失败（${String(code).replace(/[^\w-]/g, '').slice(0, 40)}），${reason}`);
    }
    return result.data;
  }
  table(table) { return this.config.tables[table]; }
  async ensureDeletionField() {
    const read = async () => (await this.cli('+field-list', ['--table-id', this.table('questions')])).fields.filter(field => canonicalFieldName(field.name) === '已删除');
    let fields = await read();
    if (!fields.length) {
      await this.cli('+field-create', ['--table-id', this.table('questions'), '--json', JSON.stringify({ name: '已删除', type: 'checkbox' })]);
      fields = await read();
    }
    if (fields.length !== 1 || fields[0].type !== 'checkbox') throw new Error('飞书“已删除”字段缺失、重名或类型不兼容，请核对字段配置。');
  }
  async recordUrl(recordId) {
    const data = await this.cli('GET', [`/open-apis/bitable/v1/apps/${this.config.baseToken}/tables/${this.table('evidence')}/records/${recordId}`, '--params', JSON.stringify({ with_shared_url: true })], process.cwd(), 'api');
    const url = data.record?.record_url;
    if (!url) throw new Error('飞书未返回此附件记录的阅览链接。');
    return url;
  }
  async list(table) {
    const all = []; let offset = 0;
    for (let page = 0; page < 100; page++) {
      const data = await this.cli('+record-list', ['--table-id', this.table(table), '--limit', '200', '--offset', String(offset), '--format', 'json']);
      const rows = normalizeRows(data).map(row => normalizeRecord(row, this.config.fieldIds?.[table])); all.push(...rows);
      if (!data.has_more) return this.normalizeSubjects(table,all);
      if (!rows.length) throw new Error('飞书分页没有前进，已停止读取。');
      offset += rows.length;
    }
    throw new Error('飞书数据超过本应用单次读取上限，未返回不完整数据。');
  }
  async create(table, fields) {
    const data = await this.cli('+record-upsert', ['--table-id', this.table(table), '--json', JSON.stringify(encodeFields(this.writeFields(fields), this.config.fieldIds?.[table]))]);
    const id = data.record?.record_id_list?.[0];
    if (!id) throw new Error('飞书创建结果未包含记录 ID，需先核对同步结果。');
    return id;
  }
  async update(table, id, fields,{literalSubject=false}={}) {
    await this.cli('+record-upsert', ['--table-id', this.table(table), '--record-id', id, '--json', JSON.stringify(encodeFields(this.writeFields(fields,literalSubject), this.config.fieldIds?.[table]))]);
  }
  async upload(recordId, file) {
    await this.cli('+record-upload-attachment', ['--table-id', this.table('evidence'), '--record-id', recordId, '--field-id', this.config.fieldIds?.evidence?.附件 || '附件', '--file', path.basename(file)], path.dirname(path.resolve(file)));
  }
  async download(recordId, token, file) {
    await this.cli('+record-download-attachment', ['--table-id', this.table('evidence'), '--record-id', recordId, '--file-token', token, '--output', path.basename(file)], path.dirname(path.resolve(file)));
  }
}
