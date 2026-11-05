import { BaseAdapter } from '../../research/adapter.mjs';
import { baseToken,source,failure } from './model.mjs';
export class StaffingAdapter{
 constructor(config){this.config=config;this.base=new BaseAdapter({baseToken});}
 async api(method,route,body){const url=new URL(route,'https://open.feishu.cn');const params=Object.fromEntries(url.searchParams);return this.base.cli(method,[url.pathname,...(Object.keys(params).length?['--params',JSON.stringify(params)]:[]),...(body?['--data',JSON.stringify(body)]:[]),...(process.env.STAFFING_CLI_PROFILE?['--profile',process.env.STAFFING_CLI_PROFILE]:[])],process.cwd(),'api');}
 endpoint(){if(!/^tbl\w+$/.test(this.config?.table||''))throw failure('人员储备表尚未配置，请先完成建表。',503);return `/open-apis/bitable/v1/apps/${baseToken}/tables/${this.config.table}/records`;}
 async all(route){const rows=[];let token='';for(let i=0;i<100;i++){const data=await this.api('GET',route+(route.includes('?')?'&':'?')+'page_size=500'+(token?'&page_token='+encodeURIComponent(token):''));if(data.total===0&&!data.has_more&&!data.items)return rows;if(!Array.isArray(data.items))throw failure('飞书返回记录格式不完整。',503);rows.push(...data.items);if(!data.has_more)return rows;if(!data.page_token||data.page_token===token)throw failure('飞书分页未前进。',503);token=data.page_token;}throw failure('来源超过单次读取上限。',503);}
 list(){return this.all(this.endpoint());}
 async get(id){const data=await this.api('GET',this.endpoint()+'/'+encodeURIComponent(id));if(!data.record)throw failure('人员记录不存在。',404);return data.record;}
 async create(patch){const data=await this.api('POST',this.endpoint(),{fields:patch});if(!data.record?.record_id)throw failure('创建回执缺少记录ID，需先回读核对。',503);return data.record.record_id;}
 update(id,patch){return this.api('PUT',this.endpoint()+'/'+encodeURIComponent(id),{fields:patch});}
 async sheet(id,range){const data=await this.api('GET',`/open-apis/sheets/v2/spreadsheets/${source.workbook}/values/${id}!${range}?valueRenderOption=FormattedValue&dateTimeRenderOption=FormattedString`);if(!Array.isArray(data.valueRange?.values))throw failure('电子表格读取不完整。',503);return data.valueRange.values;}
 async sources(){const records=await this.all(`/open-apis/bitable/v1/apps/${source.base}/tables/${source.table}/records?view_id=${source.view}`);const sheet=await this.sheet(source.sheet,'A1:H200');const demand=await this.sheet('0qUPdb','A1:F8');const positions=await this.sheet('IjVJOZ','A1:U100');return {records,sheet,demand,positions};}
}
