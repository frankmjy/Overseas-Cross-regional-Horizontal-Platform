import path from 'node:path';
import {BaseAdapter} from '../research/adapter.mjs';
import {readJson,saveJson,failure} from './storage.mjs';

export function readableMarkdown(content){
 return String(content).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<cite\b[^>]*user-name="([^"]*)"[^>]*>(?:[\s\S]*?)<\/cite>/gi,(_,name)=>name+'、').replace(/<\/(?:p|h[1-6]|blockquote|title)>/gi,'\n\n').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/\n{4,}/g,'\n\n\n').trim();
}
export class MinutesService{
 constructor({dir,config,records,adapter=new BaseAdapter(config),now=Date.now}){this.file=path.join(dir,'minutes.json');this.host=new URL(config.baseUrl).hostname;this.records=records;this.adapter=adapter;this.now=now;this.cache=readJson(this.file,{version:1,documents:{}});if(this.cache.version!==1||!this.cache.documents)throw Error('纪要缓存无法读取。');this.running=new Map();this.errors=new Map();}
 link(id){const record=this.records().find(m=>m.id===id);if(!record)throw failure('会议记录不存在。',404);const url=record.links.find(l=>l.label==='会议纪要')?.url;if(!url)throw failure('该会议尚未关联纪要。',404);const parsed=new URL(url);if(parsed.hostname!==this.host||parsed.protocol!=='https:'||parsed.username||parsed.password||!/^\/(docx|wiki)\/[A-Za-z0-9]+\/?$/.test(parsed.pathname)||parsed.search||parsed.hash)throw failure('该纪要链接暂不支持内嵌阅读，请打开原文。',422);return parsed.href;}
 read(id,refresh=false){const url=this.link(id),cached=this.cache.documents[url];if(!this.running.has(url)&&(refresh||!cached||this.now()-cached.updatedAt>300000)&&(!this.errors.has(url)||refresh))this.fetch(url);return {state:this.errors.has(url)?'error':cached?'ready':'loading',content:cached?.content||'',updatedAt:cached?.updatedAt||null,refreshing:this.running.has(url),error:this.errors.get(url)||''};}
 fetch(url){this.errors.delete(url);const run=(async()=>{try{const data=await this.adapter.cli('+fetch',['--doc',url,'--doc-format','markdown','--detail','simple'],process.cwd(),'docs');if(typeof data.document?.content!=='string'||!data.document.content.trim())throw Error('纪要正文为空。');if(data.document.content.length>300000)throw Error('纪要篇幅超过内嵌阅读上限，请打开原文。');const next=structuredClone(this.cache);next.documents[url]={content:readableMarkdown(data.document.content),updatedAt:this.now()};saveJson(this.file,next);this.cache=next;}catch{this.errors.set(url,'纪要正文暂未读取成功，请重试或查看原文。');}})().finally(()=>this.running.delete(url));this.running.set(url,run);return run;}
 async close(){await Promise.allSettled(this.running.values());}
}
