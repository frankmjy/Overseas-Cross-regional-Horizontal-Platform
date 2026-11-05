import fs from 'node:fs';
import path from 'node:path';
import {writeAtomic} from '../research/service.mjs';
import {authError} from './service.mjs';
const text=value=>typeof value==='string'?value.slice(0,1000):'';
const day=value=>{const n=Date.parse(value);return Number.isFinite(n)?new Date(n+8*3600_000).toISOString().slice(0,10):'';};
const project=row=>({id:text(row.id),name:text(row.name),openId:text(row.openId),loginTime:text(row.loginTime)||null,logoutTime:text(row.logoutTime)||null,entryPage:text(row.entryPage),method:text(row.method)});
export class LoginAuditReader{
  constructor({dir,sink,auth,now=Date.now}){
    this.file=path.join(dir,'admin-audit-cache.json');this.sink=sink;this.auth=auth;this.now=now;this.rows=[];this.updatedAt=null;this.error='';this.lastAttempt=null;this.bound=this.binding();
    if(fs.existsSync(this.file)){try{const cache=JSON.parse(fs.readFileSync(this.file,'utf8'));if(cache.binding===this.bound&&Array.isArray(cache.rows)){this.rows=cache.rows.map(project);this.updatedAt=cache.updatedAt;}}catch{this.error='登录记录缓存读取失败，请刷新。';}}
  }
  binding(){return JSON.stringify([this.auth.config().appId,this.sink.config.baseToken,this.sink.config.tableId]);}
  refresh(){
    if(this.refreshing)return this.refreshing;
    const binding=this.binding();this.lastAttempt=this.now();
    this.refreshing=(async()=>{const rows=(await this.sink.list()).map(project);if(binding!==this.binding())return;const updatedAt=new Date(this.now()).toISOString();writeAtomic(this.file,{binding,updatedAt,rows});this.rows=rows;this.updatedAt=updatedAt;this.error='';})().catch(()=>{if(binding===this.binding())this.error='飞书登录记录读取失败，请重试。';}).finally(()=>{this.refreshing=null;});
    return this.refreshing;
  }
  read(params=new URLSearchParams()){
    if(this.bound!==this.binding()){this.bound=this.binding();this.rows=[];this.updatedAt=null;this.lastAttempt=null;this.error='';}
    if(!this.refreshing&&(params.get('refresh')==='1'||this.lastAttempt===null||this.now()-this.lastAttempt>60000))this.refresh();
    const merged=new Map(this.rows.map(row=>[row.id,{...row,syncStatus:'synced'}]));
    for(const event of Object.values(this.auth.state.events)){if(event.appId&&event.appId!==this.auth.config().appId)continue;const row=project({...event,name:event.user?.name,openId:event.user?.openId});if(row.id)merged.set(row.id,{...row,openId:merged.get(row.id)?.openId||row.openId,syncStatus:event.syncStatus==='synced'?'synced':'pending'});}
    const all=[...merged.values()].sort((a,b)=>(Date.parse(b.loginTime)||0)-(Date.parse(a.loginTime)||0)||a.id.localeCompare(b.id));
    const summary={logins:all.length,people:new Set(all.map(row=>row.openId).filter(Boolean)).size,today:all.filter(row=>day(row.loginTime)===day(new Date(this.now()).toISOString())).length,pending:all.filter(row=>row.syncStatus==='pending').length};
    const q=(params.get('q')||'').trim().toLocaleLowerCase().slice(0,120),from=params.get('from')||'',to=params.get('to')||'',sync=params.get('status')||'';
    if([from,to].some(value=>value&&!/^\d{4}-\d{2}-\d{2}$/.test(value))||from&&to&&from>to)throw authError('日期范围无效。');
    const filtered=all.filter(row=>(!q||[row.name,row.entryPage,row.method].some(value=>value.toLocaleLowerCase().includes(q)))&&(!from||day(row.loginTime)>=from)&&(!to||day(row.loginTime)&&day(row.loginTime)<=to)&&(!['pending','synced'].includes(sync)||row.syncStatus===sync));
    const wanted=Number(params.get('pageSize')),pageSize=[10,25,50,100].includes(wanted)?wanted:25,pages=Math.max(1,Math.ceil(filtered.length/pageSize)),page=Math.min(pages,Math.max(1,Math.floor(Number(params.get('page'))||1)));
    return {ok:true,state:this.error?(this.updatedAt?'partial':'error'):this.updatedAt?'ready':this.refreshing?'loading':'idle',refreshing:!!this.refreshing,updatedAt:this.updatedAt,error:this.error,summary,total:filtered.length,page,pageSize,pages,sourceUrl:`https://vnet.feishu.cn/base/${encodeURIComponent(this.sink.config.baseToken)}?table=${encodeURIComponent(this.sink.config.tableId)}`,records:filtered.slice((page-1)*pageSize,page*pageSize).map(({openId,...row})=>row)};
  }
  identities(){return this.bound===this.binding()?this.rows.filter(r=>r.openId).map(({name,openId,loginTime})=>({name,openId,loginTime})):[];}
  async close(){await this.refreshing;}
}
